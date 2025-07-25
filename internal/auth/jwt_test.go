package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJWTMiddleware(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-characters-long"
	
	tests := []struct {
		name           string
		authHeader     string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing authorization header",
			authHeader:     "",
			expectedStatus: http.StatusUnauthorized,
			expectedError:  "Missing authorization header",
		},
		{
			name:           "invalid authorization format",
			authHeader:     "InvalidFormat token",
			expectedStatus: http.StatusUnauthorized,
			expectedError:  "Invalid authorization header format",
		},
		{
			name:           "invalid JWT token",
			authHeader:     "Bearer invalid.token.here",
			expectedStatus: http.StatusUnauthorized,
			expectedError:  "Invalid token",
		},
	}
	
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			middleware := JWTMiddleware(secret)
			
			handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusOK)
			}))
			
			req := httptest.NewRequest("GET", "/api/test", nil)
			if tt.authHeader != "" {
				req.Header.Set("Authorization", tt.authHeader)
			}
			
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			
			assert.Equal(t, tt.expectedStatus, rec.Code)
			if tt.expectedError != "" {
				assert.Contains(t, rec.Body.String(), tt.expectedError)
			}
		})
	}
}

func TestJWTMiddlewareWithValidToken(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-characters-long"
	
	// Create a valid token
	claims := &Claims{
		Dir:     "test/directory",
		Quota:   "100MB",
		Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
		},
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	
	middleware := JWTMiddleware(secret)
	
	var capturedClaims *Claims
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedClaims, _ = GetClaimsFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))
	
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.NotNil(t, capturedClaims)
	assert.Equal(t, "test/directory", capturedClaims.Dir)
	assert.Equal(t, "100MB", capturedClaims.Quota)
}

func TestJWTMiddlewareWithExpiredToken(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-characters-long"
	
	// Create an expired token
	claims := &Claims{
		Dir:     "test/directory",
		Quota:   "100MB",
		Expires: time.Now().Add(-time.Hour).Format(time.RFC3339), // Expired
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
		},
	}
	
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	
	middleware := JWTMiddleware(secret)
	
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	
	req := httptest.NewRequest("GET", "/api/test", nil)
	req.Header.Set("Authorization", "Bearer "+tokenString)
	
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
	assert.Contains(t, rec.Body.String(), "Invalid token")
}

func TestGetClaimsFromContext(t *testing.T) {
	// Test with claims in context
	claims := &Claims{
		Dir:   "test/dir",
		Quota: "50MB",
	}
	ctx := context.WithValue(context.Background(), ClaimsContextKey, claims)
	
	retrieved, ok := GetClaimsFromContext(ctx)
	assert.True(t, ok)
	assert.Equal(t, claims.Dir, retrieved.Dir)
	assert.Equal(t, claims.Quota, retrieved.Quota)
	
	// Test without claims in context
	emptyCtx := context.Background()
	retrieved, ok = GetClaimsFromContext(emptyCtx)
	assert.False(t, ok)
	assert.Nil(t, retrieved)
}

func TestValidateJWTString(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-characters-long"
	
	t.Run("valid token", func(t *testing.T) {
		claims := &Claims{
			Dir:     "user/documents",
			Quota:   "1GB",
			Expires: time.Now().Add(time.Hour).Format(time.RFC3339),
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			},
		}
		
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString([]byte(secret))
		require.NoError(t, err)
		
		validatedClaims, err := ValidateJWTString(tokenString, secret)
		assert.NoError(t, err)
		assert.NotNil(t, validatedClaims)
		assert.Equal(t, "user/documents", validatedClaims.Dir)
		assert.Equal(t, "1GB", validatedClaims.Quota)
	})
	
	t.Run("invalid token", func(t *testing.T) {
		validatedClaims, err := ValidateJWTString("invalid.token.string", secret)
		assert.Error(t, err)
		assert.Nil(t, validatedClaims)
	})
	
	t.Run("expired token", func(t *testing.T) {
		claims := &Claims{
			Dir:     "user/documents",
			Quota:   "1GB",
			Expires: time.Now().Add(-time.Hour).Format(time.RFC3339), // Expired
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(-time.Hour)),
			},
		}
		
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		tokenString, err := token.SignedString([]byte(secret))
		require.NoError(t, err)
		
		validatedClaims, err := ValidateJWTString(tokenString, secret)
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "token is expired")
		assert.Nil(t, validatedClaims)
	})
	
	t.Run("wrong signing method", func(t *testing.T) {
		// Create token with different signing method
		token := jwt.New(jwt.SigningMethodRS256) // Using RSA instead of HMAC
		token.Claims = &Claims{
			Dir:   "test",
			Quota: "100MB",
		}
		
		// This will create an invalid signature since we're not using the right key
		// #nosec G101 - this is a test token
		tokenString := "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJkaXIiOiJ0ZXN0IiwicXVvdGEiOiIxMDBNQiJ9.invalid"
		
		validatedClaims, err := ValidateJWTString(tokenString, secret)
		assert.Error(t, err)
		assert.Nil(t, validatedClaims)
	})
}