const { test, expect } = require('@playwright/test');

test.describe('Debug Editor Loading', () => {
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
        
        // This test will fail but we want to see the console output
        expect(consoleErrors.length).toBe(0);
    });
});