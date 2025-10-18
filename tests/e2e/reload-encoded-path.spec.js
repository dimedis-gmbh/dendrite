// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const folderName = 'Space Folder Reload';
const folderPath = path.join(__dirname, 'test_data', folderName);
const markerFile = path.join(folderPath, 'reload-marker.txt');

test.describe('Reload handles encoded paths', () => {
    test.beforeAll(() => {
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        if (!fs.existsSync(markerFile)) {
            fs.writeFileSync(markerFile, 'reload test marker');
        }
    });

    test('refresh button works when URL path is percent-encoded', async ({ page }) => {
        const encodedPath = encodeURIComponent(folderName);
        const targetUrl = `http://127.0.0.1:3001/${encodedPath}`;

        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 30000 });
        await page.waitForSelector('.file-row', { timeout: 15000 });
        await expect(page.locator('#path-display')).toHaveText(folderName);

        const reloadResponse = page.waitForResponse((response) => {
            if (response.request().method() !== 'GET') {
                return false;
            }
            const url = response.url();
            return url.includes('/api/files') && url.includes(`path=${encodeURIComponent(folderName)}`);
        });

        await page.locator('#btn-refresh').click();

        const response = await reloadResponse;
        expect(response.status()).toBe(200);

        await expect(page.locator('#error-modal')).toBeHidden();
        await expect(page.locator('#path-display')).toHaveText(folderName);

        const markerRow = page.locator('.file-row').filter({ hasText: 'reload-marker.txt' });
        await expect(markerRow.first()).toBeVisible();
    });
});
