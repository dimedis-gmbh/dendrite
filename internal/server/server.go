// Package server handles HTTP routing and request processing.
package server

import (
	"encoding/json"
	"fmt"
	"io/fs"
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

	s := &Server{
		Config: cfg,
		FS:     filesystem.New(cfg),
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
	api.HandleFunc("/files/{path:.+}/move", s.moveFile).Methods("POST")
	api.HandleFunc("/files/{path:.+}/copy", s.copyFile).Methods("POST")
	api.HandleFunc("/files/{path:.+}", s.getFile).Methods("GET")
	api.HandleFunc("/files/{path:.+}", s.deleteFile).Methods("DELETE")
	api.HandleFunc("/mkdir", s.createFolder).Methods("POST")
	api.HandleFunc("/download/zip", s.downloadZip).Methods("POST")
	api.HandleFunc("/quota", s.getQuotaInfo).Methods("GET")

	// Static files (frontend)
	// Serve static assets from embedded filesystem
	fileServer := http.FileServer(http.FS(s.webFS))
	s.Router.PathPrefix("/css/").Handler(fileServer)
	s.Router.PathPrefix("/js/").Handler(fileServer)
	s.Router.PathPrefix("/img/").Handler(fileServer)
	s.Router.PathPrefix("/images/").Handler(fileServer)
	
	// For all other routes, serve index.html to support client-side routing
	s.Router.PathPrefix("/").HandlerFunc(s.serveIndex)
}

// getFilesystemForRequest returns a filesystem manager with JWT restrictions if applicable
func (s *Server) getFilesystemForRequest(r *http.Request) *filesystem.Manager {
	// If JWT authentication is not enabled, return the default filesystem manager
	if s.Config.JWTSecret == "" {
		return s.FS
	}
	
	// Get JWT claims from context
	claims, ok := auth.GetClaimsFromContext(r.Context())
	if !ok || claims.Dir == "" {
		// No valid claims or no directory restriction, return default
		return s.FS
	}
	
	// Create a new filesystem manager with JWT directory restriction
	return filesystem.NewWithRestriction(s.Config, claims.Dir)
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

func (s *Server) listFiles(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Query().Get("path")
	if path == "" {
		path = "/"
	}

	// Get filesystem manager with JWT restrictions if applicable
	fs := s.getFilesystemForRequest(r)
	
	files, err := fs.ListFiles(path)
	if err != nil {
		// Check if it's a "not found" error
		if strings.Contains(err.Error(), "directory not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(files); err != nil {
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
	fs := s.getFilesystemForRequest(r)
	
	result, err := fs.UploadFile(targetPath, header.Filename, file, header.Size)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(result); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) getFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := vars["path"]

	// Get filesystem manager with JWT restrictions if applicable
	fs := s.getFilesystemForRequest(r)
	
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

	// Set appropriate headers for file download
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filepath.Base(filePath)))
	w.Header().Set("Content-Type", "application/octet-stream")
	
	http.ServeFile(w, r, filePath)
}

func (s *Server) deleteFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := vars["path"]

	// Get filesystem manager with JWT restrictions if applicable
	fs := s.getFilesystemForRequest(r)
	
	err := fs.DeleteFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]string{"status": "deleted"}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) moveFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sourcePath := vars["path"]

	var req struct {
		DestPath string `json:"destPath"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get filesystem manager with JWT restrictions if applicable
	fs := s.getFilesystemForRequest(r)
	
	err := fs.MoveFile(sourcePath, req.DestPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]string{"status": "moved"}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) copyFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sourcePath := vars["path"]

	var req struct {
		DestPath string `json:"destPath"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Get filesystem manager with JWT restrictions if applicable
	fs := s.getFilesystemForRequest(r)
	
	err := fs.CopyFile(sourcePath, req.DestPath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]string{"status": "copied"}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}

func (s *Server) statFile(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	path := vars["path"]

	// Get filesystem manager with JWT restrictions if applicable
	fs := s.getFilesystemForRequest(r)
	
	stat, err := fs.StatFile(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(stat); err != nil {
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
	fs := s.getFilesystemForRequest(r)
	
	err := fs.CreateZip(w, req.Paths)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func (s *Server) getQuotaInfo(w http.ResponseWriter, r *http.Request) {
	// Get filesystem manager with JWT restrictions if applicable
	fs := s.getFilesystemForRequest(r)
	
	info, err := fs.GetQuotaInfo()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(info); err != nil {
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
	fs := s.getFilesystemForRequest(r)
	
	err := fs.CreateFolder(req.Path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(map[string]string{"status": "created", "path": req.Path}); err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
	}
}