#!/bin/bash
# Test golangci-lint in a Docker container matching GitHub Actions environment

set -e

echo "🐳 Testing golangci-lint v2.3.0 in Docker..."

# Test on AMD64 architecture (GitHub Actions default)
echo "🔧 Testing on linux/amd64..."
docker run --rm \
  --platform linux/amd64 \
  -v "$(pwd)":/app \
  -w /app \
  golangci/golangci-lint:v2.3.0 \
  golangci-lint run

echo "✅ AMD64 test passed!"

# Test on ARM64 architecture only if platform supports it
if uname -a|grep "Darwin.*ARM64"; then
    echo "🔧 Testing on linux/arm64..."
    docker run --rm \
      --platform linux/arm64 \
      -v "$(pwd)":/app \
      -w /app \
      golangci/golangci-lint:v2.3.0 \
      golangci-lint run

    echo "✅ ARM64 test passed!"
fi

echo "✅ All golangci-lint tests passed!"