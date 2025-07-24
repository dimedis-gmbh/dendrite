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

    dendriteProcess.stdout.on('data', (data) => {
      const message = data.toString();
      console.log('Dendrite:', message);
      if (message.includes('Server started') || message.includes('Starting Dendrite')) {
        // Give it a moment to fully start
        setTimeout(() => {
          console.log('Dendrite server is ready');
          resolve();
        }, 1000);
      }
    });

    dendriteProcess.stderr.on('data', (data) => {
      console.error('Dendrite error:', data.toString());
    });

    dendriteProcess.on('error', (err) => {
      console.error('Failed to start dendrite:', err);
      reject(err);
    });

    dendriteProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Dendrite exited with code ${code}`);
      }
    });

    // Timeout if server doesn't start
    setTimeout(() => {
      reject(new Error('Dendrite server failed to start within timeout'));
    }, 10000);
  });
}

async function teardownTestEnvironment() {
  // Kill dendrite process
  if (dendriteProcess) {
    console.log('Stopping dendrite server...');
    dendriteProcess.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!dendriteProcess.killed) {
      dendriteProcess.kill('SIGKILL');
    }
    dendriteProcess = null;
  }

  // Clean up test directory
  if (existsSync(TEST_DIR)) {
    console.log('Cleaning up test directory...');
    rmSync(TEST_DIR, { recursive: true, force: true });
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