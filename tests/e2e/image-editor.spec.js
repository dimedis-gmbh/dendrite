const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Dendrite Image Editor', () => {
    const testDataDir = path.join(__dirname, 'test_data');
    const testImagePath = path.join(testDataDir, 'test-image.png');
    
    test.beforeAll(async () => {
        // Create a simple test image (1x1 PNG) if it doesn't exist
        if (!fs.existsSync(testImagePath)) {
            const pngData = Buffer.from([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  // PNG signature
                0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  // IHDR chunk
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  // 1x1 dimensions
                0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,  // 8-bit RGB
                0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  // IDAT chunk
                0x54, 0x08, 0x99, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
                0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
                0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  // IEND chunk
                0x44, 0xAE, 0x42, 0x60, 0x82
            ]);
            fs.writeFileSync(testImagePath, pngData);
        }
    });
    
    test.beforeEach(async ({page}) => {
        // Ensure test image exists before each test
        if (!fs.existsSync(testImagePath)) {
            const pngData = Buffer.from([
                0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,  // PNG signature
                0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,  // IHDR chunk
                0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,  // 1x1 dimensions
                0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,  // 8-bit RGB
                0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,  // IDAT chunk
                0x54, 0x08, 0x99, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
                0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
                0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,  // IEND chunk
                0x44, 0xAE, 0x42, 0x60, 0x82
            ]);
            fs.writeFileSync(testImagePath, pngData);
        }
        
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row');
    });
    
    test.afterAll(async () => {
        // Clean up test image
        if (fs.existsSync(testImagePath)) {
            fs.unlinkSync(testImagePath);
        }
    });
    
    test('should show image editor options in context menu for image files', async ({page}) => {
        // Find the test image file
        const fileRow = page.locator('.file-row').filter({hasText: 'test-image.png'}).first();
        await expect(fileRow).toBeVisible();
        
        // Right-click to open context menu
        await fileRow.click({button: 'right'});
        await expect(page.locator('#context-menu')).toBeVisible();
        
        // Check that image editor options are visible
        const editImageModal = page.locator('[data-action="edit-image-modal"]');
        const editImageWindow = page.locator('[data-action="edit-image-window"]');
        
        await expect(editImageModal).toBeVisible();
        await expect(editImageWindow).toBeVisible();
        
        // Check that text editor options are hidden
        const editModal = page.locator('[data-action="edit-modal"]');
        const editWindow = page.locator('[data-action="edit-window"]');
        
        await expect(editModal).toBeHidden();
        await expect(editWindow).toBeHidden();
    });
    
    test('should open image editor in modal', async ({page}) => {
        // Find the test image file
        const fileRow = page.locator('.file-row').filter({hasText: 'test-image.png'}).first();
        await fileRow.click({button: 'right'});
        
        // Click "Edit Image (modal)"
        await page.click('[data-action="edit-image-modal"]');
        
        // Wait for modal to open
        await expect(page.locator('#image-editor-modal')).toBeVisible();
        
        // Check that iframe is loaded
        const iframe = page.locator('#image-editor-modal-iframe');
        await expect(iframe).toBeVisible();
        
        // Verify the iframe source contains the correct path
        const iframeSrc = await iframe.getAttribute('src');
        expect(iframeSrc).toContain('image-editor.html');
        expect(iframeSrc).toContain('test-image.png');
        expect(iframeSrc).toContain('modal=true');
        
        // Close the modal
        await page.click('.image-editor-modal-close');
        await expect(page.locator('#image-editor-modal')).toBeHidden();
    });
    
    test('should open image editor in new window on double-click', async ({page, context}) => {
        // Wait a moment for file to be visible (Firefox may need more time)
        await page.waitForTimeout(500);
        
        // Refresh if needed to see the test image file
        let fileRow = page.locator('.file-row').filter({hasText: 'test-image.png'}).first();
        if (await fileRow.count() === 0) {
            await page.reload();
            await page.waitForSelector('.file-row');
            fileRow = page.locator('.file-row').filter({hasText: 'test-image.png'}).first();
        }
        
        await expect(fileRow).toBeVisible();
        
        // Listen for new page (window)
        const pagePromise = context.waitForEvent('page');
        
        // Double-click to open in new window
        await fileRow.dblclick();
        
        // Wait for new window
        const editorPage = await pagePromise;
        await editorPage.waitForLoadState();
        
        // Check the URL of the new window
        const editorUrl = editorPage.url();
        expect(editorUrl).toContain('image-editor.html');
        expect(editorUrl).toContain('test-image.png');
        expect(editorUrl).not.toContain('modal=true');
        
        // Wait for the title to be updated by JavaScript
        // The initial title is "Dendrite Image Editor" and JS updates it to include filename
        await editorPage.waitForFunction(
            () => document.title.includes('test-image.png'),
            { timeout: 5000 }
        );
        
        // Now check that the page title contains the filename
        const title = await editorPage.title();
        expect(title).toContain('test-image.png');
        expect(title).toContain('Dendrite Image Editor');
        
        // Close the editor window
        await editorPage.close();
    });
    
    test('should not show image editor options for non-image files', async ({page}) => {
        // Create a text file for comparison
        const textFilePath = path.join(testDataDir, 'test-text.txt');
        fs.writeFileSync(textFilePath, 'Test content');
        
        // Refresh the page to see the new file
        await page.reload();
        await page.waitForSelector('.file-row');
        
        // Find the text file
        const fileRow = page.locator('.file-row').filter({hasText: 'test-text.txt'}).first();
        if (await fileRow.count() > 0) {
            // Right-click to open context menu
            await fileRow.click({button: 'right'});
            await expect(page.locator('#context-menu')).toBeVisible();
            
            // Check that image editor options are hidden
            const editImageModal = page.locator('[data-action="edit-image-modal"]');
            const editImageWindow = page.locator('[data-action="edit-image-window"]');
            
            await expect(editImageModal).toBeHidden();
            await expect(editImageWindow).toBeHidden();
            
            // Check that text editor options are visible
            const editModal = page.locator('[data-action="edit-modal"]');
            const editWindow = page.locator('[data-action="edit-window"]');
            
            await expect(editModal).toBeVisible();
            await expect(editWindow).toBeVisible();
        }
        
        // Clean up
        fs.unlinkSync(textFilePath);
    });
    
    test('should detect various image file formats', async ({page}) => {
        // Test different image extensions
        const imageExtensions = ['jpg', 'jpeg', 'gif', 'bmp', 'webp'];
        
        for (const ext of imageExtensions) {
            const imagePath = path.join(testDataDir, `test.${ext}`);
            // Create a dummy file (content doesn't matter for menu detection)
            fs.writeFileSync(imagePath, 'dummy');
            
            // Refresh the page
            await page.reload();
            await page.waitForSelector('.file-row');
            
            // Find the image file
            const fileRow = page.locator('.file-row').filter({hasText: `test.${ext}`}).first();
            if (await fileRow.count() > 0) {
                // Right-click to open context menu
                await fileRow.click({button: 'right'});
                await expect(page.locator('#context-menu')).toBeVisible();
                
                // Check that image editor options are visible
                const editImageModal = page.locator('[data-action="edit-image-modal"]');
                const editImageWindow = page.locator('[data-action="edit-image-window"]');
                
                await expect(editImageModal).toBeVisible();
                await expect(editImageWindow).toBeVisible();
                
                // Close context menu
                await page.keyboard.press('Escape');
            }
            
            // Clean up
            fs.unlinkSync(imagePath);
        }
    });
});