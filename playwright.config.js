// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI ? [
    ['list'],  // Simple list output for CI
    ['html', { open: 'never' }],  // Generate HTML report but don't open it
    ['junit', { outputFile: 'test-results/junit.xml' }]  // JUnit for CI systems
  ] : [
    ['html', { open: 'on-failure' }]  // Open HTML report only on failure for local dev
  ],
  /* Increase timeout for CI environments */
  timeout: process.env.CI ? 60000 : 30000,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://127.0.0.1:3001',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Additional timeout settings for CI */
    actionTimeout: process.env.CI ? 15000 : 5000,
    navigationTimeout: process.env.CI ? 45000 : 15000,
    
    /* Video recording for debugging CI failures */
    video: process.env.CI ? 'retain-on-failure' : 'off',
    
    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { 
        ...devices['Desktop Safari'],
        // Special configuration for webkit in CI
        launchOptions: process.env.CI ? {
          // Slower animations in CI
          slowMo: 100,
        } : {},
      },
    },
  ],

  /* Global setup and teardown */
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.js'),
});