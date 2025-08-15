const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Editor Modal Close Behavior', () => {
    const testDataDir = path.join(__dirname, 'test-data');
    const testFilePath = path.join(testDataDir, 'modal-close-test.txt');
    const testContent = 'Original content for modal close test';

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
        
        // Open the editor in modal
        const fileRow = page.locator('.file-row').filter({ hasText: 'modal-close-test.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor modal to open
        await expect(page.locator('#editor-modal')).toBeVisible();
        await page.frameLocator('#editor-modal-iframe').locator('#editor-container').waitFor();
    });

    test('should close modal without confirmation when no changes', async ({ page }) => {
        // Click close button without making changes
        await page.click('.editor-modal-close');
        
        // Modal should close immediately without any dialog
        await expect(page.locator('#editor-modal')).toBeHidden({ timeout: 1000 });
    });

    test('should show custom confirmation when closing with unsaved changes', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        
        // Make a change
        await editor.click();
        await page.keyboard.type(' MODIFIED');
        
        // Set up dialog handler
        let dialogMessage = '';
        page.once('dialog', dialog => {
            dialogMessage = dialog.message();
            dialog.dismiss(); // Cancel the close
        });
        
        // Try to close
        await page.click('.editor-modal-close');
        
        // Wait for dialog
        await page.waitForTimeout(200);
        
        // Check the dialog message
        expect(dialogMessage).toContain('unsaved changes');
        expect(dialogMessage).toContain('close the editor without saving');
        expect(dialogMessage).not.toContain('leave the page'); // Should not mention "page"
        
        // Modal should still be visible (user cancelled)
        await expect(page.locator('#editor-modal')).toBeVisible();
    });

    test('should close modal when user confirms despite unsaved changes', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        
        // Make a change
        await editor.click();
        await page.keyboard.type(' MODIFIED');
        
        // Set up dialog handler to accept
        page.once('dialog', dialog => {
            dialog.accept(); // Confirm the close
        });
        
        // Try to close
        await page.click('.editor-modal-close');
        
        // Modal should close after confirmation
        await expect(page.locator('#editor-modal')).toBeHidden({ timeout: 2000 });
    });

    test('should handle escape key with unsaved changes', async ({ page }) => {
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        
        // Make a change
        await editor.click();
        await editor.type(' MODIFIED');
        
        // Wait for changes to register
        await page.waitForTimeout(500);
        
        // Set up dialog handler
        let dialogShown = false;
        page.once('dialog', dialog => {
            dialogShown = true;
            dialog.dismiss(); // Cancel the close
        });
        
        // Press escape
        await page.keyboard.press('Escape');
        
        // Wait for dialog
        await page.waitForTimeout(500);
        
        // Check that dialog was shown
        expect(dialogShown).toBe(true);
        
        // Modal should still be visible (user cancelled)
        await expect(page.locator('#editor-modal')).toBeVisible({ timeout: 5000 });
    });

    test('should not interfere with standalone window mode', async ({ page, context }) => {
        // Open editor in new window instead of modal
        const fileRow = page.locator('.file-row').filter({ hasText: 'modal-close-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        
        // Wait for context menu
        await page.waitForTimeout(500);
        
        // Open in new window
        const [newPage] = await Promise.all([
            context.waitForEvent('page', { timeout: 20000 }),
            page.click('[data-action="edit-window"]')
        ]);
        
        await newPage.waitForLoadState('networkidle', { timeout: 20000 });
        await newPage.waitForSelector('#editor-container', { timeout: 20000 });
        
        // Wait for editor to fully load
        await newPage.waitForTimeout(1000);
        
        // Make a change in the standalone window
        const editor = newPage.locator('.simple-editor');
        await editor.click();
        await editor.type(' MODIFIED');
        
        // Wait for changes to register
        await newPage.waitForTimeout(500);
        
        // Verify the window is in standalone mode
        const isModal = await newPage.evaluate(() => {
            return window.self !== window.top;
        });
        
        expect(isModal).toBe(false); // Should be standalone, not in iframe
        
        // Force close without dialog
        await newPage.close({ runBeforeUnload: false });
    });
});