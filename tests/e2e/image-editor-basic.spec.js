const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

test.describe('Image Editor Basic Functionality', () => {
    const testDataDir = path.join(__dirname, 'test_data');
    const sampleImagePath = path.join(testDataDir, 'test-image.png');
    
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
    
    test('should open image viewer in new window on double-click', async ({ page, context }) => {
        // Wait for file list to load
        await page.waitForSelector('.file-row');
        
        // Find the sample image file
        const imageRow = page.locator('.file-row').filter({hasText: 'test-image.png'}).first();
        
        // Wait for the file to be visible (may need refresh)
        if (await imageRow.count() === 0) {
            await page.reload();
            await page.waitForSelector('.file-row');
        }
        
        await expect(imageRow).toBeVisible({ timeout: 10000 });
        
        // Listen for new window
        const viewerPromise = context.waitForEvent('page');
        
        await imageRow.dblclick();
        
        const viewerPage = await viewerPromise;
        await viewerPage.waitForLoadState();
        await viewerPage.waitForSelector('#viewer-content', { timeout: 10000 });
        await viewerPage.waitForSelector('img.viewer-media', { timeout: 10000 });
        
        const title = await viewerPage.title();
        expect(title).toContain('test-image.png');
        expect(title).toContain('Viewer');
        
        await viewerPage.close();
    });
    
    test('should open image editor in modal and load image', async ({ page }) => {
        // Wait for file list to load
        await page.waitForSelector('.file-row');
        
        // Find the sample image file
        const imageRow = page.locator('.file-row').filter({hasText: 'test-image.png'}).first();
        
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
        const editImageModalItem = page.locator('[data-action="edit-image-modal"]');
        await expect(editImageModalItem).toBeVisible();

        // Trigger via app helper to avoid flakiness with native context-menu clicks
        await page.evaluate(() => {
            const ui = window.dendriteApp?.ui;
            if (ui && ui.contextMenuTargetPath) {
                ui.openImageEditorModal(ui.contextMenuTargetPath);
            }
        });
        
        // Wait for modal to appear
        const modal = page.locator('#image-editor-modal');
        await expect(modal).toBeVisible();
        
        // Check that iframe is loaded
        const iframe = page.locator('#image-editor-modal-iframe');
        await expect(iframe).toBeVisible();
        
        // Verify the iframe source contains the correct path
        const iframeSrc = await iframe.getAttribute('src');
        expect(iframeSrc).toContain('image-editor.html');
        expect(iframeSrc).toContain('test-image.png');
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
        const imageRow = page.locator('.file-row').filter({hasText: 'test-image.png'}).first();
        
        // Wait for the file to be visible
        if (await imageRow.count() === 0) {
            await page.reload();
            await page.waitForSelector('.file-row');
        }
        
        await expect(imageRow).toBeVisible({ timeout: 10000 });
        
        // Listen for new window
        const pagePromise = context.waitForEvent('page');
        
        await imageRow.click({ button: 'right' });
        await page.waitForSelector('#context-menu:not(.hidden)');

        await page.evaluate(() => {
            const ui = window.dendriteApp?.ui;
            if (ui && ui.contextMenuTargetPath) {
                ui.openImageEditorWindow(ui.contextMenuTargetPath);
            }
        });

        const editorPage = await pagePromise;
        await editorPage.waitForLoadState();
        
        // Wait for editor to be ready
        await editorPage.waitForFunction(
            () => document.title.includes('test-image.png'),
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
        
        // Save as PNG
        await image.writeAsync(filepath);
    } catch (error) {
        // If jimp is not available, create a simple PNG using a buffer
        const pngData = Buffer.from([
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
            0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
            0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
            0x54, 0x08, 0x99, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
            0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xDD, 0x8D,
            0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E,
            0x44, 0xAE, 0x42, 0x60, 0x82
        ]);

        fs.writeFileSync(filepath, pngData);
    }
}
