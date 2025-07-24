#!/bin/bash
# Simulate the CI environment locally to catch issues before pushing
# This reproduces the exact conditions that cause failures in GitHub Actions

set -e

echo "🔧 Simulating GitHub Actions CI environment..."
echo "This will help you catch CI failures before pushing to GitHub"
echo ""

# Kill any existing dendrite processes
echo "1️⃣ Cleaning up existing processes..."
pkill -f "dendrite.*3001" || true
sleep 1

# Build the binary (like CI does)
echo "2️⃣ Building dendrite binary..."
go build -o dendrite .

# Start server manually (this simulates the OLD CI behavior that causes conflicts)
echo "3️⃣ Starting dendrite server (simulating OLD CI behavior)..."
./dendrite --listen 127.0.0.1:3001 --dir . --quota 100MB &
DENDRITE_PID=$!
sleep 2

# Now try to run tests (this should FAIL with the old setup)
echo "4️⃣ Running tests (this should fail with 'address already in use')..."
echo ""
npm test

# Cleanup
echo ""
echo "5️⃣ Cleaning up..."
kill $DENDRITE_PID 2>/dev/null || true

echo ""
echo "✅ CI simulation complete!"
echo ""
echo "If the tests failed with 'address already in use', that confirms the CI issue."
echo "With our fix (removing server start from CI), the tests should pass."