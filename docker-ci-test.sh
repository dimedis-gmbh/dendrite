#!/bin/bash
# Reproduce CI environment locally using Docker

set -e

#echo "🐳 Building Docker image to match GitHub Actions environment..."
#docker build -f Dockerfile.ci -t dendrite-ci-test .

echo ""
echo "🧪 Running tests in CI-like environment..."
echo "This will show exactly what happens in GitHub Actions"
echo ""

# Run with the same constraints as CI
docker run --rm \
  --name dendrite-ci-test \
  -e CI=true \
  dendrite-ci-test

echo ""
echo "✅ Test completed!"