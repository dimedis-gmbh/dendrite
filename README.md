# Dendrite File Manager

[![CI](https://github.com/dimedis-gmbh/dendrite/actions/workflows/ci.yml/badge.svg)](https://github.com/dimedis-gmbh/dendrite/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Dendrite is a web-based file manager written in Go that allows managing remote file systems from a browser. It provides a Windows Explorer-like interface with comprehensive file management capabilities.

![Dendrite File Manager UI](docs/screenshot.png)

## Features

- 🗂️ **Windows Explorer-like Interface**: Familiar UI with file browsing, selection, and navigation
- 📁 **Complete File Operations**: Upload, download, move, copy, paste, delete, and create folders
- 🎯 **Drag & Drop Support**: Upload files and move items with drag and drop
- 📦 **ZIP Downloads**: Download multiple files or folders as a ZIP archive
- 💾 **Quota Management**: Set storage limits with user-friendly error messages
- ⌨️ **Keyboard Shortcuts**: Ctrl/Cmd+X/C/V for cut/copy/paste, Delete, F5 for refresh
- 🔗 **Clean URLs**: Navigate with clean path-based URLs (e.g., `/folder/subfolder`)
- 🚀 **Single Binary**: Easy deployment with embedded frontend assets
- 🔒 **Security**: Path traversal protection and secure file operations

## Installation

### Download Pre-built Binary

Download the latest release for your platform from the [releases page](https://github.com/dimedis-gmbh/dendrite/releases).

### Build from Source

Requirements:
- Go 1.21 or later
- Node.js 20 or later (for running tests)

```bash
git clone https://github.com/dimedis-gmbh/dendrite.git
cd dendrite
go build -o dendrite .
```

## Usage

### Basic Usage

```bash
./dendrite
```

This starts the server on `http://127.0.0.1:3000` serving the current directory.

### Command Line Options

```bash
./dendrite [options]
```

Options:
- `--listen`: IP address and port to listen on (default: `127.0.0.1:3000`)
- `--dir`: Directory to expose for web management (default: `./`)
- `--quota`: Maximum directory size with units (MB/GB/TB, default: no limit)

### Examples

```bash
# Serve /home/user/documents on port 8080
./dendrite --listen 0.0.0.0:8080 --dir /home/user/documents

# Set a 10GB quota limit
./dendrite --dir /var/data --quota 10GB

# Multiple options
./dendrite --listen 192.168.1.100:3000 --dir /shared --quota 500MB
```

## Keyboard Shortcuts

- **Ctrl/Cmd+A**: Select all files
- **Ctrl/Cmd+X**: Cut selected files
- **Ctrl/Cmd+C**: Copy selected files
- **Ctrl/Cmd+V**: Paste files
- **Delete**: Delete selected files
- **F5**: Refresh file list
- **Escape**: Clear selection and close dialogs

## Development

### Project Structure

```
dendrite/
├── main.go                 # Application entry point
├── internal/
│   ├── config/            # Configuration management
│   ├── filesystem/        # File operations and quota management
│   └── server/            # HTTP server and API handlers
├── web/                   # Frontend assets
│   ├── index.html
│   ├── css/
│   └── js/
└── tests/
    └── e2e/              # Playwright E2E tests
```

### Running Tests

#### Backend Tests

```bash
# Run Go unit tests
go test ./...

# Run with verbose output
go test -v ./...

# Run with race detection
go test -race ./...

# Run linter
golangci-lint run
```

#### Frontend E2E Tests

The frontend tests use Playwright and automatically set up an isolated test environment with a temporary directory and test files.

```bash
# Install dependencies first
npm install

# Run all tests in headless mode (default)
npm test

# Run tests with UI visible
npm test -- --headed

# Run tests in a specific browser
npm test -- --project=chromium
npm test -- --project=firefox
npm test -- --project=webkit

# Run tests with UI visible in a specific browser
npm test -- --headed --project=chromium
npm test -- --headed --project=firefox
npm test -- --headed --project=webkit

# Run a specific test file
npm test tests/e2e/file-manager.spec.js

# Run tests matching a pattern
npm test -- -g "should copy and paste"

# Run tests with debugging UI
npm test -- --ui

# Generate and open HTML report
npm test -- --reporter=html
npx playwright show-report

# Run tests in debug mode
npm test -- --debug
```

##### Testing for CI Compatibility

To ensure your changes work in CI before pushing:

```bash
# Check if port 3001 is available (CI requirement)
npm run test:ci

# Kill any dendrite processes and run tests
npm run test:local

# Simulate the exact CI environment locally
./.github/test-ci-locally.sh
```

The tests automatically:
- Create a temporary test directory with sample files
- Start dendrite server pointing to this directory
- Run all tests
- Clean up the test environment after completion

**Important**: Always run `npm run test:ci` before pushing to ensure tests will pass in GitHub Actions.

##### E2E Test Helper Scripts

The following helper scripts in `tests/e2e/` support the testing infrastructure:

- **`check-port.js`**: Verifies port 3001 is available before running tests
  ```bash
  node tests/e2e/check-port.js
  ```
  
- **`cleanup-processes.js`**: Cleans up any lingering dendrite processes
  ```bash
  node tests/e2e/cleanup-processes.js
  ```
  
- **`test-setup.js`**: Manages the test environment lifecycle
  - Creates temporary test directories
  - Starts/stops dendrite server
  - Handles process cleanup
  
- **`global-setup.js`** & **`global-teardown.js`**: Playwright hooks for test initialization

### Test Coverage

The project maintains a minimum of 70% test coverage. Run coverage report:

```bash
go test -cover ./...
```

### Testing with Docker

To ensure your changes work across different environments and match the CI pipeline, several Docker-based testing scripts are provided:

#### 1. Full CI Environment Simulation (`docker-ci-test.sh`)

This script reproduces the exact GitHub Actions environment locally:

```bash
./docker-ci-test.sh
```

What it does:
- Builds a Docker image matching GitHub Actions' Ubuntu environment
- Installs the same versions of Go, Node.js, and dependencies
- Runs the complete test suite as it would in CI
- Helps catch platform-specific issues before pushing

#### 2. CI Simulation Without Docker (`test-ci-locally.sh`)

Located in `.github/test-ci-locally.sh`, this script simulates CI behavior without Docker:

```bash
./.github/test-ci-locally.sh
```

What it does:
- Builds the dendrite binary
- Starts dendrite manually (like the old CI did)
- Runs tests to reproduce port conflict issues
- Useful for debugging CI-specific problems

#### 3. Linter Testing (`test-golangci-lint.sh`)

Tests the Go linter in isolation:

```bash
./test-golangci-lint.sh
```

What it does:
- Runs golangci-lint v2.3.0 in a Docker container
- Tests on both AMD64 and ARM64 architectures
- Ensures linter configuration is valid across platforms
- Matches the exact linter version used in CI
- Detects architecture-specific code issues

#### 4. CI Linter Testing (`test-ci-lint.sh`)

Tests the linter with full CI environment variables:

```bash
./test-ci-lint.sh
```

What it does:
- Creates a temporary copy of the project
- Sets CI environment variables
- Runs linter as GitHub Actions would
- Ensures no environment-specific linter issues

### Docker Testing Prerequisites

Ensure Docker is installed and running:

```bash
docker --version  # Should show Docker version
```

### When to Use These Scripts

- **Before pushing**: Run `./docker-ci-test.sh` to ensure CI will pass
- **Debugging CI failures**: Use `./.github/test-ci-locally.sh` to reproduce issues
- **After linter config changes**: Run `./test-golangci-lint.sh`
- **For complete validation**: Run all scripts before major changes

### Docker Configuration

The project includes `Dockerfile.ci` which creates an environment identical to GitHub Actions:

```dockerfile
# Key features:
- Ubuntu latest (matching GitHub Actions)
- Go 1.23 with architecture detection (ARM64/AMD64)
- Node.js 20 for frontend tests
- Playwright with all browser dependencies
- Automatic binary compilation for the container architecture
```

This ensures tests run in the same environment locally as in CI, preventing "works on my machine" issues.

## Architecture

### Backend
- Written in Go using the standard library and Gorilla Mux for routing
- RESTful API design
- File operations with quota enforcement
- Path traversal protection
- Embedded frontend assets using `go:embed`

### Frontend
- Vanilla JavaScript (no framework dependencies)
- Windows Explorer-like interface
- Real-time quota display
- Browser history integration
- No external CDN dependencies (GDPR compliant)

## API Endpoints

- `GET /api/files?path=<path>` - List files in directory
- `POST /api/files` - Upload file
- `GET /api/files/<path>` - Download file
- `DELETE /api/files/<path>` - Delete file or directory
- `POST /api/files/<path>/move` - Move file or directory
- `POST /api/files/<path>/copy` - Copy file or directory
- `GET /api/files/<path>/stat` - Get file statistics
- `POST /api/mkdir` - Create directory
- `POST /api/download/zip` - Download multiple files as ZIP
- `GET /api/quota` - Get quota information

## Security Considerations

- Designed to run behind a reverse proxy for authentication and TLS
- Path traversal protection ensures access only within the configured directory
- File permissions follow secure defaults (directories: 0750, files: 0640)
- No built-in authentication - rely on reverse proxy or network isolation

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure:
- All tests pass
- Code passes `golangci-lint`
- Test coverage remains above 70%
- New features include appropriate tests

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with Go and vanilla JavaScript
- UI inspired by Windows Explorer
- Tested with Playwright