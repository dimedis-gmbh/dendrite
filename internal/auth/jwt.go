// Package auth handles JWT authentication
package auth

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/mux"
)

// Claims represents the JWT claims for Dendrite
type Claims struct {
	Dir    string `json:"dir"`
	Quota  string `json:"quota"`
	Expires string `json:"expires"`
	jwt.RegisteredClaims
}

// contextKey is used for storing values in context
type contextKey string

const (
	// ClaimsContextKey is the key used to store JWT claims in request context
	ClaimsContextKey contextKey = "jwt_claims"
)

// JWTMiddleware creates a middleware that validates JWT tokens
func JWTMiddleware(secret string) mux.MiddlewareFunc {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract token from Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				http.Error(w, "Missing authorization header", http.StatusUnauthorized)
				return
			}

			// Check for Bearer token
			tokenString := ""
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenString = strings.TrimPrefix(authHeader, "Bearer ")
			} else {
				http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
				return
			}

			// Parse and validate token
			token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
				// Validate signing method
				if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				return []byte(secret), nil
			})

			if err != nil {
				http.Error(w, "Invalid token", http.StatusUnauthorized)
				return
			}

			// Extract claims
			claims, ok := token.Claims.(*Claims)
			if !ok || !token.Valid {
				http.Error(w, "Invalid token claims", http.StatusUnauthorized)
				return
			}

			// Check expiration from custom expires field
			if claims.Expires != "" {
				expiresTime, err := time.Parse(time.RFC3339, claims.Expires)
				if err != nil {
					http.Error(w, "Invalid expiration format", http.StatusUnauthorized)
					return
				}
				if time.Now().After(expiresTime) {
					http.Error(w, "Token expired", http.StatusUnauthorized)
					return
				}
			}

			// Store claims in context for use by handlers
			ctx := context.WithValue(r.Context(), ClaimsContextKey, claims)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetClaimsFromContext retrieves JWT claims from request context
func GetClaimsFromContext(ctx context.Context) (*Claims, bool) {
	claims, ok := ctx.Value(ClaimsContextKey).(*Claims)
	return claims, ok
}

// ValidateJWTString validates a JWT string and returns the claims
func ValidateJWTString(tokenString string, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(secret), nil
	})

	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	// Check expiration
	if claims.Expires != "" {
		expiresTime, err := time.Parse(time.RFC3339, claims.Expires)
		if err != nil {
			return nil, fmt.Errorf("invalid expiration format")
		}
		if time.Now().After(expiresTime) {
			return nil, fmt.Errorf("token expired")
		}
	}

	return claims, nil
}