const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe.serial('Double-click File Viewer', () => {
  const testDataDir = path.join(__dirname, 'test_data');

  test.beforeAll(async () => {
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }

    fs.writeFileSync(path.join(testDataDir, 'dbl-test.txt'), 'Text file content');
    fs.writeFileSync(path.join(testDataDir, 'dbl-test.js'), 'console.log("JavaScript");');
    fs.writeFileSync(path.join(testDataDir, 'dbl-test.md'), '# Markdown content');
    fs.writeFileSync(path.join(testDataDir, 'dbl-test.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]));
    fs.writeFileSync(path.join(testDataDir, 'dbl-test.pdf'), 'PDF mock content');

    const subDir = path.join(testDataDir, 'subfolder');
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir);
    }
  });

  test.afterAll(async () => {
    const filesToClean = ['dbl-test.txt', 'dbl-test.js', 'dbl-test.md', 'dbl-test.bin', 'dbl-test.pdf'];
    filesToClean.forEach((file) => {
      const filePath = path.join(testDataDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:3001');
    await page.waitForSelector('.file-row', { timeout: 10000 });
  });

  const openViewerForFile = async ({ page, context }, fileLabel) => {
    const fileRow = page.locator('.file-row').filter({ hasText: fileLabel }).first();
    await expect(fileRow).toBeVisible({ timeout: 10000 });

    const viewerPromise = context.waitForEvent('page');
    await fileRow.dblclick();
    const viewerPage = await viewerPromise;

    await viewerPage.waitForLoadState();
    await viewerPage.waitForSelector('#viewer-content', { timeout: 10000 });

    return viewerPage;
  };

  const expectViewerTitle = async (viewerPage, fileName) => {
    const title = await viewerPage.title();
    expect(title).toContain(fileName);
    expect(title).toContain('Viewer');
  };

  test('should open text file in viewer on double-click', async ({ page, context }) => {
    const viewerPage = await openViewerForFile({ page, context }, 'dbl-test.txt');
    await expectViewerTitle(viewerPage, 'dbl-test.txt');
    await viewerPage.waitForSelector('.viewer-text', { timeout: 10000 });

    const textContent = await viewerPage.locator('.viewer-text').innerText();
    expect(textContent.trim()).toBe('Text file content');

    await viewerPage.close();
  });

  test('should open JavaScript file in viewer on double-click', async ({ page, context }) => {
    const viewerPage = await openViewerForFile({ page, context }, 'dbl-test.js');
    await expectViewerTitle(viewerPage, 'dbl-test.js');
    await viewerPage.waitForSelector('.viewer-text', { timeout: 10000 });

    const textContent = await viewerPage.locator('.viewer-text').innerText();
    expect(textContent.trim()).toBe('console.log("JavaScript");');

    await viewerPage.close();
  });

  test('should open Markdown file in viewer on double-click', async ({ page, context }) => {
    const viewerPage = await openViewerForFile({ page, context }, 'dbl-test.md');
    await expectViewerTitle(viewerPage, 'dbl-test.md');
    await viewerPage.waitForSelector('.viewer-text', { timeout: 10000 });

    const textContent = await viewerPage.locator('.viewer-text').innerText();
    expect(textContent.trim()).toBe('# Markdown content');

    await viewerPage.close();
  });

  test('should open PDF file in viewer on double-click', async ({ page, context }) => {
    const viewerPage = await openViewerForFile({ page, context }, 'dbl-test.pdf');
    await expectViewerTitle(viewerPage, 'dbl-test.pdf');
    const downloadPromise = viewerPage.waitForEvent('download', { timeout: 2000 }).catch(() => null);

    const iframe = viewerPage.locator('iframe.viewer-iframe');
    await iframe.waitFor({ state: 'visible', timeout: 10000 });
    await expect(iframe).toHaveAttribute('data-mime-type', 'application/pdf');

    await expect(iframe).toHaveAttribute('src', /^blob:/, { timeout: 5000 });

    const download = await downloadPromise;
    expect(download).toBeNull();

    await viewerPage.close();
  });

  test('should not open viewer for binary file', async ({ page, context }) => {
    const fileRow = page.locator('.file-row').filter({ hasText: 'dbl-test.bin' }).first();
    await expect(fileRow).toBeVisible({ timeout: 10000 });

    const pageEvent = context.waitForEvent('page', { timeout: 1000 }).catch(() => null);
    await fileRow.dblclick();
    const newPage = await pageEvent;
    expect(newPage).toBeNull();

    await expect(page.locator('#properties-modal')).toBeHidden();
  });

  test('should navigate into directory on double-click', async ({ page }) => {
    const dirRow = page.locator('.file-row').filter({ hasText: 'subfolder' }).first();
    await expect(dirRow).toBeVisible({ timeout: 10000 });

    const initialUrl = page.url();
    await dirRow.dblclick();
    await page.waitForTimeout(1500);

    const newUrl = page.url();
    expect(newUrl).toContain('subfolder');
    expect(newUrl).not.toBe(initialUrl);
  });

  test('context menu still exposes edit options for text files', async ({ page }) => {
    const fileRow = page.locator('.file-row').filter({ hasText: 'dbl-test.txt' }).first();
    await expect(fileRow).toBeVisible({ timeout: 10000 });

    await fileRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const openItem = page.locator('[data-action="open"]');
    await expect(openItem).not.toHaveClass(/disabled/);

    await expect(page.locator('[data-action="edit-modal"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-action="edit-window"]')).toBeVisible({ timeout: 5000 });

    await page.keyboard.press('Escape');
    await expect(page.locator('#context-menu')).toHaveClass(/hidden/);
  });
});
