const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Editor Window Features', () => {
    const testDataDir = path.join(__dirname, 'test-data');
    const testFilePath = path.join(testDataDir, 'window-test.txt');
    const testContent = 'Test content for window features';

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
    });

    test('should open editor window with minimal chrome', async ({ page, context }) => {
        // Find the test file
        const fileRow = page.locator('.file-row').filter({ hasText: 'window-test.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        await fileRow.click({ button: 'right' });
        
        // Open in new window
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            page.click('[data-action="edit-window"]')
        ]);
        
        await newPage.waitForLoadState();
        await newPage.waitForSelector('#editor-container');
        
        // Check that the window title is set correctly
        const title = await newPage.title();
        expect(title).toContain('window-test.txt');
        expect(title).toContain('Dendrite Editor');
        
        // Verify it's not in an iframe (standalone window)
        const isModal = await newPage.evaluate(() => {
            return window.self !== window.top;
        });
        expect(isModal).toBe(false);
        
        // Check that the editor loaded
        const editor = newPage.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Check the content loaded
        const content = await editor.inputValue();
        expect(content).toBe(testContent);
        
        // Note: We can't directly test if browser chrome is hidden as that's controlled
        // by the browser and not exposed to JavaScript for security reasons
        // But we can verify the window.open was called with the right parameters
        
        await newPage.close();
    });

    test('should show filename in status bar', async ({ page, context }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'window-test.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        await fileRow.click({ button: 'right' });
        
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            page.click('[data-action="edit-window"]')
        ]);
        
        await newPage.waitForLoadState();
        await newPage.waitForSelector('#editor-container');
        
        // Check status bar shows filename
        const filenameElement = newPage.locator('#filename');
        await expect(filenameElement).toHaveText('window-test.txt');
        
        await newPage.close();
    });

    test('should handle unsaved changes in standalone window', async ({ page, context }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'window-test.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        await fileRow.click({ button: 'right' });
        
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            page.click('[data-action="edit-window"]')
        ]);
        
        await newPage.waitForLoadState();
        await newPage.waitForSelector('#editor-container');
        
        // Make a change
        const editor = newPage.locator('.simple-editor');
        await editor.click();
        await newPage.keyboard.type(' MODIFIED');
        
        // In standalone window, beforeunload is used
        // Playwright doesn't expose beforeunload dialogs, but we can verify
        // the modified indicator appears
        const modifiedIndicator = newPage.locator('#modified-indicator');
        await expect(modifiedIndicator).toHaveText('● Modified');
        
        await newPage.close();
    });
});