package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"dendrite/internal/auth"
	"dendrite/internal/config"
)

func TestListFilesWithNonExistentJWTDirectory(t *testing.T) {
	// Create a temporary directory for testing
	tmpDir := t.TempDir()
	
	// Setup config with JWT secret
	cfg := &config.Config{
		Dir:       tmpDir,
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
	}
	
	// Create server
	srv := New(cfg)
	
	// Create a JWT token with a non-existent directory
	claims := &auth.Claims{
		Dir:     "users/john_doe/documents", // This directory doesn't exist
		Quota:   "100MB",
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
	require.NoError(t, err)
	
	// Create request
	req := httptest.NewRequest("GET", "/api/files", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	
	// Record response
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	
	// Assert we get 404 Not Found
	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Contains(t, rec.Body.String(), "directory not found")
}

func TestListFilesWithExistingDirectory(t *testing.T) {
	// Create a temporary directory for testing
	tmpDir := t.TempDir()
	
	// Setup config without JWT (simpler test)
	cfg := &config.Config{
		Dir: tmpDir,
	}
	
	// Create server
	srv := New(cfg)
	
	// Create request
	req := httptest.NewRequest("GET", "/api/files", nil)
	
	// Record response
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	
	// Assert we get 200 OK for existing directory
	assert.Equal(t, http.StatusOK, rec.Code)
}