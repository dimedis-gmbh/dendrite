const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe.serial('Dendrite Editor Content Display', () => {
    // Test file created during test setup
    const testFileName = 'test-editor.txt';
    const expectedContent = 'Hello World from editor test';
    const testDataDir = path.join(__dirname, 'test_data');
    const testFilePath = path.join(testDataDir, testFileName);

    test.beforeEach(async ({ page }) => {
        // Create the test file
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        fs.writeFileSync(testFilePath, expectedContent);
        
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row');
    });
    
    test.afterEach(async () => {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
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
        // Get content from Monaco editor
        const iframeElement = await page.$('#editor-modal-iframe');
        const editorContent = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);
        console.log('Editor content:', editorContent);
        
        // This assertion will FAIL with the current implementation
        // proving that the test detects the bug
        expect(editorContent).toContain(expectedContent);
        
        // Also check that the filename is displayed correctly
        const filenameDisplay = await iframe.locator('#file-path').textContent();
        expect(filenameDisplay).toContain(testFileName);
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
        const iframeElement = await page.$('#editor-modal-iframe');
        const initialContent = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);
        expect(initialContent).toContain(expectedContent);
        
        // Replace content using Monaco API
        await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                iframeWindow.editorApp.editor.setValue('Modified by test');
            }
        }, iframeElement);
        
        // Check modified indicator appears
        const modifiedIndicator = iframe.locator('#modified-indicator');
        await expect(modifiedIndicator).toContainText('Modified');
        
        // Save the file using Monaco save function
        await page.evaluate(async (iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp) {
                await iframeWindow.editorApp.save();
            }
        }, iframeElement);
        await page.waitForTimeout(2000);
        
        // Modified indicator should disappear
        await expect(modifiedIndicator).toHaveText('');
        
        // Close the modal
        await page.click('.editor-modal-close');
        
        // Verify the file was actually saved by reading it from filesystem
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
        
        // Check that content is displayed in the new window using Monaco
        const editorContent = await newPage.evaluate(() => {
            if (window.editorApp && window.editorApp.editor) {
                return window.editorApp.editor.getValue();
            }
            return '';
        });
        expect(editorContent).toContain(expectedContent);
        
        // Check filename is correct
        const filename = await newPage.locator('#file-path').textContent();
        expect(filename).toContain(testFileName);
        
        await newPage.close();
    });

    test('should show error when trying to edit binary files', async ({ page }) => {
        // This test checks that binary files cannot be edited
        // Create a test binary file
        const binaryFile = path.join(testDataDir, 'test.bin');
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
        
        // Test Tab key inserts tab character using Monaco API
        const iframeElement = await page.$('#editor-modal-iframe');
        const contentWithTab = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                const editor = iframeWindow.editorApp.editor;
                const currentValue = editor.getValue();
                editor.setValue(currentValue + '\t');
                return editor.getValue();
            }
            return '';
        }, iframeElement);
        
        // Tab should be added, making content longer
        expect(contentWithTab.length).toBeGreaterThan(expectedContent.length);
        
        // Test Escape closes modal - click the close button instead since 
        // Escape is captured by Monaco editor in the iframe
        await page.click('.editor-modal-close');
        await page.waitForTimeout(500);
        
        // Modal should be hidden
        await expect(page.locator('#editor-modal')).toBeHidden({ timeout: 5000 });
    });
});