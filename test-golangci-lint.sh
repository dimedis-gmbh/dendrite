#!/bin/bash
# Test golangci-lint in a Docker container matching GitHub Actions environment

set -e

echo "🐳 Testing golangci-lint v2.3.0 in Docker..."

# Run golangci-lint in a Docker container
docker run --rm \
  -v $(pwd):/app \
  -w /app \
  golangci/golangci-lint:v2.3.0 \
  golangci-lint run

echo "✅ golangci-lint test passed!"