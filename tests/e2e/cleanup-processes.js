#!/usr/bin/env node
// Cleanup dendrite processes before running tests
// This is more robust than inline shell commands and handles CI environments better

const { execSync } = require('child_process');
const os = require('os');

console.log('Cleaning up any existing dendrite processes...');

try {
  // Only run cleanup if not in CI or if explicitly requested
  if (process.env.CI && process.env.FORCE_CLEANUP !== 'true') {
    console.log('Skipping process cleanup in CI environment');
    process.exit(0);
  }

  const platform = os.platform();
  
  if (platform === 'win32') {
    // Windows
    try {
      execSync('taskkill /F /IM dendrite.exe', { stdio: 'ignore' });
      console.log('Cleaned up dendrite processes on Windows');
    } catch (e) {
      // No processes found, that's OK
    }
  } else {
    // Unix-like systems (Linux, macOS)
    try {
      // Try pkill first (more portable)
      execSync('pkill -f "dendrite.*3001"', { stdio: 'ignore' });
      console.log('Cleaned up dendrite processes using pkill');
    } catch (e) {
      // If pkill fails, try killall
      try {
        execSync('killall dendrite', { stdio: 'ignore' });
        console.log('Cleaned up dendrite processes using killall');
      } catch (e2) {
        // No processes found, that's OK
      }
    }
  }
  
  console.log('Process cleanup complete');
} catch (error) {
  console.error('Error during cleanup:', error.message);
  // Don't fail the test run due to cleanup errors
  process.exit(0);
}