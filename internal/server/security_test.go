package server

import (
	"encoding/json"
	"fmt"
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

// TestJWTSecurityNoFallback ensures that when JWT validation fails,
// the system NEVER falls back to serving default directories
func TestJWTSecurityNoFallback(t *testing.T) {
	// Create base directory for JWT mode
	baseDir := t.TempDir()
	
	// Setup config with JWT secret and base directory
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	// Create server
	srv := New(cfg)
	
	tests := []struct {
		name           string
		token          string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing authorization header",
			token:          "",
			expectedStatus: http.StatusUnauthorized,
			expectedError:  "Missing authorization header",
		},
		{
			name:           "invalid token format",
			token:          "InvalidToken",
			expectedStatus: http.StatusUnauthorized,
			expectedError:  "Invalid authorization header format",
		},
		{
			name:           "malformed JWT",
			token:          "Bearer invalid.jwt.token",
			expectedStatus: http.StatusUnauthorized,
			expectedError:  "Invalid token",
		},
		{
			name:           "wrong secret",
			token:          createTokenWithSecret(t, "wrong-secret-that-is-at-least-32-characters-long"),
			expectedStatus: http.StatusUnauthorized,
			expectedError:  "Invalid token",
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/api/files", nil)
			if tt.token != "" {
				req.Header.Set("Authorization", tt.token)
			}
			
			rec := httptest.NewRecorder()
			srv.Router.ServeHTTP(rec, req)
			
			assert.Equal(t, tt.expectedStatus, rec.Code)
			assert.Contains(t, rec.Body.String(), tt.expectedError)
		})
	}
}

// TestJWTPathEscapeProtection ensures JWT paths cannot escape the base directory
func TestJWTPathEscapeProtection(t *testing.T) {
	// Create base directory and a sibling directory
	parentDir := t.TempDir()
	baseDir := filepath.Join(parentDir, "base")
	siblingDir := filepath.Join(parentDir, "sibling")
	require.NoError(t, os.Mkdir(baseDir, 0750))
	require.NoError(t, os.Mkdir(siblingDir, 0750))
	
	// Create a secret file in sibling directory
	secretFile := filepath.Join(siblingDir, "secret.txt")
	require.NoError(t, os.WriteFile(secretFile, []byte("secret data"), 0600))
	
	// Setup config
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	// Create JWT with path traversal attempts
	traversalPaths := []struct {
		source  string
		virtual string
		desc    string
	}{
		{"../sibling", "/escape1", "relative path escape"},
		{"../../other", "/escape2", "double escape"},
		{"../../../../etc", "/escape3", "absolute path escape"},
		{"./../../sibling", "/escape4", "complex escape"},
	}
	
	for _, path := range traversalPaths {
		t.Run(path.desc, func(t *testing.T) {
			claims := &auth.Claims{
				Directories: []auth.DirMapping{
					{Source: path.source, Virtual: path.virtual},
				},
				Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
			}
			
			token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
			tokenString, err := token.SignedString([]byte(cfg.JWTSecret))
			require.NoError(t, err)
			
			req := httptest.NewRequest("GET", "/api/files?path="+path.virtual, nil)
			req.Header.Set("Authorization", "Bearer "+tokenString)
			
			rec := httptest.NewRecorder()
			srv.Router.ServeHTTP(rec, req)
			
			// Should get forbidden error for escape attempts
			assert.Equal(t, http.StatusForbidden, rec.Code)
			assert.Contains(t, rec.Body.String(), "escapes base directory")
		})
	}
}

// TestJWTDirectoryExistenceValidation ensures non-existent directories in JWT are rejected
func TestJWTDirectoryExistenceValidation(t *testing.T) {
	baseDir := t.TempDir()
	
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	// Create JWT with non-existent directory
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "nonexistent", Virtual: "/test"},
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
	
	assert.Equal(t, http.StatusNotFound, rec.Code)
	assert.Contains(t, rec.Body.String(), "directory not found")
}

// TestJWTFileAsDirectoryRejection ensures files cannot be used as directories
func TestJWTFileAsDirectoryRejection(t *testing.T) {
	baseDir := t.TempDir()
	
	// Create a file (not directory)
	testFile := filepath.Join(baseDir, "file.txt")
	require.NoError(t, os.WriteFile(testFile, []byte("test"), 0600))
	
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	// Create JWT pointing to a file instead of directory
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "file.txt", Virtual: "/test"},
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
	
	assert.Equal(t, http.StatusForbidden, rec.Code)
	assert.Contains(t, rec.Body.String(), "not a directory")
}

// TestHTTPStatusCodes ensures correct HTTP status codes for different error scenarios
func TestHTTPStatusCodes(t *testing.T) {
	baseDir := t.TempDir()
	testDir := filepath.Join(baseDir, "test")
	require.NoError(t, os.Mkdir(testDir, 0750))
	
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
	}
	
	srv := New(cfg)
	
	// Valid JWT for existing directory
	validClaims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "test", Virtual: "/test"},
		},
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
	}
	
	validToken := jwt.NewWithClaims(jwt.SigningMethodHS256, validClaims)
	validTokenString, err := validToken.SignedString([]byte(cfg.JWTSecret))
	require.NoError(t, err)
	
	tests := []struct {
		name           string
		setupAuth      func(*http.Request)
		endpoint       string
		expectedStatus int
		expectedBody   string
	}{
		{
			name: "401 for missing auth",
			setupAuth: func(_ *http.Request) {
				// No auth header
			},
			endpoint:       "/api/files",
			expectedStatus: http.StatusUnauthorized,
			expectedBody:   "Missing authorization header",
		},
		{
			name: "401 for invalid JWT",
			setupAuth: func(r *http.Request) {
				r.Header.Set("Authorization", "Bearer invalid.jwt.token")
			},
			endpoint:       "/api/files",
			expectedStatus: http.StatusUnauthorized,
			expectedBody:   "Invalid token",
		},
		{
			name: "404 for non-existent directory",
			setupAuth: func(r *http.Request) {
				// Create JWT for non-existent directory
				claims := &auth.Claims{
					Directories: []auth.DirMapping{
						{Source: "nonexistent", Virtual: "/missing"},
					},
					Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
				}
				token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
				tokenString, _ := token.SignedString([]byte(cfg.JWTSecret))
				r.Header.Set("Authorization", "Bearer "+tokenString)
			},
			endpoint:       "/api/files?path=/missing",
			expectedStatus: http.StatusNotFound,
			expectedBody:   "directory not found",
		},
		{
			name: "403 for directory escape attempt",
			setupAuth: func(r *http.Request) {
				// Create JWT with escape attempt
				claims := &auth.Claims{
					Directories: []auth.DirMapping{
						{Source: "../escape", Virtual: "/escape"},
					},
					Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
				}
				token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
				tokenString, _ := token.SignedString([]byte(cfg.JWTSecret))
				r.Header.Set("Authorization", "Bearer "+tokenString)
			},
			endpoint:       "/api/files",
			expectedStatus: http.StatusForbidden,
			expectedBody:   "escapes base directory",
		},
		{
			name: "200 for valid request",
			setupAuth: func(r *http.Request) {
				r.Header.Set("Authorization", "Bearer "+validTokenString)
			},
			endpoint:       "/api/files?path=/test",
			expectedStatus: http.StatusOK,
			expectedBody:   "",
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", tt.endpoint, nil)
			tt.setupAuth(req)
			
			rec := httptest.NewRecorder()
			srv.Router.ServeHTTP(rec, req)
			
			assert.Equal(t, tt.expectedStatus, rec.Code, "Status code mismatch for %s", tt.name)
			if tt.expectedBody != "" {
				assert.Contains(t, rec.Body.String(), tt.expectedBody, "Response body mismatch for %s", tt.name)
			}
			
			// For successful requests, verify it's valid JSON
			if tt.expectedStatus == http.StatusOK {
				var files []interface{}
				err := json.Unmarshal(rec.Body.Bytes(), &files)
				assert.NoError(t, err, "Response should be valid JSON for %s", tt.name)
			}
		})
	}
}

// TestJWTModeAndDirectoryModeExclusive ensures JWT mode and directory mode are mutually exclusive
func TestJWTModeAndDirectoryModeExclusive(t *testing.T) {
	baseDir := t.TempDir()
	
	// Config with both JWT and directories should have directories ignored
	cfg := &config.Config{
		JWTSecret: "test-secret-that-is-at-least-32-characters-long",
		BaseDir:   baseDir,
		Directories: []config.DirMapping{
			{Source: "/some/path", Virtual: "/test"},
		},
	}
	
	srv := New(cfg)
	
	// Without JWT, should get 401
	req := httptest.NewRequest("GET", "/api/files", nil)
	rec := httptest.NewRecorder()
	srv.Router.ServeHTTP(rec, req)
	
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "Missing authorization header")
	
	// Server should have nil FS in JWT mode
	assert.Nil(t, srv.FS)
}

// Helper function to create JWT with specific secret
func createTokenWithSecret(t *testing.T, secret string) string {
	t.Helper()
	claims := &auth.Claims{
		Directories: []auth.DirMapping{
			{Source: "test", Virtual: "/test"},
		},
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	
	return fmt.Sprintf("Bearer %s", tokenString)
}