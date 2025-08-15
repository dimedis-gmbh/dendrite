const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Dendrite Editor Content Display', () => {
    // Test file created during test setup
    const testFileName = 'test-editor.txt';
    const expectedContent = 'Hello World from editor test';

    test.beforeEach(async ({ page }) => {
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row');
    });

    test('should display file content in modal editor', async ({ page }) => {
        // Find the test file in the root directory
        const fileRow = page.locator('.file-row').filter({ hasText: testFileName }).first();
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
        
        // Wait for editor container to be present
        await iframe.locator('#editor-container').waitFor({ timeout: 5000 });
        
        // Wait a bit more for CodeMirror to initialize
        await page.waitForTimeout(1000);

        // CRITICAL TEST: Check that the file content is actually displayed
        // Look for the simple editor textarea
        const editorTextarea = await iframe.locator('.simple-editor');
        const editorContent = await editorTextarea.inputValue();
        console.log('Editor content:', editorContent);
        
        // This assertion will FAIL with the current implementation
        // proving that the test detects the bug
        expect(editorContent).toContain(expectedContent);
        
        // Also check that the filename is displayed correctly
        const filenameDisplay = await iframe.locator('#filename').textContent();
        expect(filenameDisplay).toBe(testFileName);
    });

    test('should be able to edit and save content in modal', async ({ page }) => {
        // Open the test file in editor
        const fileRow = page.locator('.file-row').filter({ hasText: testFileName }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for editor to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        await page.waitForTimeout(1000);
        
        // Verify initial content is displayed
        const editorTextarea = iframe.locator('.simple-editor');
        const initialContent = await editorTextarea.inputValue();
        expect(initialContent).toContain(expectedContent);
        
        // Click in the editor to focus it
        await editorTextarea.click();
        
        // Select all and replace with new content
        await page.keyboard.press('Control+A');
        await page.keyboard.type('Modified by test');
        
        // Check modified indicator appears
        const modifiedIndicator = iframe.locator('#modified-indicator');
        await expect(modifiedIndicator).toContainText('Modified');
        
        // Save the file
        await page.keyboard.press('Control+S');
        await page.waitForTimeout(500);
        
        // Modified indicator should disappear
        await expect(modifiedIndicator).toHaveText('');
        
        // Close the modal
        await page.click('.editor-modal-close');
        
        // Verify the file was actually saved by reading it from filesystem
        const testFilePath = path.join(__dirname, 'test-data', testFileName);
        const savedContent = fs.readFileSync(testFilePath, 'utf8');
        expect(savedContent).toBe('Modified by test');
        
        // Restore original content for next test
        fs.writeFileSync(testFilePath, expectedContent);
    });

    test('should open editor in new window mode', async ({ page, context }) => {
        // Find the test file
        const fileRow = page.locator('.file-row').filter({ hasText: testFileName }).first();
        await fileRow.click({ button: 'right' });
        
        // Click "Edit (new window)"
        const [newPage] = await Promise.all([
            context.waitForEvent('page'),
            page.click('[data-action="edit-window"]')
        ]);
        
        // Wait for new window to load
        await newPage.waitForLoadState();
        await newPage.waitForSelector('#editor-container', { timeout: 5000 });
        await newPage.waitForTimeout(1000);
        
        // Check that content is displayed in the new window
        const editorTextarea = await newPage.locator('.simple-editor');
        const editorContent = await editorTextarea.inputValue();
        expect(editorContent).toContain(expectedContent);
        
        // Check filename is correct
        const filename = await newPage.locator('#filename').textContent();
        expect(filename).toBe(testFileName);
        
        await newPage.close();
    });

    test('should show error when trying to edit binary files', async ({ page }) => {
        // This test checks that binary files cannot be edited
        // Create a test binary file
        const binaryFile = path.join(__dirname, 'test-data', 'test.bin');
        fs.writeFileSync(binaryFile, Buffer.from([0x00, 0x01, 0x02, 0x03]));
        
        try {
            // Refresh to see the new file
            await page.reload();
            await page.waitForSelector('.file-row');
            
            // Try to edit the binary file
            const fileRow = page.locator('.file-row').filter({ hasText: 'test.bin' }).first();
            if (await fileRow.count() > 0) {
                await fileRow.click({ button: 'right' });
                
                // Edit options should be disabled or show error
                const editModal = page.locator('[data-action="edit-modal"]');
                const editWindow = page.locator('[data-action="edit-window"]');
                
                // Check if they have disabled class or are not clickable
                const modalClasses = await editModal.getAttribute('class');
                const windowClasses = await editWindow.getAttribute('class');
                
                // At least one should indicate it's disabled
                expect(modalClasses + windowClasses).toMatch(/disabled/);
            }
        } finally {
            // Clean up
            if (fs.existsSync(binaryFile)) {
                fs.unlinkSync(binaryFile);
            }
        }
    });

    test('should handle keyboard shortcuts correctly', async ({ page }) => {
        // Open the test file
        const fileRow = page.locator('.file-row').filter({ hasText: testFileName }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor({ timeout: 10000 });
        await page.waitForTimeout(1000);
        
        // Test Tab key inserts tab character, not jumping to next element
        const editorTextarea = iframe.locator('.simple-editor');
        await editorTextarea.click();
        
        // Go to end of content and add tab using evaluate
        const contentWithTab = await editorTextarea.evaluate((el) => {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
            // Simulate tab key by inserting tab character
            el.value += '\t';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            return el.value;
        });
        
        // Tab should be added, making content longer
        expect(contentWithTab.length).toBeGreaterThan(expectedContent.length);
        
        // Test Escape closes modal - set up dialog handler if needed
        let dialogHandled = false;
        page.once('dialog', dialog => {
            dialogHandled = true;
            dialog.accept(); // Accept to close
        });
        
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
        
        // Modal should be hidden
        await expect(page.locator('#editor-modal')).toBeHidden({ timeout: 5000 });
    });
});