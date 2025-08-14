// @ts-check
const { spawn } = require('child_process');
const { mkdirSync, writeFileSync, rmSync, existsSync } = require('fs');
const { join } = require('path');
const path = require('path');

let dendriteProcess = null;
const TEST_DIR = join(__dirname, 'test-data');
const DENDRITE_PORT = 3001;

async function setupTestEnvironment() {
  // Clean up any existing test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }

  // Create test directory structure
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'documents'));
  mkdirSync(join(TEST_DIR, 'images'));
  mkdirSync(join(TEST_DIR, 'projects'));
  mkdirSync(join(TEST_DIR, 'projects', 'project1'));
  mkdirSync(join(TEST_DIR, 'projects', 'project2'));

  // Create test files
  writeFileSync(join(TEST_DIR, 'readme.txt'), 'This is a test readme file.');
  writeFileSync(join(TEST_DIR, 'test.md'), '# Test Markdown\n\nThis is a test markdown file.');
  writeFileSync(join(TEST_DIR, 'main.go'), 'package main\n\nfunc main() {\n\t// Test file\n}');
  writeFileSync(join(TEST_DIR, 'data.json'), JSON.stringify({ test: true, data: 'sample' }, null, 2));
  writeFileSync(join(TEST_DIR, 'documents', 'report.pdf'), 'PDF content placeholder');
  writeFileSync(join(TEST_DIR, 'documents', 'notes.txt'), 'Meeting notes\n- Item 1\n- Item 2');
  writeFileSync(join(TEST_DIR, 'images', 'logo.png'), 'PNG image placeholder');
  writeFileSync(join(TEST_DIR, 'projects', 'project1', 'main.go'), 'package main\n\nfunc main() {}');
  writeFileSync(join(TEST_DIR, 'projects', 'project1', 'README.md'), '# Project 1');
  writeFileSync(join(TEST_DIR, 'projects', 'project2', 'index.js'), 'console.log("Hello");');
  
  // Add test file for editor tests
  writeFileSync(join(TEST_DIR, 'test-editor.txt'), 'Hello World from editor test');

  // Build dendrite if not already built
  const dendritePath = join(__dirname, '..', '..', 'dendrite');
  if (!existsSync(dendritePath)) {
    console.log('Building dendrite...');
    await runCommand('go', ['build', '-o', 'dendrite', '.'], { cwd: join(__dirname, '..', '..') });
  }

  // Start dendrite server with test directory
  return new Promise((resolve, reject) => {
    const args = [
      '--listen', `127.0.0.1:${DENDRITE_PORT}`,
      '--dir', TEST_DIR,
      '--quota', '100MB'
    ];

    console.log(`Starting dendrite with: ${dendritePath} ${args.join(' ')}`);
    
    dendriteProcess = spawn(dendritePath, args, {
      cwd: join(__dirname, '..', '..'),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverStarted = false;
    const startTimeout = setTimeout(() => {
      if (!serverStarted) {
        dendriteProcess.kill('SIGKILL');
        reject(new Error('Dendrite server failed to start within timeout'));
      }
    }, 20000); // Increase timeout to 20 seconds for slower CI environments

    dendriteProcess.stdout.on('data', (data) => {
      const message = data.toString();
      console.log('Dendrite:', message);
      if (message.includes('Server started') || message.includes('Starting Dendrite')) {
        serverStarted = true;
        clearTimeout(startTimeout);
        
        // Wait for server to be fully ready by checking if it responds
        const checkServer = async () => {
          const http = require('http');
          const maxAttempts = 60; // Increase to 60 attempts for CI
          
          for (let i = 0; i < maxAttempts; i++) {
            try {
              await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${DENDRITE_PORT}/`, (res) => {
                  let data = '';
                  res.on('data', chunk => data += chunk);
                  res.on('end', () => {
                    if (res.statusCode === 200 || res.statusCode === 404) {
                      // Additional check: verify we get HTML response
                      if (res.statusCode === 200 && !data.includes('<html')) {
                        reject(new Error('Server responded but not with HTML'));
                      } else {
                        resolve();
                      }
                    } else {
                      reject(new Error(`Server returned ${res.statusCode}`));
                    }
                  });
                });
                req.on('error', reject);
                req.setTimeout(2000); // Increase timeout
              });
              
              // Do a second check to ensure server is stable
              await new Promise(r => setTimeout(r, 1000));
              
              // Verify again that server is still responding
              await new Promise((resolve, reject) => {
                const req = http.get(`http://127.0.0.1:${DENDRITE_PORT}/`, (res) => {
                  if (res.statusCode === 200 || res.statusCode === 404) {
                    resolve();
                  } else {
                    reject(new Error(`Server became unresponsive`));
                  }
                });
                req.on('error', reject);
                req.setTimeout(1000);
              });
              
              console.log('Dendrite server is ready and responding consistently');
              resolve();
              return;
            } catch (err) {
              // Server not ready yet, wait and retry
              if (i % 10 === 0) {
                console.log(`Still waiting for server... (attempt ${i + 1}/${maxAttempts})`);
              }
              await new Promise(r => setTimeout(r, 1000)); // Increase wait time
            }
          }
          
          reject(new Error('Server started but not responding to requests after 60 attempts'));
        };
        
        checkServer().catch(reject);
      }
    });

    dendriteProcess.stderr.on('data', (data) => {
      const errorMsg = data.toString();
      console.error('Dendrite error:', errorMsg);
      
      // If we get a bind error, reject immediately
      if (errorMsg.includes('bind: address already in use')) {
        clearTimeout(startTimeout);
        serverStarted = true; // Prevent timeout error
        reject(new Error('Port already in use: ' + errorMsg));
      }
    });

    dendriteProcess.on('error', (err) => {
      clearTimeout(startTimeout);
      console.error('Failed to start dendrite:', err);
      reject(err);
    });

    dendriteProcess.on('exit', (code) => {
      clearTimeout(startTimeout);
      if (code !== 0 && code !== null && !serverStarted) {
        reject(new Error(`Dendrite exited with code ${code}`));
      }
    });
  });
}

async function teardownTestEnvironment() {
  // Kill dendrite process
  if (dendriteProcess) {
    console.log('Stopping dendrite server...');
    try {
      // First try graceful shutdown
      dendriteProcess.kill('SIGTERM');
      
      // Wait for process to exit gracefully
      await new Promise((resolve) => {
        let timeout;
        
        const checkExit = () => {
          if (dendriteProcess.killed || !dendriteProcess.pid) {
            clearTimeout(timeout);
            resolve();
          }
        };
        
        // Check every 100ms
        const interval = setInterval(checkExit, 100);
        
        // Force kill after 5 seconds if still running
        timeout = setTimeout(() => {
          clearInterval(interval);
          if (!dendriteProcess.killed && dendriteProcess.pid) {
            console.log('Force killing dendrite server...');
            try {
              dendriteProcess.kill('SIGKILL');
            } catch (e) {
              // Process might already be dead
            }
          }
          resolve();
        }, 5000);
        
        // Also resolve if process exits
        dendriteProcess.once('exit', () => {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch (error) {
      console.log('Error stopping dendrite:', error.message);
    }
    
    dendriteProcess = null;
  }

  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    console.log('Cleaning up test directory...');
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch (error) {
      console.log('Error cleaning test directory:', error.message);
    }
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';

    if (child.stdout) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
  });
}

module.exports = {
  setupTestEnvironment,
  teardownTestEnvironment,
  TEST_DIR,
  DENDRITE_PORT
};