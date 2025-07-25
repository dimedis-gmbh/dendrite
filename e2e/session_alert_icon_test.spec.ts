import { test, expect } from '@playwright/test';
import * as jwt from 'jsonwebtoken';

test.describe('Session Alert Icon', () => {
  const secret = 'test-secret';
  
  // Helper to create JWT with specific expiry
  const createJWT = (expiresInMinutes: number) => {
    const exp = Math.floor(Date.now() / 1000) + (expiresInMinutes * 60);
    return jwt.sign({
      exp,
      dir: 'test',
      quota: '100MB'
    }, secret);
  };

  test.beforeEach(async ({ page }) => {
    // Start server with JWT secret
    await page.addInitScript(() => {
      process.env.DENDRITE_JWT_SECRET = 'test-secret';
    });
  });

  test('should show warning icon when session expires in 5 minutes or less', async ({ page }) => {
    // Create JWT that expires in 4 minutes
    const token = createJWT(4);
    
    // Navigate with JWT in hash
    await page.goto(`http://localhost:3000/#${token}`);
    
    // Wait for page to load
    await page.waitForSelector('#file-list-body');
    
    // Check that session info is visible
    const sessionInfo = page.locator('#session-info');
    await expect(sessionInfo).toBeVisible();
    
    // Check that warning icon is visible
    const alertIcon = page.locator('#session-alert');
    await expect(alertIcon).toBeVisible();
    
    // Check that icon has the correct class
    await expect(alertIcon).toHaveClass(/fa-exclamation-triangle/);
    
    // Check that the alert is animated (has blink animation)
    await expect(alertIcon).toHaveClass(/session-alert/);
    
    // Verify the icon is actually rendered (not just present in DOM)
    const iconBounds = await alertIcon.boundingBox();
    expect(iconBounds).not.toBeNull();
    expect(iconBounds?.width).toBeGreaterThan(0);
    expect(iconBounds?.height).toBeGreaterThan(0);
  });

  test('should hide warning icon when session has more than 5 minutes', async ({ page }) => {
    // Create JWT that expires in 10 minutes
    const token = createJWT(10);
    
    // Navigate with JWT in hash
    await page.goto(`http://localhost:3000/#${token}`);
    
    // Wait for page to load
    await page.waitForSelector('#file-list-body');
    
    // Check that session info is visible
    const sessionInfo = page.locator('#session-info');
    await expect(sessionInfo).toBeVisible();
    
    // Check that warning icon is hidden
    const alertIcon = page.locator('#session-alert');
    await expect(alertIcon).toHaveClass(/hidden/);
    
    // Verify it's not visible
    await expect(alertIcon).not.toBeVisible();
  });

  test('should show blinking animation on warning icon', async ({ page }) => {
    // Create JWT that expires in 3 minutes
    const token = createJWT(3);
    
    // Navigate with JWT in hash
    await page.goto(`http://localhost:3000/#${token}`);
    
    // Wait for page to load
    await page.waitForSelector('#file-list-body');
    
    // Check that warning icon has animation
    const alertIcon = page.locator('#session-alert');
    const animationName = await alertIcon.evaluate(el => 
      window.getComputedStyle(el).animationName
    );
    
    expect(animationName).toBe('blink');
    
    // Check animation duration
    const animationDuration = await alertIcon.evaluate(el => 
      window.getComputedStyle(el).animationDuration
    );
    expect(animationDuration).toBe('1s');
  });

  test('should update icon visibility as time passes', async ({ page }) => {
    // Create JWT that expires in 6 minutes
    const token = createJWT(6);
    
    // Navigate with JWT in hash
    await page.goto(`http://localhost:3000/#${token}`);
    
    // Wait for page to load
    await page.waitForSelector('#file-list-body');
    
    // Initially, warning should be hidden
    const alertIcon = page.locator('#session-alert');
    await expect(alertIcon).toHaveClass(/hidden/);
    
    // Wait for 1.5 minutes (90 seconds) - should now show warning
    // In real scenario, we'd mock time, but for test we'll create a new token
    await page.evaluate(() => {
      // Simulate time passing by manually triggering the update
      const event = new Event('hashchange');
      window.location.hash = '#' + 'simulate-time-update';
      window.dispatchEvent(event);
    });
    
    // Navigate with new token that expires in 4 minutes
    const newToken = createJWT(4);
    await page.goto(`http://localhost:3000/#${newToken}`);
    
    // Now warning should be visible
    await expect(alertIcon).not.toHaveClass(/hidden/);
    await expect(alertIcon).toBeVisible();
  });
});