const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Image Editor Basic Functionality', () => {
    const testDataDir = path.join(__dirname, 'test_data');
    const sampleImagePath = path.join(testDataDir, 'file_example_JPG_100kB.jpg');
    
    test.beforeAll(async () => {
        // Ensure test data directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        
        // Create a test image if it doesn't exist
        if (!fs.existsSync(sampleImagePath)) {
            console.log('Creating sample image...');
            await createTestImage(sampleImagePath);
            console.log('Sample image created successfully');
        }
    });
    
    test.beforeEach(async ({page}) => {
        // Ensure test image exists before each test
        if (!fs.existsSync(sampleImagePath)) {
            console.log('Recreating sample image...');
            await createTestImage(sampleImagePath);
        }
        
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row');
        
        // Give the file system a moment to sync
        await page.waitForTimeout(500);
    });
    
    test.afterAll(async () => {
        // Clean up the test image
        if (fs.existsSync(sampleImagePath)) {
            fs.unlinkSync(sampleImagePath);
            console.log('Sample image cleaned up');
        }
    });
    
    test('should open image editor in new window and load image', async ({ page, context }) => {
        // Wait for file list to load
        await page.waitForSelector('.file-row');
        
        // Find the sample image file
        const imageRow = page.locator('.file-row').filter({hasText: 'file_example_JPG_100kB.jpg'}).first();
        
        // Wait for the file to be visible (may need refresh)
        if (await imageRow.count() === 0) {
            await page.reload();
            await page.waitForSelector('.file-row');
        }
        
        await expect(imageRow).toBeVisible({ timeout: 10000 });
        
        // Listen for new window
        const pagePromise = context.waitForEvent('page');
        
        // Double-click to open in new window
        await imageRow.dblclick();
        
        // Wait for new window
        const editorPage = await pagePromise;
        await editorPage.waitForLoadState();
        
        // Check the URL of the new window
        const editorUrl = editorPage.url();
        expect(editorUrl).toContain('image-editor.html');
        expect(editorUrl).toContain('file_example_JPG_100kB.jpg');
        expect(editorUrl).not.toContain('modal=true');
        
        // Wait for the title to be updated by JavaScript
        await editorPage.waitForFunction(
            () => document.title.includes('file_example_JPG_100kB.jpg'),
            { timeout: 10000 }
        );
        
        // Check that image editor loaded
        const title = await editorPage.title();
        expect(title).toContain('file_example_JPG_100kB.jpg');
        expect(title).toContain('Dendrite Image Editor');
        
        // Wait for TUI Image Editor container
        const editorContainer = editorPage.locator('#tui-image-editor');
        await expect(editorContainer).toBeVisible();
        
        // Wait for canvas (indicates image loaded)
        const canvas = editorPage.locator('.lower-canvas, .tui-image-editor-canvas-container canvas').first();
        await expect(canvas).toBeVisible({ timeout: 10000 });
        
        // Check that the image is actually loaded (canvas has dimensions)
        const canvasSize = await canvas.boundingBox();
        expect(canvasSize).toBeTruthy();
        expect(canvasSize.width).toBeGreaterThan(0);
        expect(canvasSize.height).toBeGreaterThan(0);
        
        // Check for menu buttons
        const menuButtons = editorPage.locator('.tui-image-editor-menu-btn, .tie-btn-crop, .tie-btn-flip, .tie-btn-rotate, .tie-btn-draw, .tie-btn-shape, .tie-btn-icon, .tie-btn-text, .tie-btn-mask, .tie-btn-filter');
        const buttonCount = await menuButtons.count();
        expect(buttonCount).toBeGreaterThan(0);
        
        // Close the editor window
        await editorPage.close();
    });
    
    test('should open image editor in modal and load image', async ({ page }) => {
        // Wait for file list to load
        await page.waitForSelector('.file-row');
        
        // Find the sample image file
        const imageRow = page.locator('.file-row').filter({hasText: 'file_example_JPG_100kB.jpg'}).first();
        
        // Wait for the file to be visible (may need refresh)
        if (await imageRow.count() === 0) {
            await page.reload();
            await page.waitForSelector('.file-row');
        }
        
        await expect(imageRow).toBeVisible({ timeout: 10000 });
        
        // Right-click to open context menu
        await imageRow.click({ button: 'right' });
        await expect(page.locator('#context-menu')).toBeVisible();
        
        // Click "Edit Image (modal)" in context menu
        await page.click('[data-action="edit-image-modal"]');
        
        // Wait for modal to appear
        const modal = page.locator('#image-editor-modal');
        await expect(modal).toBeVisible();
        
        // Check that iframe is loaded
        const iframe = page.locator('#image-editor-modal-iframe');
        await expect(iframe).toBeVisible();
        
        // Verify the iframe source contains the correct path
        const iframeSrc = await iframe.getAttribute('src');
        expect(iframeSrc).toContain('image-editor.html');
        expect(iframeSrc).toContain('file_example_JPG_100kB.jpg');
        expect(iframeSrc).toContain('modal=true');
        
        // Wait for the iframe content to load
        const iframeHandle = page.frameLocator('#image-editor-modal-iframe');
        
        // Check editor loaded in iframe
        const editorContainer = iframeHandle.locator('#tui-image-editor');
        await expect(editorContainer).toBeVisible({ timeout: 10000 });
        
        // Wait for canvas in iframe (indicates image loaded)
        const canvas = iframeHandle.locator('.lower-canvas, .tui-image-editor-canvas-container canvas').first();
        await expect(canvas).toBeVisible({ timeout: 10000 });
        
        // Check for the save button in iframe
        const saveBtn = iframeHandle.locator('#save-btn');
        await expect(saveBtn).toBeVisible();
        
        // Close modal
        const closeButton = page.locator('.image-editor-modal-close');
        await closeButton.click();
        
        await expect(modal).toBeHidden();
    });
    
    test('should be able to open and save image', async ({ page, context }) => {
        // Find and open the image in a new window
        const imageRow = page.locator('.file-row').filter({hasText: 'file_example_JPG_100kB.jpg'}).first();
        
        // Wait for the file to be visible
        if (await imageRow.count() === 0) {
            await page.reload();
            await page.waitForSelector('.file-row');
        }
        
        await expect(imageRow).toBeVisible({ timeout: 10000 });
        
        // Listen for new window
        const pagePromise = context.waitForEvent('page');
        
        // Double-click to open in new window
        await imageRow.dblclick();
        
        // Wait for new window
        const editorPage = await pagePromise;
        await editorPage.waitForLoadState();
        
        // Wait for editor to be ready
        await editorPage.waitForFunction(
            () => document.title.includes('file_example_JPG_100kB.jpg'),
            { timeout: 10000 }
        );
        
        // Wait for canvas to be ready
        const canvas = editorPage.locator('.lower-canvas, .tui-image-editor-canvas-container canvas').first();
        await expect(canvas).toBeVisible({ timeout: 10000 });
        
        // Test that save button exists and is clickable
        const saveBtn = editorPage.locator('#save-btn');
        await expect(saveBtn).toBeVisible();
        await expect(saveBtn).toBeEnabled();
        
        // Click save button to test it works (doesn't throw error)
        await saveBtn.click();
        
        // Wait a moment for save to process
        await editorPage.waitForTimeout(1000);
        
        // If we got here without errors, save functionality works
        // Close the editor window
        await editorPage.close();
    });
});

// Helper function to create a test image using jimp or a simple buffer
async function createTestImage(filepath) {
    try {
        // Try to use jimp if available
        const Jimp = require('jimp');
        const image = new Jimp(800, 600, 0xFF0000FF); // Create a 800x600 red image
        
        // Add some text or pattern to make it more interesting
        const font = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
        image.print(font, 10, 10, 'Test Image');
        
        // Save as JPEG
        await image.quality(90).writeAsync(filepath);
    } catch (error) {
        // If jimp is not available, create a simple JPEG using a buffer
        // This creates a valid but small JPEG file
        const jpegBuffer = Buffer.from([
            // JPEG SOI marker
            0xFF, 0xD8,
            // JFIF APP0 marker
            0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00,
            // Define Quantization Table
            0xFF, 0xDB, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09,
            0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F,
            0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37,
            0x29, 0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32,
            // Start of Frame
            0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
            // Define Huffman Table
            0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x09,
            // Start of Scan
            0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x00, 0x01, 0x3F,
            // Image data (minimal)
            0x00,
            // End of Image
            0xFF, 0xD9
        ]);
        
        fs.writeFileSync(filepath, jpegBuffer);
    }
}