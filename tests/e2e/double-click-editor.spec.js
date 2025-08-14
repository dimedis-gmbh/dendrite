const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Double-click Editor Opening', () => {
    const testDataDir = path.join(__dirname, 'test-data');
    
    test.beforeAll(async () => {
        // Ensure test directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        
        // Create test files
        fs.writeFileSync(path.join(testDataDir, 'test.txt'), 'Text file content');
        fs.writeFileSync(path.join(testDataDir, 'test.js'), 'console.log("JavaScript");');
        fs.writeFileSync(path.join(testDataDir, 'test.md'), '# Markdown content');
        fs.writeFileSync(path.join(testDataDir, 'test.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
        fs.writeFileSync(path.join(testDataDir, 'test.pdf'), 'PDF mock content');
        
        // Create a subdirectory
        const subDir = path.join(testDataDir, 'subfolder');
        if (!fs.existsSync(subDir)) {
            fs.mkdirSync(subDir);
        }
    });

    test.beforeEach(async ({ page }) => {
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
    });

    test('should open text file in editor on double-click', async ({ page, context }) => {
        // Find the text file
        const fileRow = page.locator('.file-row').filter({ hasText: 'test.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Double-click should open editor in new window
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            fileRow.dblclick()
        ]);
        
        await newPage.waitForLoadState();
        await newPage.waitForSelector('#editor-container');
        
        // Verify it's the editor
        const title = await newPage.title();
        expect(title).toContain('test.txt');
        expect(title).toContain('Dendrite Editor');
        
        // Verify content loaded
        const editor = newPage.locator('.simple-editor');
        const content = await editor.inputValue();
        expect(content).toBe('Text file content');
        
        await newPage.close();
    });

    test('should open JavaScript file in editor on double-click', async ({ page, context }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'test.js' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            fileRow.dblclick()
        ]);
        
        await newPage.waitForLoadState();
        await newPage.waitForSelector('#editor-container');
        
        const title = await newPage.title();
        expect(title).toContain('test.js');
        
        const editor = newPage.locator('.simple-editor');
        const content = await editor.inputValue();
        expect(content).toBe('console.log("JavaScript");');
        
        await newPage.close();
    });

    test('should open Markdown file in editor on double-click', async ({ page, context }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'test.md' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            fileRow.dblclick()
        ]);
        
        await newPage.waitForLoadState();
        await newPage.waitForSelector('#editor-container');
        
        const title = await newPage.title();
        expect(title).toContain('test.md');
        
        const editor = newPage.locator('.simple-editor');
        const content = await editor.inputValue();
        expect(content).toBe('# Markdown content');
        
        await newPage.close();
    });

    test('should show properties for binary file on double-click', async ({ page }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'test.bin' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Double-click binary file
        await fileRow.dblclick();
        
        // Should show properties modal instead of editor
        const propertiesModal = page.locator('.modal').filter({ hasText: 'File Properties' });
        await expect(propertiesModal).toBeVisible();
        
        // Verify it shows the correct file
        const filenameText = propertiesModal.locator('text=/test\\.bin/');
        await expect(filenameText).toBeVisible();
        
        // Close the modal
        await page.click('.modal .close');
        await expect(propertiesModal).toBeHidden();
    });

    test('should show properties for PDF file on double-click', async ({ page }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'test.pdf' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Double-click PDF file
        await fileRow.dblclick();
        
        // Should show properties modal instead of editor
        const propertiesModal = page.locator('.modal').filter({ hasText: 'File Properties' });
        await expect(propertiesModal).toBeVisible();
        
        // Close the modal
        await page.click('.modal .close');
        await expect(propertiesModal).toBeHidden();
    });

    test('should navigate into directory on double-click', async ({ page }) => {
        const dirRow = page.locator('.file-row').filter({ hasText: 'subfolder' }).first();
        await expect(dirRow).toBeVisible({ timeout: 10000 });
        
        // Get current path
        const breadcrumb = page.locator('.path-segment').last();
        const initialPath = await breadcrumb.textContent();
        
        // Double-click directory
        await dirRow.dblclick();
        
        // Wait for navigation
        await page.waitForTimeout(500);
        
        // Check that we navigated into the directory
        const newBreadcrumb = page.locator('.path-segment').last();
        const newPath = await newBreadcrumb.textContent();
        expect(newPath).toBe('subfolder');
        expect(newPath).not.toBe(initialPath);
    });

    test('right-click menu should still work for editable files', async ({ page }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'test.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Right-click should show context menu
        await fileRow.click({ button: 'right' });
        
        // Context menu should be visible
        const contextMenu = page.locator('#context-menu');
        await expect(contextMenu).toBeVisible();
        
        // Should have both edit options
        await expect(page.locator('[data-action="edit-modal"]')).toBeVisible();
        await expect(page.locator('[data-action="edit-window"]')).toBeVisible();
        
        // Close context menu
        await page.keyboard.press('Escape');
        await expect(contextMenu).toBeHidden();
    });
});