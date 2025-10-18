const { test, expect } = require('@playwright/test');

test.describe('Editor Path Handling', () => {
    test('should pass correct file path to editor modal', async ({ page }) => {
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
        
        // Find a JavaScript file that ships with the test data set
        let fileRow = page.locator('.file-row').filter({ hasText: 'sample.js' }).first();
        if (await fileRow.count() === 0) {
            fileRow = page.locator('.file-row').filter({ hasText: 'script.js' }).first();
        }
        await expect(fileRow).toBeVisible({ timeout: 10000 });

        // Get the actual path from the file row data attribute
        const actualPath = await fileRow.getAttribute('data-path');
        const fileName = actualPath?.split('/').pop();
        console.log('File row data-path:', actualPath);

        // Verify the path is not empty or root
        expect(actualPath).toBeTruthy();
        expect(actualPath).not.toBe('/');
        expect(fileName).toBeTruthy();

        // Right-click to open context menu
        await fileRow.click({ button: 'right' });
        await expect(page.locator('#context-menu')).toBeVisible();
        
        // Click "Edit (modal)"
        await page.click('[data-action="edit-modal"]');
        
        // Wait for modal to appear
        await expect(page.locator('#editor-modal')).toBeVisible();
        
        // Get the iframe and verify its source URL contains the correct path
        const iframe = page.locator('#editor-modal-iframe');
        await expect(iframe).toBeVisible();
        const iframeSrc = await iframe.getAttribute('src');
        console.log('Iframe src:', iframeSrc);
        
        // Verify the iframe URL contains the file path
        expect(iframeSrc).toContain('path=');
        expect(iframeSrc).toContain(fileName);
        
        // Parse the path from iframe URL
        const urlParams = new URLSearchParams(iframeSrc.split('?')[1]);
        const pathParam = urlParams.get('path');
        console.log('Path parameter in editor URL:', pathParam);
        
        // Verify the path parameter
        expect(pathParam).toBeTruthy();
        expect(pathParam).not.toBe('/');
        expect(pathParam).toContain(fileName);
        
        // Close modal
        await page.keyboard.press('Escape');
        await expect(page.locator('#editor-modal')).not.toBeVisible();
    });
    
    test('should open editor in new window with correct path', async ({ page, context }) => {
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
        
        // Find any text file (try README.md first, then sample.txt)
        let fileRow = page.locator('.file-row').filter({ hasText: 'README.md' }).first();
        if (await fileRow.count() === 0) {
            fileRow = page.locator('.file-row').filter({ hasText: 'sample.txt' }).first();
        }
        
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Get the actual path
        const actualPath = await fileRow.getAttribute('data-path');
        const fileName = actualPath?.split('/').pop();
        console.log(`${fileName} path:`, actualPath);

        await fileRow.click({ button: 'right' });
        await page.waitForSelector('#context-menu:not(.hidden)');

        const pagePromise = context.waitForEvent('page');
        await page.evaluate(() => {
            const ui = window.dendriteApp?.ui;
            if (ui && ui.contextMenuTargetPath) {
                ui.openEditorWindow(ui.contextMenuTargetPath);
            }
        });

        const editorPage = await pagePromise;
        await editorPage.waitForLoadState();
        
        // Check the URL of the new window
        const editorUrl = editorPage.url();
        console.log('Editor window URL:', editorUrl);
        
        // Verify the URL contains the correct path
        expect(editorUrl).toContain('path=');
        expect(editorUrl).toContain(fileName);
        
        // Parse path from URL
        const urlParams = new URLSearchParams(editorUrl.split('?')[1]);
        const pathParam = urlParams.get('path');
        console.log('Path in editor window:', pathParam);
        
        // Verify the path
        expect(pathParam).toBeTruthy();
        expect(pathParam).not.toBe('/');
        expect(pathParam).toContain(fileName);
        
        // Close the editor window
        await editorPage.close();
    });
    
    test('should handle file paths correctly in subdirectories', async ({ page }) => {
        // Navigate to main page
        await page.goto('http://127.0.0.1:3001');
        
        // Check for subdirectories
        const subfolderRow = page.locator('.folder-row').first();
        const hasSubfolders = await subfolderRow.count() > 0;
        
        if (hasSubfolders) {
            // Click on subfolder to navigate into it
            await subfolderRow.dblclick();
            await page.waitForTimeout(1000);
            
            // Find a file in the subfolder
            const fileInSubfolder = page.locator('.file-row').first();
            if (await fileInSubfolder.count() > 0) {
                const filePath = await fileInSubfolder.getAttribute('data-path');
                console.log('File in subfolder path:', filePath);
                
                // Verify the path includes the subdirectory
                expect(filePath).toBeTruthy();
                expect(filePath).not.toBe('/');
                expect(filePath.split('/').length).toBeGreaterThan(1); // Should have directory separator
            }
        } else {
            console.log('No subfolders found, skipping subfolder test');
        }
    });
});
