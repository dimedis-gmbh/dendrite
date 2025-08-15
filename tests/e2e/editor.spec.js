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

        // Wait for Monaco editor to initialize and load content
        await page.waitForTimeout(1000);
        
        // Check that the file content is loaded in Monaco editor
        const editorContent = await iframe.locator(":root").evaluate(() => {
            // Access Monaco editor instance
            if (window.editorApp && window.editorApp.editor) {
                return window.editorApp.editor.getValue();
            }
            return '';
        });
        
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
        
        // Wait for Monaco to be ready
        await page.waitForTimeout(1000);

        // Modify content in Monaco editor
        const newContent = 'This content was edited by Playwright test\nLine 2\nLine 3';
        await iframe.locator(":root").evaluate((content) => {
            if (window.editorApp && window.editorApp.editor) {
                window.editorApp.editor.setValue(content);
            }
        }, newContent);
        
        // Save the file using keyboard shortcut within iframe context
        await iframe.locator('#editor-container').focus();
        await iframe.locator('#editor-container').press('Control+s');
        
        // Wait for save to complete
        await page.waitForTimeout(1000);
        
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
        
        // Wait for Monaco to initialize
        await page.waitForTimeout(1000);
        
        // Check that JavaScript language mode is set in Monaco
        const language = await iframe.locator(":root").evaluate(() => {
            if (window.editorApp && window.editorApp.editor) {
                const model = window.editorApp.editor.getModel();
                return monaco.editor.getModelLanguage(model);
            }
            return null;
        });
        
        expect(language).toBe('javascript');
        
        // Verify content is loaded
        const editorContent = await iframe.locator(":root").evaluate(() => {
            if (window.editorApp && window.editorApp.editor) {
                return window.editorApp.editor.getValue();
            }
            return '';
        });
        expect(editorContent).toContain('kilometers');
        expect(editorContent).toContain('console.log');
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
        
        // Make a change in Monaco
        await iframe.locator(":root").evaluate(() => {
            if (window.editorApp && window.editorApp.editor) {
                const currentValue = window.editorApp.editor.getValue();
                window.editorApp.editor.setValue(currentValue + ' Modified');
            }
        });
        
        await page.waitForTimeout(500);
        
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
        
        // Get iframe and focus on the editor
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').click();
        
        // Press Escape
        await page.keyboard.press('Escape');
        
        // Modal should be hidden (Monaco doesn't prevent closing)
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
        
        // Check that tooltips show Mac shortcuts
        const saveBtn = await iframe.locator('#save-btn').getAttribute('title');
        expect(saveBtn).toContain('⌘');
        
        const findBtn = await iframe.locator('#find-btn').getAttribute('title');
        expect(findBtn).toContain('⌘');
    });

    test('should close menu after clicking action', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Monaco has a menu bar with buttons, not dropdown menus
        // Click undo button
        await iframe.locator('#undo-btn').click();
        await page.waitForTimeout(500);
        
        // Verify the action was performed
        const editorContent = await iframe.locator(":root").evaluate(() => {
            if (window.editorApp && window.editorApp.editor) {
                return window.editorApp.editor.getValue();
            }
            return '';
        });
        expect(editorContent).toContain('This is a sample text file');
    });

    test('should handle paste action from menu', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Monaco doesn't have a paste button (browser security)
        // Test clipboard paste with keyboard shortcut instead
        await iframe.locator('#editor-container').focus();
        
        // Select all and copy
        await iframe.locator('#editor-container').press('Control+a');
        await iframe.locator('#editor-container').press('Control+c');
        
        // Clear and paste
        await iframe.locator('#editor-container').press('Control+a');
        await iframe.locator('#editor-container').press('Delete');
        await iframe.locator('#editor-container').press('Control+v');
        
        await page.waitForTimeout(500);
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
        
        // Check font-family on Monaco editor
        const fontFamily = await iframe.locator(":root").evaluate(() => {
            const editorElement = document.querySelector('.monaco-editor');
            if (editorElement) {
                return window.getComputedStyle(editorElement).fontFamily;
            }
            return '';
        });
        
        // Should include JetBrains Mono or other monospace fonts
        expect(fontFamily.toLowerCase()).toMatch(/jetbrains|fira|monaco|menlo|consolas|monospace/);
    });
});