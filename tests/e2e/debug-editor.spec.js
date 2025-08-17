const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe.serial('Debug Editor Loading', () => {
    const testDataDir = path.join(__dirname, 'test_data');
    const testFilePath = path.join(testDataDir, 'test-editor.txt');
    const testContent = 'Test content for debug editor';
    
    test.beforeAll(async () => {
        // Ensure test directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        // Create test file
        fs.writeFileSync(testFilePath, testContent);
    });
    
    test.afterAll(async () => {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });
    test('capture console errors from editor', async ({ page }) => {
        // Collect console messages
        const consoleMessages = [];
        const consoleErrors = [];
        
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
            consoleMessages.push(`${msg.type()}: ${msg.text()}`);
        });
        
        page.on('pageerror', error => {
            consoleErrors.push(`Page error: ${error.message}`);
        });
        
        // Navigate to main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row');
        
        // Open test file in editor
        const fileRow = page.locator('.file-row').filter({ hasText: 'test-editor.txt' }).first();
        await fileRow.click({ button: 'right' });
        await page.click('[data-action="edit-modal"]');
        
        // Wait for modal
        await expect(page.locator('#editor-modal')).toBeVisible();
        
        // Wait for iframe
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Try to capture iframe console
        const frame = page.frame({ url: /editor\.html/ });
        if (frame) {
            frame.on('console', msg => {
                consoleMessages.push(`IFRAME ${msg.type()}: ${msg.text()}`);
                if (msg.type() === 'error') {
                    consoleErrors.push(`IFRAME: ${msg.text()}`);
                }
            });
        }
        
        // Wait a bit for everything to load/fail
        await page.waitForTimeout(3000);
        
        // Print all console messages
        console.log('\n=== Console Messages ===');
        consoleMessages.forEach(msg => console.log(msg));
        
        console.log('\n=== Console Errors ===');
        consoleErrors.forEach(err => console.log(err));
        
        // Check if editor container exists in iframe
        const editorExists = await iframe.locator('#editor-container').count();
        console.log(`\nEditor container exists: ${editorExists > 0}`);
        
        // Try to get any content from the editor container
        if (editorExists > 0) {
            const editorHTML = await iframe.locator('#editor-container').innerHTML();
            console.log(`Editor container HTML length: ${editorHTML.length}`);
            if (editorHTML.length < 100) {
                console.log(`Editor container HTML: ${editorHTML}`);
            }
        }
        
        // Check if Monaco editor loaded successfully
        const iframeElement = await page.$('#editor-modal-iframe');
        const hasMonaco = await page.evaluate((iframe) => {
            const iframeWindow = iframe.contentWindow;
            return iframeWindow && typeof iframeWindow.monaco !== 'undefined' && 
                   iframeWindow.editorApp && iframeWindow.editorApp.editor !== null;
        }, iframeElement);
        
        console.log(`\nMonaco Editor loaded: ${hasMonaco}`);
        
        // Get editor content if Monaco loaded
        if (hasMonaco) {
            const content = await page.evaluate((iframe) => {
                const iframeWindow = iframe.contentWindow;
                if (iframeWindow && iframeWindow.editorApp && iframeWindow.editorApp.editor) {
                    return iframeWindow.editorApp.editor.getValue();
                }
                return '';
            }, iframeElement);
            console.log(`Editor content: "${content}"`);
            console.log(`Content matches expected: ${content === testContent}`);
        }
        
        // Filter out expected/known errors
        const criticalErrors = consoleErrors.filter(err => 
            !err.includes('favicon.ico') && // Ignore missing favicon
            !err.includes('Failed to load resource') && // Generic resource errors
            !err.includes('404') // 404 errors for optional resources
        );
        
        // Only fail if there are critical errors
        expect(criticalErrors.length).toBe(0);
    });
});