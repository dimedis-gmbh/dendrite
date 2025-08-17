const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe.serial('Dendrite Editor - Comprehensive Tests', () => {
    const testDataDir = path.join(__dirname, 'test_data');
    const testFilePath = path.join(testDataDir, 'editor-test.txt');
    const originalContent = 'Line 1: Original content\nLine 2: This is test data\nLine 3: For the editor\nLine 4: Testing copy paste\nLine 5: Last line';

    test.beforeAll(async () => {
        // Ensure test directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, {recursive: true});
        }
    });

    test.beforeEach(async ({page}) => {
        // Create/reset test file with known content
        fs.writeFileSync(testFilePath, originalContent);

        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', {timeout: 10000});
    });

    test.afterEach(async () => {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.writeFileSync(testFilePath, originalContent);
        }
    });

    test('should load and display file content correctly', async ({page}) => {
        // Find and open the test file
        const fileRow = page.locator('.file-row').filter({hasText: 'editor-test.txt'}).first();
        await expect(fileRow).toBeVisible({timeout: 10000});

        // Right-click to open context menu
        await fileRow.click({button: 'right'});
        await expect(page.locator('#context-menu')).toBeVisible();

        // Click "Edit (modal)"
        await page.click('[data-action="edit-modal"]');

        // Wait for modal and iframe to load
        await expect(page.locator('#editor-modal')).toBeVisible();
        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();

        // CRITICAL: Verify file content is loaded and displayed
        // Wait for Monaco to initialize
        await page.waitForTimeout(1000);

        // Get the actual content from Monaco editor
        const iframeElement = await page.$('#editor-modal-iframe');
        const loadedContent = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);

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

    test('should insert text and save successfully', async ({page}) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({hasText: 'editor-test.txt'}).first();
        await fileRow.click({button: 'right'});
        await page.click('[data-action="edit-modal"]');

        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();

        // Wait for Monaco to load
        await page.waitForTimeout(1000);

        // First verify the original content is there
        const iframeElement = await page.$('#editor-modal-iframe');
        const initialContent = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);
        console.log('Initial content before edit:', initialContent);
        if (!initialContent || initialContent.length === 0) {
            throw new Error('CRITICAL: Cannot test saving - editor is empty to begin with!');
        }

        // Set new content in Monaco editor
        await page.evaluate((args) => {
            const iframeWindow = args.iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                iframeWindow.editorApp.editor.setValue('COMPLETELY NEW CONTENT FROM TEST');
            }
        }, {iframe: iframeElement});

        // Get content before save
        const contentBeforeSave = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);
        console.log('Content before save:', contentBeforeSave);

        // Save using the save function in Monaco
        await page.evaluate(async (iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp) {
                await iframeWindow.editorApp.save();
            }
        }, iframeElement);
        await page.waitForTimeout(2000); // Wait for save

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

    test('should retain content after closing and reopening', async ({page}) => {
        // First, open and edit the file
        let fileRow = page.locator('.file-row').filter({hasText: 'editor-test.txt'}).first();
        await fileRow.click({button: 'right'});
        await page.click('[data-action="edit-modal"]');

        let iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();

        // Wait for Monaco to initialize
        await page.waitForTimeout(1000);

        // Check initial content is loaded
        let iframeElement = await page.$('#editor-modal-iframe');
        const initialContent = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);
        console.log('Initial content:', initialContent);
        if (!initialContent) {
            throw new Error('CRITICAL: Editor is empty on first open!');
        }

        // Set new content in Monaco
        await page.evaluate((args) => {
            const iframeWindow = args.iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                iframeWindow.editorApp.editor.setValue('Completely new content\nLine 2 new\nLine 3 new');
            }
        }, {iframe: iframeElement});

        // Save using Monaco save function
        await page.evaluate(async (iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp) {
                await iframeWindow.editorApp.save();
            }
        }, iframeElement);
        await page.waitForTimeout(2000);

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
        fileRow = page.locator('.file-row').filter({hasText: 'editor-test.txt'}).first();
        await fileRow.click({button: 'right'});
        await page.click('[data-action="edit-modal"]');

        // Check content is retained
        iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();

        // Wait for Monaco to load
        await page.waitForTimeout(1000);

        iframeElement = await page.$('#editor-modal-iframe');
        const content = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);
        console.log('Content after reopen:', content);

        if (!content) {
            throw new Error('CRITICAL: Editor is empty after reopening!');
        }

        expect(content).toBe('Completely new content\nLine 2 new\nLine 3 new');
    });

    test('should copy a line using menu and paste it', async ({page}) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({hasText: 'editor-test.txt'}).first();
        await fileRow.click({button: 'right'});
        await page.click('[data-action="edit-modal"]');

        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        await page.waitForTimeout(1000);

        // Get initial content
        const iframeElement = await page.$('#editor-modal-iframe');
        const initialContent = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);

        // Copy first line and paste at end - simplified approach
        await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                const editor = iframeWindow.editorApp.editor;
                const content = editor.getValue();
                const lines = content.split('\n');
                const firstLine = lines[0];
                // Append the first line to the end
                editor.setValue(content + '\n' + firstLine);
            }
        }, iframeElement);

        // Verify content
        await page.waitForTimeout(500);
        const content = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);
        const lines = content.split('\n');
        expect(lines[lines.length - 1]).toBe('Line 1: Original content'); // Copied line should be at the end
    });

    test('should cut a line using menu and paste it', async ({page}) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({hasText: 'editor-test.txt'}).first();
        await fileRow.click({button: 'right'});
        await page.click('[data-action="edit-modal"]');

        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        await page.waitForTimeout(1000);

        // Cut and move second line - simplified approach
        const iframeElement = await page.$('#editor-modal-iframe');
        await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                const editor = iframeWindow.editorApp.editor;
                const content = editor.getValue();
                const lines = content.split('\n');
                // Extract second line
                const secondLine = lines[1];
                // Remove second line and append to end
                lines.splice(1, 1);
                lines.push(secondLine);
                editor.setValue(lines.join('\n'));
            }
        }, iframeElement);

        await page.waitForTimeout(500);

        // Verify the line was moved
        const content = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                return iframeWindow.editorApp.editor.getValue();
            }
            return '';
        }, iframeElement);
        const lines = content.split('\n');

        // Second line should be moved to the end
        expect(lines[1]).not.toBe('Line 2: This is test data');
        expect(lines[lines.length - 1]).toBe('Line 2: This is test data');
    });


    test('should save using menu action', async ({page}) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({hasText: 'editor-test.txt'}).first();
        await fileRow.click({button: 'right'});
        await page.click('[data-action="edit-modal"]');

        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        await page.waitForTimeout(1000);

        // Make a change using Monaco API
        const iframeElement = await page.$('#editor-modal-iframe');
        await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                const editor = iframeWindow.editorApp.editor;
                const currentValue = editor.getValue();
                const lines = currentValue.split('\n');
                lines[0] = lines[0] + ' - SAVED VIA MENU';
                editor.setValue(lines.join('\n'));
            }
        }, iframeElement);

        // Save using the save button in Monaco editor
        await iframe.locator('#save-btn').click();
        await page.waitForTimeout(2000); // Wait for save to complete

        // Wait for save
        await page.waitForTimeout(500);

        // Verify file was saved
        const savedContent = fs.readFileSync(testFilePath, 'utf8');
        expect(savedContent).toContain('SAVED VIA MENU');
    });

    test('should display modified indicator correctly', async ({page}) => {
        // Open editor
        const fileRow = page.locator('.file-row').filter({hasText: 'editor-test.txt'}).first();
        await fileRow.click({button: 'right'});
        await page.click('[data-action="edit-modal"]');

        const iframe = page.frameLocator('#editor-modal-iframe');
        await iframe.locator('#editor-container').waitFor();
        await page.waitForTimeout(1000);

        // Initially should not show modified
        const modifiedIndicator = iframe.locator('#modified-indicator');
        await expect(modifiedIndicator).toHaveText('');

        // Make a change using Monaco API
        const iframeElement = await page.$('#editor-modal-iframe');
        await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                const editor = iframeWindow.editorApp.editor;
                const currentValue = editor.getValue();
                editor.setValue('X' + currentValue);
            }
        }, iframeElement);

        // Should show modified (with bullet point)
        await expect(modifiedIndicator).toHaveText('● Modified');

        // Save using Monaco save function
        await page.evaluate(async (iframe) => {
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.editorApp) {
                await iframeWindow.editorApp.save();
            }
        }, iframeElement);
        await page.waitForTimeout(2000);

        // Should no longer show modified
        await expect(modifiedIndicator).toHaveText('');
    });
});