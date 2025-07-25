# JWT Authentication Implementation Summary

This document summarizes the JWT authentication feature implemented for Dendrite as requested in issue #7.

## Features Implemented

### Backend (Go)

1. **Command Line Flag**
   - Added `--jwt` flag to accept JWT secret (minimum 32 characters)
   - Validates secret length for security

2. **JWT Middleware**
   - Created `internal/auth/jwt.go` with Gorilla mux middleware
   - Validates JWT tokens from Authorization header
   - Extracts and validates claims (dir, quota, expires)
   - Stores claims in request context for handlers

3. **Filesystem Restrictions**
   - Modified filesystem manager to support JWT-based directory restrictions
   - All file operations are constrained to the JWT-specified subdirectory
   - Path traversal attacks are prevented
   - Quota calculations respect the restricted directory

4. **Server Integration**
   - JWT middleware applied to all API endpoints when enabled
   - Each request creates a filesystem manager with appropriate restrictions

### Frontend (JavaScript)

1. **JWT Detection and Storage**
   - Detects JWT tokens in URL hash: `#<jwt-token>` (secure - not sent to server)
   - Parses JWT to extract claims
   - Stores JWT and expiry in localStorage
   - Redirects to clean URL after storing

2. **API Integration**
   - Automatically includes JWT in Authorization header for all API requests
   - Checks token expiry before each request
   - Clears expired tokens and shows error

3. **Session Management**
   - Displays session expiry time in status bar
   - Updates expiry display every minute
   - Clears session on expiry
   - Shows user-friendly time remaining (days/hours/minutes)

## Security Features

1. **Path Isolation**
   - Users can only access files within their JWT-specified directory
   - Parent directory access is blocked
   - Path normalization prevents traversal attacks

2. **Token Validation**
   - Signature verification using HMAC-SHA256
   - Expiry checking on both frontend and backend
   - Invalid tokens return 401 Unauthorized

3. **Quota Enforcement**
   - JWT can specify custom quota limits
   - Quota applies only to the restricted directory

## Testing

1. **Unit Tests**
   - JWT middleware validation tests
   - Filesystem restriction tests
   - Path traversal prevention tests
   - Token expiry tests

2. **Integration Testing Guide**
   - Created `example_jwt_test.md` with testing instructions
   - Demonstrates creating tokens with Node.js
   - Shows various test scenarios

## Usage Example

1. Start Dendrite with JWT authentication:
   ```bash
   ./dendrite --jwt "your-secret-key-at-least-32-characters" --dir /var/www/files
   ```

2. Create a JWT token with claims:
   ```json
   {
     "dir": "users/john_doe/documents",
     "quota": "100MB",
     "expires": "2025-12-31T23:59:59Z"
   }
   ```

3. Access Dendrite with JWT:
   ```
   https://example.com/dendrite/#<jwt-token>
   ```
   
   The JWT is passed as a URL hash fragment for security - it won't be sent to the server or appear in logs.

4. User will be restricted to `/var/www/files/users/john_doe/documents` with 100MB quota

## Files Modified/Created

- `go.mod` - Added JWT dependency
- `internal/config/config.go` - Added JWTSecret field
- `main.go` - Added JWT flag and validation
- `internal/auth/jwt.go` - JWT middleware implementation
- `internal/auth/jwt_test.go` - JWT tests
- `internal/server/server.go` - Integrated JWT middleware
- `internal/filesystem/manager.go` - Added directory restrictions
- `internal/filesystem/manager_jwt_test.go` - Filesystem restriction tests
- `internal/assets/web/js/ui.js` - JWT detection and session management
- `internal/assets/web/js/api.js` - JWT header inclusion
- `internal/assets/web/index.html` - Session display UI
- `internal/assets/web/css/styles.css` - Session display styles