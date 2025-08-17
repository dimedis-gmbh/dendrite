const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Log Viewer Basic Tests', () => {
    const testDataDir = path.join(__dirname, 'test_data');
    const testLogFile = 'app.log';
    const testLogPath = path.join(testDataDir, testLogFile);
    
    test.beforeAll(async () => {
        // Create a simple log file
        const logContent = `2024-01-15 10:00:00 INFO Application started
2024-01-15 10:00:01 ERROR Connection failed
2024-01-15 10:00:02 WARNING Memory usage high
2024-01-15 10:00:03 DEBUG Processing request
2024-01-15 10:00:04 INFO Request completed`;
        
        fs.writeFileSync(testLogPath, logContent);
    });
    
    test.afterAll(async () => {
        // Clean up
        if (fs.existsSync(testLogPath)) {
            fs.unlinkSync(testLogPath);
        }
    });
    
    test('should show View Log option for .log files', async ({ page }) => {
        // Navigate to main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
        
        // Find the log file
        const fileRow = page.locator('.file-row').filter({ hasText: testLogFile });
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Right-click to open context menu
        await fileRow.click({ button: 'right' });
        
        // Context menu should be visible
        const contextMenu = page.locator('#context-menu');
        await expect(contextMenu).toBeVisible();
        
        // Check for log viewer options
        const viewLogModal = page.locator('[data-action="view-log-modal"]');
        const viewLogWindow = page.locator('[data-action="view-log-window"]');
        
        // At least one should be visible for .log files
        const modalVisible = await viewLogModal.isVisible().catch(() => false);
        const windowVisible = await viewLogWindow.isVisible().catch(() => false);
        
        expect(modalVisible || windowVisible).toBe(true);
    });
    
    test('should open log viewer window when clicked', async ({ page, context }) => {
        // Navigate to main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
        
        // Find the log file
        const fileRow = page.locator('.file-row').filter({ hasText: testLogFile });
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Right-click
        await fileRow.click({ button: 'right' });
        
        // Set up promise for new page before clicking
        const newPagePromise = context.waitForEvent('page');
        
        // Click view log window option
        const viewLogWindow = page.locator('[data-action="view-log-window"]');
        if (await viewLogWindow.isVisible()) {
            await viewLogWindow.click();
            
            // Wait for new window
            const logViewerPage = await newPagePromise;
            await logViewerPage.waitForLoadState();
            
            // Check URL contains log-viewer
            expect(logViewerPage.url()).toContain('log-viewer.html');
            
            // Check title
            const title = await logViewerPage.title();
            expect(title).toContain('Log');
            
            await logViewerPage.close();
        } else {
            console.log('View Log (window) option not available');
        }
    });
    
    test('should open log viewer modal when clicked', async ({ page }) => {
        // Navigate to main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
        
        // Find the log file
        const fileRow = page.locator('.file-row').filter({ hasText: testLogFile });
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Right-click
        await fileRow.click({ button: 'right' });
        
        // Click view log modal option if available
        const viewLogModal = page.locator('[data-action="view-log-modal"]');
        if (await viewLogModal.isVisible()) {
            await viewLogModal.click();
            
            // Wait for modal to appear (it reuses the editor-modal)
            const modal = page.locator('#editor-modal');
            await expect(modal).toBeVisible({ timeout: 5000 });
            
            // Check modal header shows the log filename
            const modalFilename = modal.locator('#editor-modal-filename');
            await expect(modalFilename).toContainText(testLogFile);
            
            // Check modal contains iframe
            const iframe = modal.locator('#editor-modal-iframe');
            await expect(iframe).toBeVisible();
            
            // Check iframe source contains log-viewer.html
            const iframeSrc = await iframe.getAttribute('src');
            expect(iframeSrc).toContain('log-viewer.html');
            expect(iframeSrc).toContain('mode=modal');
            
            // Close modal if there's a close button
            const closeButton = modal.locator('.close');
            if (await closeButton.isVisible()) {
                await closeButton.click();
                await expect(modal).toBeHidden();
            }
        } else {
            console.log('View Log (modal) option not available');
        }
    });
    
    test('should pass file path to log viewer', async ({ page, context }) => {
        // Navigate to main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
        
        // Find the log file
        const fileRow = page.locator('.file-row').filter({ hasText: testLogFile });
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Get the file path from data attribute
        const filePath = await fileRow.getAttribute('data-path');
        console.log('File path:', filePath);
        
        // Right-click and open log viewer
        await fileRow.click({ button: 'right' });
        
        const newPagePromise = context.waitForEvent('page');
        const viewLogWindow = page.locator('[data-action="view-log-window"]');
        
        if (await viewLogWindow.isVisible()) {
            await viewLogWindow.click();
            
            const logViewerPage = await newPagePromise;
            await logViewerPage.waitForLoadState();
            
            // Check URL contains the file path as parameter
            const url = logViewerPage.url();
            console.log('Log viewer URL:', url);
            
            const urlParams = new URLSearchParams(url.split('?')[1]);
            const pathParam = urlParams.get('path');
            
            // Path parameter should match the file
            expect(pathParam).toBeTruthy();
            expect(pathParam).toContain('app.log');
            
            await logViewerPage.close();
        }
    });
});