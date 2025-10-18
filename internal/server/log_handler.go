package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	"dendrite/internal/auth"
	"dendrite/internal/filesystem"
)

// LogViewRequest represents the request for viewing log content
type LogViewRequest struct {
	Lines         int    `json:"lines"`
	Search        string `json:"search"`
	CaseSensitive bool   `json:"caseSensitive"`
	Regex         bool   `json:"regex"`
}

// LogViewResponse represents the response with log content
type LogViewResponse struct {
	Content string `json:"content"`
	Lines   int    `json:"lines"`
}

// WSMessage represents a WebSocket message
type WSMessage struct {
	Type  string `json:"type"`
	Token string `json:"token,omitempty"`
	Data  string `json:"data,omitempty"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool {
		// In production, implement proper origin checking
		return true
	},
}

// LogFollower represents an active WebSocket connection for log following
type LogFollower struct {
	conn     *websocket.Conn
	send     chan []byte
	filePath string
	search   string
	caseSens bool
	regex    bool
	stop     chan bool
}

var (
	followers   = make(map[*LogFollower]bool)
	followersMu sync.RWMutex
)

func ensureLogFileExtension(w http.ResponseWriter, filePath string) bool {
	if !strings.HasSuffix(strings.ToLower(filePath), ".log") {
		http.Error(w, "Only .log files can be viewed", http.StatusBadRequest)
		return false
	}
	return true
}

// serveLogView handles REST API requests for log viewing
func (s *Server) serveLogView(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filePath := vars["path"]

	if !ensureLogFileExtension(w, filePath) {
		return
	}

	// Get filesystem manager with JWT restrictions
	fs, err := s.getFilesystemForRequest(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusForbidden)
		return
	}

	// Get the actual file path
	actualPath, err := fs.GetFilePath(filePath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Parse request parameters
	lines := 150 // default
	if l := r.URL.Query().Get("lines"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			lines = parsed
		}
	}

	search := r.URL.Query().Get("search")
	caseSensitive := r.URL.Query().Get("caseSensitive") == "true"
	regexSearch := r.URL.Query().Get("regex") == "true"

	// Read log file content
	content, err := s.readLogContent(actualPath, lines, search, caseSensitive, regexSearch)
	if err != nil {
		http.Error(w, fmt.Sprintf("Error reading log file: %v", err), http.StatusInternalServerError)
		return
	}

	response := LogViewResponse{
		Content: content,
		Lines:   lines,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Error encoding response: %v", err)
	}
}

// readLogContent reads the last N lines from a log file with optional filtering
func (s *Server) readLogContent(filePath string, lines int, search string,
	caseSensitive bool, regex bool) (string, error) {
	var logLines []string
	var err error

	if search != "" {
		// When filtering is requested, read entire file, filter, then get last N lines
		logLines, err = readFilteredLastNLines(filePath, lines, search, caseSensitive, regex)
		if err != nil {
			return "", err
		}
	} else {
		// No filtering, just read last N lines efficiently
		logLines, err = readLastNLines(filePath, lines)
		if err != nil {
			return "", err
		}
	}

	// Join lines with newlines
	return strings.Join(logLines, "\n"), nil
}

// serveLogFollow handles WebSocket connections for real-time log following
func (s *Server) serveLogFollow(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filePath := vars["path"]

	if !ensureLogFileExtension(w, filePath) {
		return
	}

	// Upgrade to WebSocket
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		http.Error(w, "Failed to upgrade to WebSocket", http.StatusInternalServerError)
		return
	}
	defer func() {
		if err := conn.Close(); err != nil {
			log.Printf("Error closing connection: %v", err)
		}
	}()

	// Create log follower
	follower := &LogFollower{
		conn: conn,
		send: make(chan []byte, 256),
		stop: make(chan bool),
	}

	// Handle WebSocket authentication if JWT is enabled
	if s.Config.JWTSecret != "" {
		authenticated := s.authenticateWebSocket(follower)
		if !authenticated {
			if err := conn.WriteJSON(WSMessage{Type: "error", Data: "Authentication failed"}); err != nil {
				log.Printf("Error writing authentication error: %v", err)
			}
			return
		}
	}

	// Get filesystem manager with JWT restrictions
	var fs *filesystem.Manager
	if s.Config.JWTSecret != "" {
		// For WebSocket, we need to extract JWT from the first message
		// This was validated in authenticateWebSocket
		fs = s.FS // Use the authenticated filesystem
	} else {
		fs = s.FS
	}

	// Get the actual file path
	actualPath, err := fs.GetFilePath(filePath)
	if err != nil {
		if err := conn.WriteJSON(WSMessage{Type: "error", Data: "File not found"}); err != nil {
			log.Printf("Error writing file not found error: %v", err)
		}
		return
	}

	follower.filePath = actualPath

	// Parse parameters from query string
	follower.search = r.URL.Query().Get("search")
	follower.caseSens = r.URL.Query().Get("caseSensitive") == "true"
	follower.regex = r.URL.Query().Get("regex") == "true"

	// Debug logging
	log.Printf("WebSocket follow started - search: %q, caseSensitive: %v, regex: %v",
		follower.search, follower.caseSens, follower.regex)

	// Register follower
	followersMu.Lock()
	followers[follower] = true
	followersMu.Unlock()

	// Start following the log file
	go follower.followLog()

	// Handle incoming messages (for stopping, etc.)
	follower.readPump()

	// Cleanup
	followersMu.Lock()
	delete(followers, follower)
	followersMu.Unlock()
}

// authenticateWebSocket handles JWT authentication for WebSocket connections
func (s *Server) authenticateWebSocket(follower *LogFollower) bool {
	// Set read deadline for auth message
	if err := follower.conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		log.Printf("Error setting read deadline: %v", err)
	}

	var msg WSMessage
	err := follower.conn.ReadJSON(&msg)
	if err != nil {
		return false
	}

	// Reset read deadline
	if err := follower.conn.SetReadDeadline(time.Time{}); err != nil {
		log.Printf("Error clearing read deadline: %v", err)
	}

	if msg.Type != "auth" || msg.Token == "" {
		return false
	}

	// Validate JWT token
	claims, err := auth.ValidateJWTString(msg.Token, s.Config.JWTSecret)
	if err != nil {
		return false
	}

	// Check if token has required permissions
	if len(claims.Directories) == 0 {
		return false
	}

	// Send success message
	if err := follower.conn.WriteJSON(WSMessage{Type: "authenticated"}); err != nil {
		log.Printf("Error writing authenticated message: %v", err)
	}
	return true
}

// followLog tails the log file and sends updates via WebSocket
func (lf *LogFollower) followLog() {
	// Create file follower
	follower, err := NewFileFollower(lf.filePath)
	if err != nil {
		if err := lf.conn.WriteJSON(WSMessage{Type: "error", Data: fmt.Sprintf("Error opening file: %v", err)}); err != nil {
			log.Printf("Error writing file open error: %v", err)
		}
		return
	}
	defer func() {
		if err := follower.Close(); err != nil {
			log.Printf("Error closing file follower: %v", err)
		}
	}()

	// Read lines and send to WebSocket
	go func() {
		for {
			select {
			case <-lf.stop:
				return
			default:
				line, err := follower.ReadLine()
				if err != nil {
					if errors.Is(err, io.EOF) {
						// No new data, wait a bit
						time.Sleep(100 * time.Millisecond)
						continue
					}
					log.Printf("Error reading line: %v", err)
					return
				}

				if line == "" {
					continue
				}

				// Apply filter if specified
				if lf.search != "" {
					matches, err := filterLines([]string{line}, lf.search, lf.caseSens, lf.regex)
					if err != nil {
						// Log regex compilation errors but continue
						log.Printf("Error filtering line: %v", err)
						continue
					}
					if len(matches) == 0 {
						continue // Line doesn't match filter
					}
				}

				// Send line to WebSocket
				msg := WSMessage{
					Type: "log",
					Data: line,
				}
				if data, err := json.Marshal(msg); err == nil {
					if err := lf.conn.WriteMessage(websocket.TextMessage, data); err != nil {
						log.Printf("Error writing log message: %v", err)
						return
					}
				}
			}
		}
	}()

	// Wait for stop signal
	<-lf.stop
}

// readPump handles incoming WebSocket messages
func (lf *LogFollower) readPump() {
	defer func() {
		close(lf.stop)
		if err := lf.conn.Close(); err != nil {
			log.Printf("Error closing connection in readPump: %v", err)
		}
	}()

	if err := lf.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
		log.Printf("Error setting initial read deadline: %v", err)
	}
	lf.conn.SetPongHandler(func(string) error {
		if err := lf.conn.SetReadDeadline(time.Now().Add(60 * time.Second)); err != nil {
			log.Printf("Error setting read deadline in pong handler: %v", err)
		}
		return nil
	})

	for {
		var msg WSMessage
		err := lf.conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// Handle stop message
		if msg.Type == "stop" {
			break
		}
	}
}
