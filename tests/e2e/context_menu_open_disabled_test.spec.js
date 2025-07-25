const { test, expect } = require('@playwright/test');

test.describe('Context Menu Open Action', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForSelector('#file-list-body');
  });

  test('should disable "Open" action for files in context menu', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file (not a directory)
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    
    // Right-click on the file
    await fileRow.click({ button: 'right' });
    
    // Wait for context menu to appear
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Check that the "Open" menu item is disabled
    const openMenuItem = page.locator('[data-action="open"]');
    await expect(openMenuItem).toHaveClass(/disabled/);
    
    // Verify the menu item has the correct styling
    await expect(openMenuItem).toHaveCSS('opacity', '0.5');
    await expect(openMenuItem).toHaveCSS('cursor', 'not-allowed');
    await expect(openMenuItem).toHaveCSS('pointer-events', 'none');
  });

  test('should enable "Open" action for folders in context menu', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a directory
    const folderRow = await page.locator('.file-row[data-is-dir="true"]').first();
    
    // Right-click on the folder
    await folderRow.click({ button: 'right' });
    
    // Wait for context menu to appear
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Check that the "Open" menu item is NOT disabled
    const openMenuItem = page.locator('[data-action="open"]');
    await expect(openMenuItem).not.toHaveClass(/disabled/);
    
    // Verify the menu item doesn't have disabled styling
    await expect(openMenuItem).not.toHaveCSS('opacity', '0.5');
  });

  test('should disable "Open" action when multiple items are selected', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Select multiple items
    const checkboxes = await page.locator('.file-checkbox').all();
    if (checkboxes.length >= 2) {
      await checkboxes[0].check();
      await checkboxes[1].check();
      
      // Right-click on one of the selected items
      const firstRow = await page.locator('.file-row').first();
      await firstRow.click({ button: 'right' });
      
      // Wait for context menu to appear
      await page.waitForSelector('#context-menu:not(.hidden)');
      
      // Check that the "Open" menu item is disabled
      const openMenuItem = page.locator('[data-action="open"]');
      await expect(openMenuItem).toHaveClass(/disabled/);
    }
  });

  test('should not perform any action when clicking disabled "Open" item', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file (not a directory)
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    const fileName = await fileRow.getAttribute('data-path');
    
    // Right-click on the file
    await fileRow.click({ button: 'right' });
    
    // Wait for context menu to appear
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Try to click the disabled "Open" menu item
    const openMenuItem = page.locator('[data-action="open"]');
    
    // Store current URL
    const currentUrl = page.url();
    
    // Attempt to click the disabled item
    await openMenuItem.click({ force: true }); // Force click even though it's disabled
    
    // Verify no navigation occurred
    await expect(page).toHaveURL(currentUrl);
    
    // Verify no download was initiated
    const downloadPromise = page.waitForEvent('download', { timeout: 1000 }).catch(() => null);
    const download = await downloadPromise;
    expect(download).toBeNull();
    
    // Context menu should still be hidden after click
    await expect(page.locator('#context-menu')).toHaveClass(/hidden/);
  });

  test('should still allow "Download" action for files', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file (not a directory)
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    
    // Right-click on the file
    await fileRow.click({ button: 'right' });
    
    // Wait for context menu to appear
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Check that the "Download" menu item is NOT disabled
    const downloadMenuItem = page.locator('[data-action="download"]');
    await expect(downloadMenuItem).not.toHaveClass(/disabled/);
  });
});