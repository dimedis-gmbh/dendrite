#!/usr/bin/env node
// Check if port 3001 is available before running tests
// This helps detect port conflicts that cause CI failures

const net = require('net');

const PORT = 3001;

const server = net.createServer();

server.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!`);
    console.error('Another process (possibly dendrite) is already running on this port.');
    console.error('Please stop it before running tests, or the tests will fail.');
    console.error('\nTo fix this, run: pkill -f "dendrite.*3001" || true');
    process.exit(1);
  } else {
    console.error('Error checking port:', err);
    process.exit(1);
  }
});

server.once('listening', () => {
  console.log(`✅ Port ${PORT} is available for testing`);
  server.close();
  process.exit(0);
});

console.log(`Checking if port ${PORT} is available...`);
server.listen(PORT, '127.0.0.1');