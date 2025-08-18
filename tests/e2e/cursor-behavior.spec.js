const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('File Manager Cursor Behavior', () => {
    const testDataDir = path.join(__dirname, 'test_data');

    test.beforeAll(async () => {
        // Ensure test directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, {recursive: true});
        }

        // Create test files
        fs.writeFileSync(path.join(testDataDir, 'test-cursor.txt'), 'Test file for cursor');
    });

    test.beforeEach(async ({page}) => {
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', {timeout: 10000});
    });

    test('sortable headers should have pointer cursor', async ({page}) => {
        // Check Name header (sortable)
        const nameHeader = page.locator('#file-list th').filter({hasText: 'Name'});
        const nameHeaderCursor = await nameHeader.evaluate(el =>
            window.getComputedStyle(el).cursor
        );
        expect(nameHeaderCursor).toBe('pointer');

        // Check Size header (sortable)
        const sizeHeader = page.locator('#file-list th').filter({hasText: 'Size'});
        const sizeHeaderCursor = await sizeHeader.evaluate(el =>
            window.getComputedStyle(el).cursor
        );
        expect(sizeHeaderCursor).toBe('pointer');
    });

    test('non-sortable headers should have default cursor', async ({page}) => {
        // Check checkbox header (non-sortable)
        const checkboxHeader = page.locator('#file-list th.col-select');
        const checkboxHeaderCursor = await checkboxHeader.evaluate(el =>
            window.getComputedStyle(el).cursor
        );
        expect(checkboxHeaderCursor).toBe('default');

        // Check icon header (non-sortable)
        const iconHeader = page.locator('#file-list th.col-icon');
        const iconHeaderCursor = await iconHeader.evaluate(el =>
            window.getComputedStyle(el).cursor
        );
        expect(iconHeaderCursor).toBe('default');
    });
});