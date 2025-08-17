#!/bin/bash
# Test in CI-like environment locally (without Docker)

set -e

echo "🔧 Building dendrite binary..."
go build -o dendrite .

echo ""
echo "📦 Installing npm dependencies..."
npm ci

echo ""
echo "🎭 Installing Playwright Chromium browser..."
npx playwright install chromium

echo ""
echo "🧪 Running tests in CI mode (Chromium only)..."
echo "This simulates the GitHub Actions environment"
echo ""

# Set CI environment variable to trigger CI-specific configuration
export CI=true

# Run Go tests
echo "Running Go tests..."
go test -v -race ./...

echo ""
echo "Running Playwright tests (Chromium only)..."
npm test -- --project=chromium --reporter=list,html

echo ""
echo "✅ All tests passed!"
echo "Check playwright-report/index.html for the test report"