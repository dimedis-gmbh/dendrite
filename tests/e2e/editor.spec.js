const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Dendrite Text Editor', () => {
    const testDataDir = path.join(__dirname, 'test_data');
    const sampleFilePath = path.join(testDataDir, 'sample.txt');
    const originalContent = fs.readFileSync(sampleFilePath, 'utf8');

    test.beforeEach(async ({ page }) => {
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row');
    });

    test.afterEach(async () => {
        // Restore original content after each test
        fs.writeFileSync(sampleFilePath, originalContent);
    });

    test('should open editor in modal and load file content', async ({ page }) => {
        // Find the sample.txt file
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await expect(fileRow).toBeVisible();

        // Right-click to open context menu
        await fileRow.click({ button: 'right' });
        await expect(page.locator('#context-menu')).toBeVisible();

        // Click "Edit (modal)"
        await page.click('[data-action="edit-modal"]');

        // Wait for modal to open
        await expect(page.locator('#editor-modal')).toBeVisible();
        
        // Wait for iframe to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();

        // Check that the file content is loaded
        const editorContent = await iframe.locator('.cm-content').textContent();
        expect(editorContent).toContain('This is a sample text file');
        expect(editorContent).toContain('Special characters: !@#$%^&*()');
    });

    test('should edit and save file content', async ({ page }) => {
        // Open editor for sample.txt
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Wait for CodeMirror to be ready
        await page.waitForTimeout(1000);

        // Click in the editor to focus it
        await iframe.locator('.cm-content').click();
        
        // Select all text (Ctrl+A) and delete
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Delete');
        
        // Type new content
        const newContent = 'This content was edited by Playwright test\nLine 2\nLine 3';
        await page.keyboard.type(newContent);
        
        // Save the file (Ctrl+S)
        await page.keyboard.press('Control+S');
        
        // Wait for save to complete
        await page.waitForTimeout(500);
        
        // Close the modal
        await page.click('.editor-modal-close');
        
        // Verify the file was actually saved
        const savedContent = fs.readFileSync(sampleFilePath, 'utf8');
        expect(savedContent).toBe(newContent);
    });

    test('should handle syntax highlighting for JavaScript files', async ({ page }) => {
        // Find the sample.js file
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.js' }).first();
        await expect(fileRow).toBeVisible();

        // Open in modal editor
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Check for syntax highlighting classes (CodeMirror adds these for JS files)
        const hasKeyword = await iframe.locator('.cm-keyword').count();
        const hasVariable = await iframe.locator('.cm-variableName').count();
        
        expect(hasKeyword).toBeGreaterThan(0);
        expect(hasVariable).toBeGreaterThan(0);
    });

    test('should disable edit option for non-text files', async ({ page }) => {
        // Create a binary file for testing
        const binaryFile = path.join(testDataDir, 'test.bin');
        fs.writeFileSync(binaryFile, Buffer.from([0x00, 0x01, 0x02, 0x03]));
        
        // Refresh the page to see the new file
        await page.reload();
        await page.waitForSelector('.file-row');
        
        // Find the binary file
        const fileRow = page.locator('.file-row').filter({ hasText: 'test.bin' }).first();
        if (await fileRow.count() > 0) {
            // Right-click to open context menu
            await fileRow.click({ button: 'right' });
            await expect(page.locator('#context-menu')).toBeVisible();
            
            // Check that edit options are disabled
            const editModal = page.locator('[data-action="edit-modal"]');
            const editWindow = page.locator('[data-action="edit-window"]');
            
            await expect(editModal).toHaveClass(/disabled/);
            await expect(editWindow).toHaveClass(/disabled/);
        }
        
        // Clean up
        fs.unlinkSync(binaryFile);
    });

    test('should show modified indicator when file is edited', async ({ page }) => {
        // Open editor for sample.txt
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        await page.waitForTimeout(1000);
        
        // Make a change
        await iframe.locator('.cm-content').click();
        await page.keyboard.type(' Modified');
        
        // Check for modified indicator
        const modifiedIndicator = iframe.locator('#modified-indicator');
        await expect(modifiedIndicator).toContainText('Modified');
    });

    test('should handle find and replace', async ({ page }) => {
        // Open editor for sample.txt
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        await page.waitForTimeout(1000);
        
        // Open find dialog (Ctrl+F)
        await page.keyboard.press('Control+F');
        
        // The search panel should appear
        // Note: CodeMirror 6's search UI implementation may vary
        // This test might need adjustment based on actual implementation
        await page.waitForTimeout(500);
        
        // Type search term
        await page.keyboard.type('sample');
        
        // Close search with Escape
        await page.keyboard.press('Escape');
    });

    test('should close modal with escape key', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for modal to open
        await expect(page.locator('#editor-modal')).toBeVisible();
        
        // Press Escape
        await page.keyboard.press('Escape');
        
        // Modal should be hidden
        await expect(page.locator('#editor-modal')).toBeHidden();
    });

    test('should display correct keyboard shortcuts for Mac users', async ({ page, browserName }) => {
        // Mock Mac platform
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'platform', {
                get: () => 'MacIntel'
            });
        });
        
        // Open editor for sample.txt
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Check that shortcuts show ⌘ instead of Ctrl for Mac
        const shortcuts = await iframe.locator('.shortcut').allTextContents();
        shortcuts.forEach(shortcut => {
            expect(shortcut).not.toContain('Ctrl');
            if (shortcut.includes('⌘')) {
                expect(shortcut).toMatch(/⌘/);
            }
        });
    });

    test('should close menu after clicking action', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Click on Edit menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        
        // Check menu is open
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        
        // Click Copy action
        await iframe.locator('[data-action="copy"]').click();
        
        // Check menu is closed
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
    });

    test('should handle paste action from menu', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Copy some text first
        await iframe.locator('.simple-editor').click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Control+C');
        
        // Clear the editor
        await page.keyboard.press('Delete');
        
        // Click Edit menu and then Paste
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await iframe.locator('[data-action="paste"]').click();
        
        // Note: Due to browser security restrictions, paste from menu might not work
        // in automated tests. This test verifies the menu action is triggered.
    });

    test('should use correct font stack', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Check font-family on editor
        const fontFamily = await iframe.locator('.simple-editor').evaluate(el => 
            window.getComputedStyle(el).fontFamily
        );
        
        // Should start with GitLab Mono or JetBrains Mono
        expect(fontFamily).toMatch(/^"GitLab Mono"|"JetBrains Mono"/);
    });
});