const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Editor Path Issue Detection', () => {
    test('should pass correct file path to editor', async ({ page }) => {
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
        
        // Find sample.js file
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.js' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Get the actual path from the file row data attribute
        const actualPath = await fileRow.getAttribute('data-path');
        console.log('File row data-path:', actualPath);
        
        // Listen for network requests to detect what path is being requested
        const apiRequests = [];
        page.on('request', request => {
            const url = request.url();
            if (url.includes('/api/files/') && url.includes('/raw')) {
                apiRequests.push(url);
                console.log('API request:', url);
            }
        });
        
        // Right-click to open context menu
        await fileRow.click({ button: 'right' });
        await expect(page.locator('#context-menu')).toBeVisible();
        
        // Click "Edit (modal)"
        await page.click('[data-action="edit-modal"]');
        
        // Wait for modal to appear
        await expect(page.locator('#editor-modal')).toBeVisible();
        
        // Get the iframe source URL
        const iframe = page.locator('#editor-modal-iframe');
        const iframeSrc = await iframe.getAttribute('src');
        console.log('Iframe src:', iframeSrc);
        
        // Parse the path from iframe URL
        const urlParams = new URLSearchParams(iframeSrc.split('?')[1]);
        const pathParam = urlParams.get('path');
        console.log('Path parameter in editor URL:', pathParam);
        
        // Wait a bit for API requests
        await page.waitForTimeout(2000);
        
        // Check what API requests were made
        console.log('All API requests:', apiRequests);
        
        // The path should not be just "/"
        if (pathParam === '/' || pathParam === '') {
            throw new Error(`CRITICAL: Editor received invalid path: "${pathParam}" - should be a valid file path like "sample.js"`);
        }
        
        // Check if the API request was made with correct path
        if (apiRequests.length > 0) {
            const lastRequest = apiRequests[apiRequests.length - 1];
            if (lastRequest.includes('/api/files//raw') || lastRequest.includes('/api/files/%2F/raw')) {
                throw new Error(`CRITICAL: API request made with root path "/" instead of actual file path`);
            }
        }
        
        // Check inside iframe for actual path being used
        const frameContext = page.frameLocator('#editor-modal-iframe');
        
        // Wait for editor to attempt loading
        await page.waitForTimeout(1000);
        
        // Check what path the editor actually received
        const editorPath = await frameContext.locator('body').evaluate(() => {
            // Access the editorApp if it exists
            if (window.editorApp && window.editorApp.filePath) {
                return window.editorApp.filePath;
            }
            // Try to get from URL params
            const params = new URLSearchParams(window.location.search);
            return params.get('path');
        });
        
        console.log('Path received by editor:', editorPath);
        
        if (editorPath === '/' || editorPath === '') {
            throw new Error(`CRITICAL: Editor received root path "/" instead of file path`);
        }
        
        // Check for 404 errors
        const responseStatuses = [];
        page.on('response', response => {
            if (response.status() === 404) {
                responseStatuses.push({
                    url: response.url(),
                    status: response.status()
                });
                console.error('404 Error:', response.url());
            }
        });
        
        // Final check: is content actually loaded?
        const editor = frameContext.locator('.simple-editor');
        try {
            await expect(editor).toBeVisible({ timeout: 5000 });
            const content = await editor.inputValue();
            
            if (!content || content.length === 0) {
                console.error('Editor is empty - likely due to incorrect path');
                throw new Error('Editor failed to load content - path issue suspected');
            }
        } catch (e) {
            console.error('Editor not found or content not loaded');
            throw e;
        }
    });
    
    test('should correctly handle paths when serving from subdirectory', async ({ page }) => {
        // This test is for when dendrite is run with --dir tests/e2e/test_data/:/
        
        // Navigate to main page
        await page.goto('http://127.0.0.1:3001');
        
        // Check how files are listed
        const fileRows = page.locator('.file-row');
        const count = await fileRows.count();
        console.log('Number of files:', count);
        
        // Get all file paths
        const filePaths = [];
        for (let i = 0; i < count; i++) {
            const row = fileRows.nth(i);
            const path = await row.getAttribute('data-path');
            const text = await row.textContent();
            filePaths.push({ path, text });
            console.log(`File ${i}: path="${path}", text="${text}"`);
        }
        
        // Check if paths are being set correctly
        const hasInvalidPaths = filePaths.some(f => f.path === '/' || f.path === '');
        if (hasInvalidPaths) {
            console.error('Found files with invalid paths:', filePaths.filter(f => f.path === '/' || f.path === ''));
            throw new Error('Files have invalid data-path attributes');
        }
    });
});