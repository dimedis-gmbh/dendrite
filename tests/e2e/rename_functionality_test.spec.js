const { test, expect } = require('@playwright/test');

test.describe('Rename Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForSelector('#file-list-body');
  });

  test('should show rename dialog when clicking rename in context menu', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    const originalName = await fileRow.getAttribute('data-path');
    
    // Right-click on the file
    await fileRow.click({ button: 'right' });
    
    // Wait for context menu
    await page.waitForSelector('#context-menu:not(.hidden)');
    
    // Set up dialog handler before clicking rename
    page.once('dialog', async dialog => {
      expect(dialog.type()).toBe('prompt');
      expect(dialog.message()).toBe('Enter new name:');
      expect(dialog.defaultValue()).toBeTruthy(); // Should have current filename
      await dialog.dismiss(); // Cancel for this test
    });
    
    // Click rename
    await page.locator('[data-action="rename"]').click();
    
    // Context menu should be hidden
    await expect(page.locator('#context-menu')).toHaveClass(/hidden/);
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
    }, { timeout: 5000 });
    
    // Wait a moment for file list to refresh
    await page.waitForTimeout(500);
    
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
    
    // Wait for both dialogs to be handled
    await page.waitForTimeout(1500);
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
    
    // Wait for both dialogs
    await page.waitForTimeout(1500);
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
    await page.waitForTimeout(500);
    
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
    }, { timeout: 5000 });
    
    // Wait a moment for file list to refresh
    await page.waitForTimeout(500);
    
    // Check that the folder with new name exists
    await page.waitForSelector(`[data-path*="${newName}"][data-is-dir="true"]`);
  });
});