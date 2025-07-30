package server

import (
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
)

// TestJWTEmptySourceField tests that JWT with empty source field is rejected
func TestJWTEmptySourceField(t *testing.T) {
	// Create base directory
	baseDir := t.TempDir()
	
	// Setup config with JWT
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	// Create JWT with empty source field
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "", Virtual: "/test"},  // Empty source!
		},
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
	require.NoError(t, err)
	
	// Try to list files
	req := httptest.NewRequest("GET", "/api/files?path=/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	
	// Should get an error, not success
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "empty 'source' field")
}

// TestJWTEmptyVirtualField tests that JWT with empty virtual field is rejected
func TestJWTEmptyVirtualField(t *testing.T) {
	// Create base directory
	baseDir := t.TempDir()
	
	// Setup config with JWT
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	// Create JWT with empty virtual field
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "subdir", Virtual: ""},  // Empty virtual!
		},
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
	require.NoError(t, err)
	
	// Try to list files
	req := httptest.NewRequest("GET", "/api/files", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	
	// Should get an error, not success
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "empty 'virtual' field")
}

// TestJWTTypoInFieldName tests the security issue where a typo like "sourced" gives base dir access
func TestJWTTypoInFieldName(t *testing.T) {
	// Create base directory with a file
	baseDir := t.TempDir()
	secretFile := filepath.Join(baseDir, "secret.txt")
	require.NoError(t, os.WriteFile(secretFile, []byte("secret data"), 0600))
	
	// Create a subdirectory that should be accessible
	subDir := filepath.Join(baseDir, "allowed")
	require.NoError(t, os.Mkdir(subDir, 0750))
	
	// Setup config with JWT
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	// Create JWT with typo - this simulates what happens when JSON has "sourced" instead of "source"
	// The Source field will be empty because JSON unmarshaling doesn't match the field name
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "", Virtual: "/test"},  // This is what happens with the typo
		},
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
	require.NoError(t, err)
	
	// Try to list files at the virtual path
	req := httptest.NewRequest("GET", "/api/files?path=/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	
	// Should get an error, not the base directory contents
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "empty 'source' field")
	
	// Ensure we can't see the base directory files
	assert.NotContains(t, rec.Body.String(), "secret.txt")
}

// TestJWTMultipleDirectoriesWithOneEmpty tests mixed valid and invalid directories
func TestJWTMultipleDirectoriesWithOneEmpty(t *testing.T) {
	baseDir := t.TempDir()
	
	// Create subdirectories
	validDir := filepath.Join(baseDir, "valid")
	require.NoError(t, os.Mkdir(validDir, 0750))
	
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	// Create JWT with one valid and one invalid directory
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "valid", Virtual: "/valid"},
			{Source: "", Virtual: "/invalid"},  // Empty source
		},
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
	require.NoError(t, err)
	
	req := httptest.NewRequest("GET", "/api/files", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	
	// Should reject the entire JWT due to invalid directory
	assert.Equal(t, http.StatusBadRequest, rec.Code)
	assert.Contains(t, rec.Body.String(), "empty 'source' field")
}

// TestJWTWhitespaceOnlyFields tests that whitespace-only fields are also rejected
func TestJWTWhitespaceOnlyFields(t *testing.T) {
	baseDir := t.TempDir()
	
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	testCases := []struct {
		name    string
		source  string
		virtual string
		errMsg  string
	}{
		{"space in source", " ", "/test", "empty 'source' field"},
		{"tab in source", "\t", "/test", "empty 'source' field"},
		{"newline in source", "\n", "/test", "empty 'source' field"},
		{"spaces in source", "   ", "/test", "empty 'source' field"},
		{"space in virtual", "test", " ", "empty 'virtual' field"},
		{"spaces in virtual", "test", "   ", "empty 'virtual' field"},
	}
	
	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			claims := &auth.Claims{
				Directories: []auth.DirMapping{
					{Source: tc.source, Virtual: tc.virtual},
				},
				Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
			}
			
			token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
			tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
			require.NoError(t, err)
			
			req := httptest.NewRequest("GET", "/api/files", nil)
			req.Header.Set("Authorization", "Bearer "+tokenString)
			
			rec := httptest.NewRecorder()
			srv.Router.ServeHTTP(rec, req)
			
			assert.Equal(t, http.StatusBadRequest, rec.Code)
			assert.Contains(t, rec.Body.String(), tc.errMsg)
		})
	}
}