const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('File Manager Cursor Behavior', () => {
    const testDataDir = path.join(__dirname, 'test-data');
    
    test.beforeAll(async () => {
        // Ensure test directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        
        // Create test files
        fs.writeFileSync(path.join(testDataDir, 'test-cursor.txt'), 'Test file for cursor');
    });

    test.beforeEach(async ({ page }) => {
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
    });

    test('table cells should have default cursor, not text cursor', async ({ page }) => {
        // Find a file row
        const fileRow = page.locator('.file-row').filter({ hasText: 'test-cursor.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Check cursor style on name cell
        const nameCell = fileRow.locator('td').nth(2); // Name column (after checkbox and icon)
        const nameCursor = await nameCell.evaluate(el => 
            window.getComputedStyle(el).cursor
        );
        expect(nameCursor).toBe('default');
        
        // Check cursor style on size cell
        const sizeCell = fileRow.locator('td').nth(3); // Size column
        const sizeCursor = await sizeCell.evaluate(el => 
            window.getComputedStyle(el).cursor
        );
        expect(sizeCursor).toBe('default');
        
        // Check cursor style on type cell
        const typeCell = fileRow.locator('td').nth(4); // Type column
        const typeCursor = await typeCell.evaluate(el => 
            window.getComputedStyle(el).cursor
        );
        expect(typeCursor).toBe('default');
        
        // Check cursor style on modified cell
        const modifiedCell = fileRow.locator('td').nth(5); // Modified column
        const modifiedCursor = await modifiedCell.evaluate(el => 
            window.getComputedStyle(el).cursor
        );
        expect(modifiedCursor).toBe('default');
    });

    test('checkbox should have pointer cursor', async ({ page }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'test-cursor.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Check cursor on checkbox
        const checkbox = fileRow.locator('input[type="checkbox"]');
        const checkboxCursor = await checkbox.evaluate(el => 
            window.getComputedStyle(el).cursor
        );
        expect(checkboxCursor).toBe('pointer');
    });

    test('sortable headers should have pointer cursor', async ({ page }) => {
        // Check Name header (sortable)
        const nameHeader = page.locator('#file-list th').filter({ hasText: 'Name' });
        const nameHeaderCursor = await nameHeader.evaluate(el => 
            window.getComputedStyle(el).cursor
        );
        expect(nameHeaderCursor).toBe('pointer');
        
        // Check Size header (sortable)
        const sizeHeader = page.locator('#file-list th').filter({ hasText: 'Size' });
        const sizeHeaderCursor = await sizeHeader.evaluate(el => 
            window.getComputedStyle(el).cursor
        );
        expect(sizeHeaderCursor).toBe('pointer');
    });

    test('non-sortable headers should have default cursor', async ({ page }) => {
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

    test('text selection should be disabled in table cells', async ({ page }) => {
        const fileRow = page.locator('.file-row').filter({ hasText: 'test-cursor.txt' }).first();
        await expect(fileRow).toBeVisible({ timeout: 10000 });
        
        // Check user-select style on cells
        const nameCell = fileRow.locator('td').nth(2);
        const userSelect = await nameCell.evaluate(el => 
            window.getComputedStyle(el).userSelect || 
            window.getComputedStyle(el).webkitUserSelect ||
            window.getComputedStyle(el).mozUserSelect
        );
        expect(userSelect).toBe('none');
    });
});