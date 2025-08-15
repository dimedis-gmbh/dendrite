const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Editor Menu Behavior Tests', () => {
    const testDataDir = path.join(__dirname, 'test-data');
    const testFilePath = path.join(testDataDir, 'menu-test.txt');
    const testContent = 'Line 1: Test content\nLine 2: For menu testing\nLine 3: Last line';

    test.beforeAll(async () => {
        // Ensure test directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
    });

    test.beforeEach(async ({ page }) => {
        // Create test file with known content
        fs.writeFileSync(testFilePath, testContent);
        
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
        
        // Open the editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'menu-test.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        await expect(page.locator('#editor-modal')).toBeVisible();
        await page.frameLocator('#editor-modal-iframe').locator('#editor-container').waitFor();
    });

    test('menu should close after clicking Save', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Open File menu
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).toHaveClass(/active/);
        
        // Click Save
        await iframe.locator('[data-action="save"]').click();
        
        // Menu should be closed immediately
        await expect(iframe.locator('.menu-item[data-menu="file"]')).not.toHaveClass(/active/);
        
        // Verify no dropdown is visible
        await expect(iframe.locator('.menu-item[data-menu="file"] .dropdown')).not.toBeVisible();
    });

    test('menu should close after clicking Copy', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Select some text first
        const editor = iframe.locator('.simple-editor');
        await editor.click();
        await page.keyboard.press('Control+A');
        
        // Open Edit menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // Click Copy
        await iframe.locator('[data-action="copy"]').click();
        
        // Menu should be closed immediately
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });

    test('menu should close after clicking Cut', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Select some text first
        const editor = iframe.locator('.simple-editor');
        await editor.click();
        await page.keyboard.press('Control+A');
        
        // Open Edit menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // Click Cut
        await iframe.locator('[data-action="cut"]').click();
        
        // Menu should be closed immediately
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });

    test('menu should close after clicking Paste', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Copy something first
        const editor = iframe.locator('.simple-editor');
        await editor.click();
        await page.keyboard.type('test');
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Control+C');
        
        // Open Edit menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // Click Paste
        await iframe.locator('[data-action="paste"]').click();
        
        // Menu should be closed immediately
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });

    test('menu should close after clicking Undo', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Open Edit menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // Click Undo
        await iframe.locator('[data-action="undo"]').click();
        
        // Menu should be closed immediately
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });

    test('menu should close after clicking Redo', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Open Edit menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // Click Redo
        await iframe.locator('[data-action="redo"]').click();
        
        // Menu should be closed immediately
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });

    test('menu should close after clicking Find', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Open Edit menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // We need to handle the prompt dialog
        page.once('dialog', dialog => {
            dialog.dismiss(); // Cancel the find dialog
        });
        
        // Click Find
        await iframe.locator('[data-action="find"]').click();
        
        // Menu should be closed immediately after dismissing dialog
        await page.waitForTimeout(100);
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });

    test('only one save request should be sent when pressing Ctrl+S', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        
        // Track network requests
        let saveRequests = [];
        page.on('request', request => {
            if (request.method() === 'PUT' && request.url().includes('/api/files/')) {
                saveRequests.push(request.url());
            }
        });
        
        // Wait for content to load first
        await page.waitForTimeout(500);
        
        // Make a change - ensure the text is actually typed
        await editor.click();
        await editor.focus();
        await page.waitForTimeout(100);
        
        // Type and verify the text is modified
        await page.keyboard.type(' Modified');
        
        // Trigger input event to ensure modification is detected
        await editor.dispatchEvent('input');
        await page.waitForTimeout(100);
        
        // Clear requests array
        saveRequests = [];
        
        // Press Ctrl+S
        await page.keyboard.press('Control+S');
        
        // Wait a bit for any duplicate requests
        await page.waitForTimeout(1000);
        
        // Should have exactly one save request
        expect(saveRequests.length).toBe(1);
        
        if (saveRequests.length > 1) {
            console.error('Duplicate save requests detected:', saveRequests);
        }
    });

    test('only one save request should be sent when clicking File->Save', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        
        // Track network requests
        let saveRequests = [];
        page.on('request', request => {
            if (request.method() === 'PUT' && request.url().includes('/api/files/')) {
                saveRequests.push(request.url());
            }
        });
        
        // Wait for content to load first
        await page.waitForTimeout(500);
        
        // Make a change - ensure the text is actually typed
        await editor.click();
        await editor.focus();
        await page.waitForTimeout(100);
        
        // Type and verify the text is modified
        await page.keyboard.type(' Modified');
        
        // Trigger input event to ensure modification is detected
        await editor.dispatchEvent('input');
        await page.waitForTimeout(100);
        
        // Clear requests array
        saveRequests = [];
        
        // Click File -> Save
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await iframe.locator('[data-action="save"]').click();
        
        // Wait a bit for any duplicate requests
        await page.waitForTimeout(500);
        
        // Should have exactly one save request
        expect(saveRequests.length).toBe(1);
        
        if (saveRequests.length > 1) {
            console.error('Duplicate save requests detected:', saveRequests);
        }
    });

    test('menu should not reopen after action due to event bubbling', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Open File menu
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).toHaveClass(/active/);
        
        // Click Save
        await iframe.locator('[data-action="save"]').click();
        
        // Wait to see if menu reopens due to bubbling
        await page.waitForTimeout(200);
        
        // Menu should still be closed
        await expect(iframe.locator('.menu-item[data-menu="file"]')).not.toHaveClass(/active/);
    });

    test('clicking outside menu should close it', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Open File menu
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).toHaveClass(/active/);
        
        // Click outside (on the editor)
        await iframe.locator('.simple-editor').click();
        
        // Menu should be closed
        await expect(iframe.locator('.menu-item[data-menu="file"]')).not.toHaveClass(/active/);
    });

    test('switching between menus should work correctly', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Open File menu
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).toHaveClass(/active/);
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
        
        // Click Edit menu (should close File and open Edit)
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).not.toHaveClass(/active/);
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // Click File menu again
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).toHaveClass(/active/);
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });

    test('menu should not open on hover, only on click', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Hover over File menu without clicking
        await iframe.locator('.menu-item[data-menu="file"]').hover();
        
        // Menu should NOT be active or visible
        await expect(iframe.locator('.menu-item[data-menu="file"]')).not.toHaveClass(/active/);
        await expect(iframe.locator('.menu-item[data-menu="file"] .dropdown')).not.toBeVisible();
        
        // Now click to open
        await iframe.locator('.menu-item[data-menu="file"]').click();
        
        // Menu should be active and visible
        await expect(iframe.locator('.menu-item[data-menu="file"]')).toHaveClass(/active/);
        await expect(iframe.locator('.menu-item[data-menu="file"] .dropdown')).toBeVisible();
        
        // Click outside to close
        await iframe.locator('.simple-editor').click();
        
        // Hover over Edit menu without clicking
        await iframe.locator('.menu-item[data-menu="edit"]').hover();
        
        // Edit menu should also NOT open on hover
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
        await expect(iframe.locator('.menu-item[data-menu="edit"] .dropdown')).not.toBeVisible();
    });

    test('text selection should be preserved when clicking menu', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        
        // Wait for content to load
        await page.waitForTimeout(500);
        
        // Select some text
        await editor.click();
        await page.keyboard.press('Control+A');
        
        // Get the selection before clicking menu
        const selectionBefore = await iframe.locator('.simple-editor').evaluate((textarea) => {
            return {
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
                hasSelection: textarea.selectionStart !== textarea.selectionEnd
            };
        });
        
        // Verify we have a selection
        expect(selectionBefore.hasSelection).toBe(true);
        
        // Click on Edit menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        
        // Check that selection is preserved
        const selectionAfter = await iframe.locator('.simple-editor').evaluate((textarea) => {
            return {
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
                hasSelection: textarea.selectionStart !== textarea.selectionEnd
            };
        });
        
        // Selection should be preserved
        expect(selectionAfter.hasSelection).toBe(true);
        expect(selectionAfter.start).toBe(selectionBefore.start);
        expect(selectionAfter.end).toBe(selectionBefore.end);
    });

    test('clicking the same menu item should toggle it closed', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Click File menu to open
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).toHaveClass(/active/);
        await expect(iframe.locator('.menu-item[data-menu="file"] .dropdown')).toBeVisible();
        
        // Click File menu again to close
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).not.toHaveClass(/active/);
        await expect(iframe.locator('.menu-item[data-menu="file"] .dropdown')).not.toBeVisible();
        
        // Click Edit menu to open
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // Click Edit menu again to close
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });
});