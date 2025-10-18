// Package server handles HTTP routing and request processing.
package server

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/mux"

	"dendrite/internal/assets"
	"dendrite/internal/auth"
	"dendrite/internal/config"
	"dendrite/internal/filesystem"
)

// Server represents the HTTP server
type Server struct {
	Config *config.Config
	FS     *filesystem.Manager
	Router *mux.Router
	webFS  fs.FS
}

// New creates a new server instance
func New(cfg *config.Config) *Server {
	webFS, err := assets.WebFS()
	if err != nil {
		panic("Failed to load embedded web assets: " + err.Error())
	}

	// In JWT mode, we don't set up any directories - they come from the JWT
	var fs *filesystem.Manager
	if cfg.JWTSecret != "" {
		// Create empty filesystem manager for JWT mode
		// Actual directories will be created per-request based on JWT claims
		fs = nil
	} else {
		// Non-JWT mode: use configured directories
		fs = filesystem.New(cfg)
	}

	s := &Server{
		Config: cfg,
		FS:     fs,
		Router: mux.NewRouter(),
		webFS:  webFS,
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	// API routes
	api := s.Router.PathPrefix("/api").Subrouter()

	// Apply JWT middleware if JWT secret is configured
	if s.Config.JWTSecret != "" {
		api.Use(auth.JWTMiddleware(s.Config.JWTSecret))
	}

	api.HandleFunc("/files", s.listFiles).Methods("GET")
	api.HandleFunc("/files", s.uploadFile).Methods("POST")
	api.HandleFunc("/files/{path:.+}/stat", s.statFile).Methods("GET")
	api.HandleFunc("/files/{path:.+}/exif", s.getFileExif).Methods("GET")
	api.HandleFunc("/files/{path:.+}/move", s.moveFile).Methods("POST")
	api.HandleFunc("/files/{path:.+}/copy", s.copyFile).Methods("POST")
	api.HandleFunc("/files/{path:.+}/raw", s.getFileRaw).Methods("GET")
	api.HandleFunc("/files/{path:.+}/raw", s.putFileRaw).Methods("PUT")
	api.HandleFunc("/files/{path:.+}", s.getFile).Methods("GET")
	api.HandleFunc("/files/{path:.+}", s.deleteFile).Methods("DELETE")
	api.HandleFunc("/mkdir", s.createFolder).Methods("POST")
	api.HandleFunc("/download/zip", s.downloadZip).Methods("POST")
	api.HandleFunc("/quota", s.getQuotaInfo).Methods("GET")

	// Log viewer endpoints
	api.HandleFunc("/logs/{path:.+}/view", s.serveLogView).Methods("GET")
	api.HandleFunc("/logs/{path:.+}/follow", s.serveLogFollow)

	// Static files (frontend)
	// Serve static assets from embedded filesystem
	fileServer := http.FileServer(http.FS(s.webFS))
	s.Router.PathPrefix("/css/").Handler(fileServer)
	s.Router.PathPrefix("/js/").Handler(fileServer)
	s.Router.PathPrefix("/lib/").Handler(fileServer)
	s.Router.PathPrefix("/img/").Handler(fileServer)
	s.Router.PathPrefix("/images/").Handler(fileServer)
	s.Router.PathPrefix("/icons/").Handler(fileServer)

	// Serve editor.html for the editor route
	s.Router.Path("/editor.html").HandlerFunc(s.serveEditor)

	// Serve image-editor.html for the image editor route
	s.Router.Path("/image-editor.html").HandlerFunc(s.serveImageEditor)

	// Serve file-viewer.html for the inline viewer route
	s.Router.Path("/file-viewer.html").HandlerFunc(s.serveFileViewer)

	// Serve log-viewer.html for the log viewer route
	s.Router.Path("/log-viewer.html").HandlerFunc(s.serveLogViewer)

	// For all other routes, serve index.html to support client-side routing
	s.Router.PathPrefix("/").HandlerFunc(s.serveIndex)
}

// getFilesystemForRequest returns a filesystem manager with JWT restrictions if applicable
// Returns nil with error if JWT validation fails
func (s *Server) getFilesystemForRequest(r *http.Request) (*filesystem.Manager, error) {
	// If JWT authentication is not enabled, return the default filesystem manager
	if s.Config.JWTSecret == "" {
		return s.FS, nil
	}

	// JWT is enabled - NEVER fall back to default filesystem
	claims, ok := auth.GetClaimsFromContext(r.Context())
	if !ok {
		return nil, fmt.Errorf("no valid JWT claims found")
	}

	if len(claims.Directories) == 0 {
		return nil, fmt.Errorf("JWT token contains no directory permissions")
	}

	// In JWT mode, directories are relative to base_dir
	jwtDirs := make([]config.DirMapping, len(claims.Directories))
	for i, dir := range claims.Directories {
		// Validate directory fields are not empty
		if strings.TrimSpace(dir.Source) == "" {
			return nil, fmt.Errorf("directory mapping has empty 'source' field")
		}
		if strings.TrimSpace(dir.Virtual) == "" {
			return nil, fmt.Errorf("directory mapping has empty 'virtual' field")
		}

		// Resolve relative paths against base directory
		sourcePath := filepath.Join(s.Config.BaseDir, dir.Source)

		// Validate that the resolved path is still within base_dir
		absSource, err := filepath.Abs(sourcePath)
		if err != nil {
			return nil, fmt.Errorf("invalid source path: %w", err)
		}

		// IMPORTANT: Check escape before checking existence
		// This ensures we don't leak information about paths outside base_dir
		if !strings.HasPrefix(absSource, s.Config.BaseDir) {
			return nil, fmt.Errorf("directory path escapes base directory: %s", dir.Source)
		}

		// Check if the directory exists
		info, err := os.Stat(absSource)
		if err != nil {
			if os.IsNotExist(err) {
				return nil, fmt.Errorf("directory not found: %s", dir.Virtual)
			}
			return nil, fmt.Errorf("cannot access directory: %w", err)
		}
		if !info.IsDir() {
			return nil, fmt.Errorf("path is not a directory: %s", dir.Virtual)
		}

		jwtDirs[i] = config.DirMapping{
			Source:  absSource,
			Virtual: dir.Virtual,
		}
	}

	// Create a new filesystem manager with JWT directory restrictions
	return filesystem.NewWithRestriction(s.Config, jwtDirs), nil
}

func (s *Server) serveIndex(w http.ResponseWriter, _ *http.Request) {
	// Serve index.html from embedded filesystem
	indexContent, err := fs.ReadFile(s.webFS, "index.html")
	if err != nil {
		http.Error(w, "Failed to load index.html", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write(indexContent); err != nil {
		http.Error(w, "Failed to write response", http.StatusInternalServerError)
	}
}

func (s *Server) serveEditor(w http.ResponseWriter, _ *http.Request) {
	// Serve monaco-editor.html from embedded filesystem
	editorContent, err := fs.ReadFile(s.webFS, "monaco-editor.html")
	if err != nil {
		http.Error(w, "Failed to load editor", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write(editorContent); err != nil {
		http.Error(w, "Failed to write response", http.StatusInternalServerError)
	}
}

func (s *Server) serveImageEditor(w http.ResponseWriter, _ *http.Request) {
	// Serve image-editor.html from embedded filesystem
	imageEditorContent, err := fs.ReadFile(s.webFS, "image-editor.html")
	if err != nil {
		http.Error(w, "Failed to load image editor", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write(imageEditorContent); err != nil {
		http.Error(w, "Failed to write response", http.StatusInternalServerError)
	}
}

func (s *Server) serveFileViewer(w http.ResponseWriter, _ *http.Request) {
	// Serve file-viewer.html from embedded filesystem
	viewerContent, err := fs.ReadFile(s.webFS, "file-viewer.html")
	if err != nil {
		http.Error(w, "Failed to load file viewer", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write(viewerContent); err != nil {
		http.Error(w, "Failed to write response", http.StatusInternalServerError)
	}
}

func (s *Server) serveLogViewer(w http.ResponseWriter, _ *http.Request) {
	// Serve log-viewer.html from embedded filesystem
	logViewerContent, err := fs.ReadFile(s.webFS, "log-viewer.html")
	if err != nil {
		http.Error(w, "Failed to load log viewer", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if _, err := w.Write(logViewerContent); err != nil {
		http.Error(w, "Failed to write response", http.StatusInternalServerError)
	}
}

func (s *Server) listFiles(w http.ResponseWriter, r *http.Request) {
	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}

	files, err := fs.ListFiles(path)
	if err != nil {
		if handleNotFound(w, err) {
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Ensure we always return an array, never null
	if files == nil {
		files = []filesystem.FileInfo{}
	}

	if err := writeJSON(w, 0, files); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) uploadFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Parse multipart form
	err := r.ParseMultipartForm(32 << 20) // 32 MB max memory
	if err != nil {
		http.Error(w, "Error parsing form: "+err.Error(), http.StatusBadRequest)
		return
	}

	targetPath := r.FormValue("path")
	if targetPath == "" {
		targetPath = "/"
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error reading file: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer func() {
		if cerr := file.Close(); cerr != nil {
			http.Error(w, "Error closing file", http.StatusInternalServerError)
		}
	}()

	// Get filesystem manager with JWT restrictions if applicable
	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	result, err := fs.UploadFile(targetPath, header.Filename, file, header.Size)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := writeJSON(w, 0, result); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) getFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := vars["path"]

	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	filePath, err := fs.GetFilePath(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// Check if it's a directory
	info, err := os.Stat(filePath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if info.IsDir() {
		http.Error(w, "Cannot download directory", http.StatusBadRequest)
		return
	}

	disposition := "attachment"
	inlineParam := r.URL.Query().Get("inline")
	if inlineParam != "" {
		if inlineParam == "1" || strings.EqualFold(inlineParam, "true") {
			disposition = "inline"
		}
	}

	filename := filepath.Base(filePath)
	w.Header().Set("Content-Disposition", fmt.Sprintf("%s; filename=\"%s\"", disposition, filename))

	if disposition == "inline" {
		if mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(filePath))); mimeType != "" {
			w.Header().Set("Content-Type", mimeType)
		} else {
			w.Header().Set("Content-Type", "application/octet-stream")
		}
	} else {
		w.Header().Set("Content-Type", "application/octet-stream")
	}

	http.ServeFile(w, r, filePath)
}

func (s *Server) deleteFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := vars["path"]

	// Get filesystem manager with JWT restrictions if applicable
	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	if err := fs.DeleteFile(path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) moveFile(w http.ResponseWriter, r *http.Request) {
	s.handleFileTransfer(w, r, "moved", func(fs *filesystem.Manager, src, dest string) error {
		return fs.MoveFile(src, dest)
	})
}

func (s *Server) copyFile(w http.ResponseWriter, r *http.Request) {
	s.handleFileTransfer(w, r, "copied", func(fs *filesystem.Manager, src, dest string) error {
		return fs.CopyFile(src, dest)
	})
}

func (s *Server) statFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := vars["path"]

	// Get filesystem manager with JWT restrictions if applicable
	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	stat, err := fs.StatFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	if err := writeJSON(w, 0, stat); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) getFileExif(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := vars["path"]

	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	data, err := fs.GetExifData(path)
	if err != nil {
		if handleNotFound(w, err) {
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if data == nil {
		data = &filesystem.ExifData{Tags: map[string]string{}}
	}

	if err := writeJSON(w, 0, data); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) downloadZip(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Paths []string `json:"paths"`
		Name  string   `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(req.Paths) == 0 {
		http.Error(w, "No paths specified", http.StatusBadRequest)
		return
	}

	zipName := req.Name
	if zipName == "" {
		zipName = "download.zip"
	}

	// Set headers for zip download
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", zipName))

	// Get filesystem manager with JWT restrictions if applicable
	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	if err := fs.CreateZip(w, req.Paths); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func (s *Server) getQuotaInfo(w http.ResponseWriter, r *http.Request) {
	// Get filesystem manager with JWT restrictions if applicable
	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	info, err := fs.GetQuotaInfo()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := writeJSON(w, 0, info); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) createFolder(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Path == "" {
		http.Error(w, "Path is required", http.StatusBadRequest)
		return
	}

	// Get filesystem manager with JWT restrictions if applicable
	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	if err := fs.CreateFolder(req.Path); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := writeJSON(w, http.StatusOK, map[string]string{"status": "created", "path": req.Path}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) getFileRaw(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filePath := vars["path"]

	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	// Get file info
	info, err := fs.GetFileInfo(filePath)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Check if it's a file (not directory)
	if info.IsDir {
		http.Error(w, "Path is a directory", http.StatusBadRequest)
		return
	}

	// Read file content
	content, err := fs.ReadFile(filePath)
	if err != nil {
		http.Error(w, "Error reading file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if _, err := w.Write(content); err != nil {
		http.Error(w, "Failed to write response", http.StatusInternalServerError)
	}
}

func (s *Server) putFileRaw(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	filePath := vars["path"]

	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	// Read request body
	defer func() {
		_ = r.Body.Close()
	}()

	content, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Error reading request", http.StatusBadRequest)
		return
	}

	// Write file
	if err := fs.WriteFile(filePath, content); err != nil {
		if strings.Contains(err.Error(), "quota exceeded") {
			http.Error(w, "Quota exceeded", http.StatusInsufficientStorage)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	if err := writeJSON(w, 0, map[string]string{
		"message": "File saved successfully",
	}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) handleFileTransfer(w http.ResponseWriter, r *http.Request, status string, op func(*filesystem.Manager, string, string) error) {
	vars := mux.Vars(r)
	sourcePath := vars["path"]

	var req struct {
		DestPath string `json:"destPath"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	fs, ok := s.resolveFilesystem(w, r)
	if !ok {
		return
	}

	if err := op(fs, sourcePath, req.DestPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if err := writeJSON(w, http.StatusOK, map[string]string{"status": status}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) resolveFilesystem(w http.ResponseWriter, r *http.Request) (*filesystem.Manager, bool) {
	fs, err := s.getFilesystemForRequest(r)
	if err != nil {
		switch {
		case strings.Contains(err.Error(), "no valid JWT claims"):
			http.Error(w, "Authentication required", http.StatusUnauthorized)
		case strings.Contains(err.Error(), "not found"):
			http.Error(w, err.Error(), http.StatusNotFound)
		case strings.Contains(err.Error(), "empty") && strings.Contains(err.Error(), "field"):
			http.Error(w, err.Error(), http.StatusBadRequest)
		default:
			http.Error(w, err.Error(), http.StatusForbidden)
		}
		return nil, false
	}

	if fs == nil {
		http.Error(w, "Filesystem manager not initialized", http.StatusInternalServerError)
		return nil, false
	}

	return fs, true
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) error {
	w.Header().Set("Content-Type", "application/json")
	if status != 0 {
		w.WriteHeader(status)
	}
	return json.NewEncoder(w).Encode(payload)
}

func handleNotFound(w http.ResponseWriter, err error) bool {
	if err != nil && strings.Contains(err.Error(), "not found") {
		http.Error(w, err.Error(), http.StatusNotFound)
		return true
	}
	return false
}
