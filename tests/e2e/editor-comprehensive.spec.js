const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Dendrite Editor - Comprehensive Tests', () => {
    const testDataDir = path.join(__dirname, 'test-data');
    const testFilePath = path.join(testDataDir, 'editor-test.txt');
    const originalContent = 'Line 1: Original content\nLine 2: This is test data\nLine 3: For the editor\nLine 4: Testing copy paste\nLine 5: Last line';

    test.beforeAll(async () => {
        // Ensure test directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
    });

    test.beforeEach(async ({ page }) => {
        // Create/reset test file with known content
        fs.writeFileSync(testFilePath, originalContent);
        
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
    });

    test.afterEach(async () => {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.writeFileSync(testFilePath, originalContent);
        }
    });

    test('should load and display file content correctly', async ({ page }) => {
        // Find and open the test file
        const fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Right-click to open context menu
        await fileRow.click({ button: 'right' });
        await expect(page.locator('#context-menu')).toBeVisible();
        
        // Click "Edit (modal)"
        await page.click('[data-action="edit-modal"]');
        
        // Wait for modal and iframe to load
        await expect(page.locator('#editor-modal')).toBeVisible();
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // CRITICAL: Verify file content is loaded and displayed
        const editor = iframe.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Wait a bit for async content loading
        await page.waitForTimeout(1000);
        
        // Get the actual content from the textarea
        const loadedContent = await editor.inputValue();
        
        // Debug: Log what we actually got
        console.log('Expected content:', originalContent);
        console.log('Loaded content:', loadedContent);
        console.log('Content length - Expected:', originalContent.length, 'Actual:', loadedContent.length);
        
        // THIS IS THE CRITICAL TEST - File content MUST be loaded
        if (!loadedContent || loadedContent.length === 0) {
            throw new Error('CRITICAL: Editor is empty! File content was NOT loaded.');
        }
        
        // Verify content matches exactly
        expect(loadedContent).toBe(originalContent);
        
        // Also verify line count
        const lines = loadedContent.split('\n');
        expect(lines.length).toBe(5);
        expect(lines[0]).toBe('Line 1: Original content');
        expect(lines[4]).toBe('Line 5: Last line');
    });

    test('should insert text and save successfully', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        const editor = iframe.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Wait for content to load
        await page.waitForTimeout(1000);
        
        // First verify the original content is there
        const initialContent = await editor.inputValue();
        console.log('Initial content before edit:', initialContent);
        if (!initialContent || initialContent.length === 0) {
            throw new Error('CRITICAL: Cannot test saving - editor is empty to begin with!');
        }
        
        // Click to focus the editor
        await editor.click();
        
        // Clear all and type new content to make it obvious
        await page.keyboard.press('Control+A');
        await page.keyboard.type('COMPLETELY NEW CONTENT FROM TEST');
        
        // Get content before save
        const contentBeforeSave = await editor.inputValue();
        console.log('Content before save:', contentBeforeSave);
        
        // Save using Ctrl+S
        await page.keyboard.press('Control+S');
        await page.waitForTimeout(1000); // Wait for save
        
        // Close modal
        await page.click('.editor-modal-close');
        await expect(page.locator('#editor-modal')).toBeHidden();
        
        // Verify file was actually saved to disk
        const savedContent = fs.readFileSync(testFilePath, 'utf8');
        console.log('Content on disk after save:', savedContent);
        
        if (savedContent !== 'COMPLETELY NEW CONTENT FROM TEST') {
            throw new Error(`CRITICAL: Save failed! Expected: "COMPLETELY NEW CONTENT FROM TEST", Got: "${savedContent}"`);
        }
        
        expect(savedContent).toBe('COMPLETELY NEW CONTENT FROM TEST');
    });

    test('should retain content after closing and reopening', async ({ page }) => {
        // First, open and edit the file
        let fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        let iframe = page.frameLocator('#editor-modal-iframe');
        let editor = iframe.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Wait for initial content to load
        await page.waitForTimeout(1000);
        
        // Check initial content is loaded
        const initialContent = await editor.inputValue();
        console.log('Initial content:', initialContent);
        if (!initialContent) {
            throw new Error('CRITICAL: Editor is empty on first open!');
        }
        
        // Add some text
        await editor.click();
        await page.keyboard.press('Control+A'); // Select all
        await page.keyboard.type('Completely new content\nLine 2 new\nLine 3 new');
        
        // Save
        await page.keyboard.press('Control+S');
        await page.waitForTimeout(1000);
        
        // Verify save worked
        const savedToDisk = fs.readFileSync(testFilePath, 'utf8');
        if (savedToDisk !== 'Completely new content\nLine 2 new\nLine 3 new') {
            throw new Error(`CRITICAL: Content not saved! Disk has: "${savedToDisk}"`);
        }
        
        // Close modal
        await page.click('.editor-modal-close');
        await expect(page.locator('#editor-modal')).toBeHidden();
        
        // Reopen the file
        await page.waitForTimeout(500);
        fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Check content is retained
        iframe = page.frameLocator('#editor-modal-iframe');
        editor = iframe.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Wait for content to load
        await page.waitForTimeout(1000);
        
        const content = await editor.inputValue();
        console.log('Content after reopen:', content);
        
        if (!content) {
            throw new Error('CRITICAL: Editor is empty after reopening!');
        }
        
        expect(content).toBe('Completely new content\nLine 2 new\nLine 3 new');
    });

    test('should copy a line using menu and paste it', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Select the first line
        await editor.click();
        await page.keyboard.press('Home'); // Go to start of line
        await page.keyboard.down('Shift');
        await page.keyboard.press('End'); // Select to end of line
        await page.keyboard.up('Shift');
        
        // Copy using menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).toHaveClass(/active/);
        await iframe.locator('[data-action="copy"]').click();
        
        // Verify menu closed
        await expect(iframe.locator('.menu-item[data-menu="edit"]')).not.toHaveClass(/active/);
        
        // Move to end of document and paste
        await page.keyboard.press('Control+End'); // Go to end
        await page.keyboard.press('Enter'); // New line
        
        // Paste using menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await iframe.locator('[data-action="paste"]').click();
        
        // Verify content
        const content = await editor.inputValue();
        const lines = content.split('\n');
        expect(lines[lines.length - 1]).toBe('Line 1: Original content'); // Copied line should be at the end
    });

    test('should cut a line using menu and paste it', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Select the second line
        await editor.click();
        await page.keyboard.press('Down'); // Move to second line
        await page.keyboard.press('Home');
        await page.keyboard.down('Shift');
        await page.keyboard.press('End');
        await page.keyboard.up('Shift');
        
        // Cut using menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await iframe.locator('[data-action="cut"]').click();
        
        // Move to end and paste
        await page.keyboard.press('Control+End');
        await page.keyboard.press('Enter');
        
        // Paste using menu
        await iframe.locator('.menu-item[data-menu="edit"]').click();
        await iframe.locator('[data-action="paste"]').click();
        
        // Verify the line was moved
        const content = await editor.inputValue();
        const lines = content.split('\n');
        
        // Second line should be moved to the end
        expect(lines[1]).not.toBe('Line 2: This is test data');
        expect(lines[lines.length - 1]).toBe('Line 2: This is test data');
    });

    test('should show line numbers and they should sync with scrolling', async ({ page }) => {
        // Create a file with many lines
        const longContent = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: Content`).join('\n');
        fs.writeFileSync(testFilePath, longContent);
        
        // Refresh to see the updated file
        await page.reload();
        await page.waitForSelector('.file-row');
        
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        
        // Check line numbers are visible
        const lineNumbers = iframe.locator('.line-numbers');
        await expect(lineNumbers).toBeVisible();
        
        // Check first and last line numbers
        const firstLineNumber = iframe.locator('.line-number').first();
        await expect(firstLineNumber).toHaveText('1');
        
        // Count total line numbers
        const lineNumberCount = await iframe.locator('.line-number').count();
        expect(lineNumberCount).toBe(100);
        
        // Scroll down and verify line numbers scroll in sync
        const editor = iframe.locator('.simple-editor');
        await editor.evaluate(el => el.scrollTop = 500);
        
        // Check that line numbers also scrolled
        const lineNumbersScrollTop = await lineNumbers.evaluate(el => el.scrollTop);
        expect(lineNumbersScrollTop).toBe(500);
    });

    test('should save using menu action', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Make a change
        await editor.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' - SAVED VIA MENU');
        
        // Save using menu
        await iframe.locator('.menu-item[data-menu="file"]').click();
        await expect(iframe.locator('.menu-item[data-menu="file"]')).toHaveClass(/active/);
        await iframe.locator('[data-action="save"]').click();
        
        // Menu should close
        await expect(iframe.locator('.menu-item[data-menu="file"]')).not.toHaveClass(/active/);
        
        // Wait for save
        await page.waitForTimeout(500);
        
        // Verify file was saved
        const savedContent = fs.readFileSync(testFilePath, 'utf8');
        expect(savedContent).toContain('SAVED VIA MENU');
    });

    test('should display modified indicator correctly', async ({ page }) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'editor-test.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        const iframe = page.frameLocator('#editor-modal-iframe');
        const editor = iframe.locator('.simple-editor');
        await expect(editor).toBeVisible();
        
        // Initially should not show modified
        const modifiedIndicator = iframe.locator('#modified-indicator');
        await expect(modifiedIndicator).toHaveText('');
        
        // Make a change
        await editor.click();
        await page.keyboard.type('X');
        
        // Should show modified (with bullet point)
        await expect(modifiedIndicator).toHaveText('● Modified');
        
        // Save the file
        await page.keyboard.press('Control+S');
        await page.waitForTimeout(500);
        
        // Should no longer show modified
        await expect(modifiedIndicator).toHaveText('');
    });
});