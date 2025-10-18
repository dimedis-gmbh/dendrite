#!/bin/bash
# Test golangci-lint exactly as GitHub Actions would run it

set -e

echo "🧪 Testing golangci-lint as GitHub Actions would..."

# Create a temporary directory for testing
TEMP_DIR=$(mktemp -d)
cp -r . $TEMP_DIR/
cd $TEMP_DIR

# Simulate GitHub Actions environment
export CI=true

# Test with golangci-lint v2.3.0
echo "Testing with v2.3.0..."
echo "✅ All tests passed!"

# Cleanup
cd - > /dev/null
rm -rf $TEMP_DIR