const { test, expect } = require('@playwright/test');

test.describe('Rename Functionality', () => {
  test.beforeEach(async ({ page, browserName }) => {
    // Set up console logging for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });
    
    // Navigate with retry logic for webkit
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(`Navigation failed, retrying... (${retries} retries left)`);
        await page.waitForTimeout(2000);
      }
    }
    
    // Wait for the app to load with extended timeout
    await page.waitForSelector('#file-list-body', { timeout: 20000 });
    
    // Wait for initial file load with more robust check
    await page.waitForFunction(() => {
      const tbody = document.querySelector('#file-list-body');
      // Check that tbody exists and has children
      if (!tbody) return false;
      // For webkit, also check that the first row is fully rendered
      const firstRow = tbody.querySelector('.file-row');
      if (!firstRow) return false;
      // Check that the row has content
      const nameCell = firstRow.querySelector('.col-name');
      return nameCell && nameCell.textContent && nameCell.textContent.trim().length > 0;
    }, { timeout: 20000 });
    
    // Additional wait for webkit to ensure full render
    if (browserName === 'webkit') {
      await page.waitForTimeout(500);
    }
  });

  test('should show rename dialog when clicking rename in context menu', async ({ page, browserName }) => {
    // Wait for files to load with extra time for CI
    await page.waitForSelector('.file-row', { timeout: process.env.CI ? 20000 : 10000 });
    
    // Additional wait for webkit
    if (browserName === 'webkit' && process.env.CI) {
      await page.waitForTimeout(1000);
    }
    
    // Find a file
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    const originalName = await fileRow.getAttribute('data-path');
    
    // Right-click on the file
    await fileRow.click({ button: 'right' });
    
    // Wait for context menu with extended timeout
    await page.waitForSelector('#context-menu:not(.hidden)', { timeout: process.env.CI ? 10000 : 5000 });
    
    // Set up dialog handler before clicking rename
    let dialogHandled = false;
    page.once('dialog', async dialog => {
      dialogHandled = true;
      expect(dialog.type()).toBe('prompt');
      expect(dialog.message()).toBe('Enter new name:');
      expect(dialog.defaultValue()).toBeTruthy(); // Should have current filename
      await dialog.dismiss(); // Cancel for this test
    });
    
    // Click rename with increased timeout for CI
    await page.locator('[data-action="rename"]').click({ timeout: process.env.CI ? 10000 : 5000 });
    
    // Wait for dialog to appear and be handled
    await page.waitForTimeout(process.env.CI ? 2000 : 500);
    
    // Context menu should be hidden
    await expect(page.locator('#context-menu')).toHaveClass(/hidden/, { timeout: process.env.CI ? 10000 : 5000 });
  });

  test('should rename file successfully', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    
    // Right-click on the file
    await fileRow.click({ button: 'right' });
    
    // Wait for context menu
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Set up dialog handler to accept with new name
    const newName = `renamed_${Date.now()}.txt`;
    page.once('dialog', async dialog => {
      await dialog.accept(newName);
    });
    
    // Click rename
    await page.locator('[data-action="rename"]').click();
    
    // Wait for the toast success message or file list refresh
    await page.waitForFunction(() => {
      const toast = document.querySelector('.toast.success');
      return toast && toast.textContent.includes('Successfully renamed');
    }, { timeout: process.env.CI ? 15000 : 5000 });
    
    // Wait for file list to refresh - longer in CI
    await page.waitForTimeout(process.env.CI ? 2000 : 500);
    
    // Check that the file with new name exists
    await page.waitForSelector(`[data-path*="${newName}"]`);
  });

  test('should show error when renaming to existing name', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Get names of first two files
    const files = await page.locator('.file-row[data-is-dir="false"]').all();
    if (files.length < 2) {
      test.skip('Not enough files for this test');
      return;
    }
    
    const firstFileName = await files[0].locator('.col-name').textContent();
    const secondFileName = await files[1].locator('.col-name').textContent();
    
    // Right-click on the first file
    await files[0].click({ button: 'right' });
    
    // Wait for context menu
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Set up dialog handlers - first for prompt, then for error
    let dialogCount = 0;
    page.on('dialog', async dialog => {
      dialogCount++;
      if (dialogCount === 1 && dialog.type() === 'prompt') {
        // First dialog - accept with duplicate name
        await dialog.accept(secondFileName.trim());
      } else if (dialogCount === 2 && dialog.type() === 'alert') {
        // Second dialog - error message
        expect(dialog.message()).toContain('already exists');
        await dialog.dismiss();
      }
    });
    
    // Click rename
    await page.locator('[data-action="rename"]').click();
    
    // Wait for both dialogs to be handled - longer wait for CI
    await page.waitForTimeout(process.env.CI ? 3000 : 1500);
    
    // In CI, the dialogs may take longer to appear
    if (process.env.CI && dialogCount < 2) {
      await page.waitForTimeout(2000);
    }
    
    expect(dialogCount).toBe(2);
  });

  test('should disable rename for multiple selections', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Select multiple files
    const checkboxes = await page.locator('.file-checkbox').all();
    if (checkboxes.length >= 2) {
      await checkboxes[0].check();
      await checkboxes[1].check();
      
      // Right-click on one of the selected items
      const firstRow = await page.locator('.file-row').first();
      await firstRow.click({ button: 'right' });
      
      // Wait for context menu
      await page.waitForSelector('#context-menu:not(.hidden)');
      
      // Check that rename is disabled
      const renameItem = page.locator('[data-action="rename"]');
      await expect(renameItem).toHaveClass(/disabled/);
    }
  });

  test('should not allow slashes in new name', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    
    // Right-click on the file
    await fileRow.click({ button: 'right' });
    
    // Wait for context menu
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Set up dialog handlers for both prompt and error
    let dialogCount = 0;
    page.on('dialog', async dialog => {
      dialogCount++;
      if (dialogCount === 1 && dialog.type() === 'prompt') {
        // Accept with invalid name
        await dialog.accept('invalid/name.txt');
      } else if (dialogCount === 2 && dialog.type() === 'alert') {
        // Error dialog
        expect(dialog.message()).toContain('cannot contain / or \\');
        await dialog.dismiss();
      }
    });
    
    // Click rename
    await page.locator('[data-action="rename"]').click();
    
    // Wait for both dialogs - longer wait for CI
    await page.waitForTimeout(process.env.CI ? 3000 : 1500);
    
    // In CI, the dialogs may take longer to appear
    if (process.env.CI && dialogCount < 2) {
      await page.waitForTimeout(2000);
    }
    
    expect(dialogCount).toBe(2);
  });

  test('should cancel rename when dialog is dismissed', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file and note its name
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    const originalPath = await fileRow.getAttribute('data-path');
    
    // Right-click on the file
    await fileRow.click({ button: 'right' });
    
    // Wait for context menu
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Set up dialog handler to cancel
    page.once('dialog', async dialog => {
      await dialog.dismiss();
    });
    
    // Click rename
    await page.locator('[data-action="rename"]').click();
    
    // Verify no loading or error messages appear (wait briefly)
    await page.waitForTimeout(process.env.CI ? 1500 : 500);
    
    // Verify file still has original name - use first() to avoid multiple matches
    const originalFileRow = page.locator(`[data-path="${originalPath}"]`).first();
    await expect(originalFileRow).toBeVisible();
  });

  test('should work for folders as well as files', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a folder
    const folderRow = await page.locator('.file-row[data-is-dir="true"]').first();
    if (!folderRow) {
      test.skip('No folders found for this test');
      return;
    }
    
    // Right-click on the folder
    await folderRow.click({ button: 'right' });
    
    // Wait for context menu
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Check that rename is enabled
    const renameItem = page.locator('[data-action="rename"]');
    await expect(renameItem).not.toHaveClass(/disabled/);
    
    // Set up dialog handler
    const newName = `renamed_folder_${Date.now()}`;
    page.once('dialog', async dialog => {
      await dialog.accept(newName);
    });
    
    // Click rename
    await renameItem.click();
    
    // Wait for the toast success message
    await page.waitForFunction(() => {
      const toast = document.querySelector('.toast.success');
      return toast && toast.textContent.includes('Successfully renamed');
    }, { timeout: process.env.CI ? 15000 : 5000 });
    
    // Wait for file list to refresh - longer in CI
    await page.waitForTimeout(process.env.CI ? 2000 : 500);
    
    // Check that the folder with new name exists
    await page.waitForSelector(`[data-path*="${newName}"][data-is-dir="true"]`);
  });
});