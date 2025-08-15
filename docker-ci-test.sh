#!/bin/bash
# Reproduce CI environment locally using Docker

set -e

# Check for --simple flag
DOCKERFILE="Dockerfile.ci"
if [ "$1" == "--simple" ]; then
  DOCKERFILE="Dockerfile.ci-simple"
  echo "Using simplified CI configuration..."
fi

echo "🐳 Building Docker image to match GitHub Actions environment..."
echo "Using: $DOCKERFILE"
docker build -f "$DOCKERFILE" -t dendrite-ci-test .

echo ""
echo "🧪 Running tests in CI-like environment..."
echo "Running Playwright tests on Chromium only (faster CI)"
echo "This will show exactly what happens in GitHub Actions"
echo ""

# Create a temporary container to run tests and extract results
CONTAINER_NAME="dendrite-ci-test-$(date +%s)"

# Run tests in container (allow failure to still extract reports)
set +e
docker run \
  --name "$CONTAINER_NAME" \
  -e CI=true \
  dendrite-ci-test
TEST_EXIT_CODE=$?
set -e

echo ""
echo "📊 Extracting test reports..."

# Try to copy playwright report if it exists
if docker exec "$CONTAINER_NAME" test -d /app/playwright-report 2>/dev/null; then
  rm -rf ./playwright-report 2>/dev/null || true
  docker cp "$CONTAINER_NAME:/app/playwright-report" ./playwright-report 2>/dev/null || true
  echo "✅ Playwright report extracted to ./playwright-report"
fi

# Clean up container
docker rm "$CONTAINER_NAME" > /dev/null

echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ All tests passed!"
else
  echo "❌ Tests failed with exit code: $TEST_EXIT_CODE"
  echo "Check ./playwright-report/index.html for details (if Playwright tests ran)"
fi

exit $TEST_EXIT_CODE