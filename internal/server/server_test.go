package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"dendrite/internal/auth"
	"dendrite/internal/config"
	"dendrite/internal/filesystem"
)

func TestListFilesWithJWTDirectoryRestriction(t *testing.T) {
	// Create base directory and subdirectories for testing
	baseDir := t.TempDir()
	tmpDir1 := filepath.Join(baseDir, "allowed")
	tmpDir2 := filepath.Join(baseDir, "restricted")
	require.NoError(t, os.Mkdir(tmpDir1, 0750))
	require.NoError(t, os.Mkdir(tmpDir2, 0750))
	
	// Setup config with JWT secret and base directory
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	// Create server
	srv := New(cfg)
	
	// Create a JWT token that only allows access to the first directory
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "allowed", Virtual: "/allowed"}, // Relative to base_dir
		},
		Quota:   "100MB",
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
	require.NoError(t, err)
	
	t.Run("list root with JWT restriction", func(t *testing.T) {
		// Create request for root
		req := httptest.NewRequest("GET", "/api/files", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)
		
		// Record response
		rec := httptest.NewRecorder()
		srv.Router.ServeHTTP(rec, req)
		
		// Assert we get 200 OK and only see allowed directory
		assert.Equal(t, http.StatusOK, rec.Code)
		
		var files []filesystem.FileInfo
		err := json.Unmarshal(rec.Body.Bytes(), &files)
		assert.NoError(t, err)
		assert.Len(t, files, 1)
		assert.Equal(t, "allowed", files[0].Name)
	})
	
	t.Run("access restricted directory with JWT", func(t *testing.T) {
		// Create request for restricted directory
		req := httptest.NewRequest("GET", "/api/files?path=%2Frestricted", nil)
		req.Header.Set("Authorization", "Bearer "+tokenString)
		
		// Record response
		rec := httptest.NewRecorder()
		srv.Router.ServeHTTP(rec, req)
		
		// Should get error because JWT doesn't allow this directory
		if rec.Code != http.StatusNotFound {
			t.Logf("Unexpected status code: %d", rec.Code)
			t.Logf("Response body: %s", rec.Body.String())
		}
		assert.Equal(t, http.StatusNotFound, rec.Code)
		assert.Contains(t, rec.Body.String(), "virtual path not found")
	})
}

func TestListFilesWithoutJWT(t *testing.T) {
	// Create a temporary directory for testing
	tmpDir := t.TempDir()
	
	// Setup config without JWT (simpler test)
	cfg := &config.Config{
		Directories: []config.DirMapping{
			{Source: tmpDir, Virtual: "/test"},
		},
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
	
	var files []filesystem.FileInfo
	err := json.Unmarshal(rec.Body.Bytes(), &files)
	assert.NoError(t, err)
	assert.Len(t, files, 1)
	assert.Equal(t, "test", files[0].Name)
}

func TestJWTWithInvalidDirectory(t *testing.T) {
	// Create a temporary directory for testing
	tmpDir := t.TempDir()
	
	// Setup config with JWT secret and base directory
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   tmpDir, // In JWT mode, we need base_dir
	}
	
	// Create server
	srv := New(cfg)
	
	// Create a JWT token with a directory that doesn't exist
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "nonexistent", Virtual: "/other"}, // Relative to base_dir, doesn't exist
		},
		Quota:   "100MB",
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
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
	
	// Since JWT directory doesn't exist, it should return 404 (NOT fall back to server directories)
	// This prevents the security vulnerability where invalid JWT would grant access to all configured directories
	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Contains(t, rec.Body.String(), "directory not found")
}