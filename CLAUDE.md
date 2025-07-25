# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dendrite is a web-based file manager written in Go that allows managing remote file systems from a browser. It's a single binary application that combines a Go backend with an ExtJS frontend.

## Development Commands

### Build and Run
```bash
go build -o dendrite .
./dendrite --listen 127.0.0.1:3000 --dir ./ --quota 1GB
```

### Testing
```bash
go test ./...                    # Run all tests
go test -v ./...                # Run tests with verbose output
go test -race ./...             # Run tests with race detection
go test -cover ./...            # Run tests with coverage
```

Test coverage target: minimum 70%
Use `github.com/stretchr/testify` for unit tests.

### Linting
```bash
golangci-lint run              # Run linter with project configuration
```

The project uses a comprehensive `.golangci.yaml` configuration with multiple linters enabled including govet, revive, staticcheck, errcheck, gosec, and others. All code must pass without errors or warnings.

## Command Line Arguments

The application accepts these arguments:
- `--listen`: IP address and port to listen on (default: 127.0.0.1:3000)
- `--dir`: Directory to expose for web management (default: ./)
- `--quota`: Maximum directory size with units (MB/GB/TB, default: no limit)

## Architecture Requirements

### Backend
- Follow REST API best practices
- Use idiomatic Go patterns
- No authentication/TLS required (runs behind reverse proxy)
- Quota enforcement with user-friendly error messages
- Support file operations: upload, download, move, copy, paste, delete
- ZIP download for multiple files/folders (read operation, not subject to quota)
- File stat information via right-click context

### Frontend
- Pure and handcrafted JS
- Windows Explorer-like interface
- Drag and drop file upload and file/folder movement
- Keyboard shortcuts (Ctrl/Cmd+X, C, V)
- Context menus for file operations
- Status bar showing quota usage
- File type icons using built-in ExtJS icons
- No external CDN dependencies (GDPR compliance)

## Key Constraints

- All frontend assets must be embedded using `go embed`
- GDPR compliance: no external CDN loading
- Quota applies to all files in the managed directory (not just web-uploaded files)
- Quota enforcement: reject write operations that would exceed limits
- When quota exceeded at startup: read-only/download-only mode with delete operations only
- Minimum 70% test coverage requirement
- Before commiting always run all tests and linters (frontend and backend)
- Always implement changes having maximum security in mind.
- Tests (fronend and backend) must cover the happy and the unhappy path.

## Releasing

- Project will be released under the MIT licence on https://github.com/dimedis-gmbh/dendite
- Github Wokflows and Goreleaser will be used to create and publish releases
- A release will be created on puhsing a tag that complies with semantic versioning e.g. "0.0.1"
- A comprehensive release note will be published
- On each push to any branch go unit tests, playwright frontend test and golanci-lint will run
- Binary releases will be created for Linux AMD64, Mac Silicon and Windows 64bit
- The github command line client `gh` is set up and has full admin right on my GitHub projects.
 