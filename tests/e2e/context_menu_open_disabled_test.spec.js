const { test, expect } = require('@playwright/test');

test.describe('Context Menu Open Action', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForSelector('#file-list-body');
  });

  test('right-click does not toggle checkbox state', async ({ page }) => {
    const firstRow = page.locator('.file-row').first();
    const checkbox = firstRow.locator('.file-checkbox');

    await expect(checkbox).not.toBeChecked();

    await firstRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    await expect(checkbox).not.toBeChecked();
    await expect(firstRow).not.toHaveClass(/selected/);

    await page.keyboard.press('Escape');
  });

  test('right-click on checkbox does not change selection', async ({ page }) => {
    const firstRow = page.locator('.file-row').first();
    const checkbox = firstRow.locator('.file-checkbox');

    await expect(checkbox).not.toBeChecked();

    await checkbox.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    await expect(checkbox).not.toBeChecked();
    await expect(firstRow).not.toHaveClass(/selected/);

    await page.keyboard.press('Escape');
  });

  test('should enable "Open" action for browser-viewable files', async ({ page }) => {
    const imageRow = page.locator('.file-row').filter({ hasText: 'image.jpg' }).first();
    await expect(imageRow).toBeVisible();

    await imageRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const openMenuItem = page.locator('[data-action="open"]');
    await expect(openMenuItem).not.toHaveClass(/disabled/);
    await expect(openMenuItem).not.toHaveCSS('pointer-events', 'none');
  });

  test('context menu "Open" launches viewer window for browser-viewable files', async ({ page, context }) => {
    const imageRow = page.locator('.file-row').filter({ hasText: 'image.jpg' }).first();
    await expect(imageRow).toBeVisible();

    await imageRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const openMenuItem = page.locator('[data-action="open"]');

    const viewerPromise = context.waitForEvent('page');
    await openMenuItem.click();
    const viewerPage = await viewerPromise;

    await viewerPage.waitForLoadState();
    await viewerPage.waitForSelector('#viewer-content', { timeout: 10000 });
    await expect(viewerPage).toHaveURL(/file-viewer\.html/);
    await expect(viewerPage).toHaveTitle(/image\.jpg/);

    await viewerPage.close();
  });

  test('should disable "Open" action for non-viewable files', async ({ page }) => {
    const binaryRow = page.locator('.file-row').filter({ hasText: 'program.exe' }).first();
    await expect(binaryRow).toBeVisible();

    await binaryRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const openMenuItem = page.locator('[data-action="open"]');
    await expect(openMenuItem).toHaveClass(/disabled/);
    await expect(openMenuItem).toHaveCSS('pointer-events', 'none');
    await expect(openMenuItem).toHaveCSS('opacity', '0.5');
  });

  test('should disable "Open" action for folders in context menu', async ({ page }) => {
    const folderRow = page.locator('.file-row[data-is-dir="true"]').first();
    await expect(folderRow).toBeVisible();

    await folderRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const openMenuItem = page.locator('[data-action="open"]');
    await expect(openMenuItem).toHaveClass(/disabled/);
    await expect(openMenuItem).toHaveCSS('pointer-events', 'none');
  });

  test('double-click still navigates into folder when context "Open" is disabled', async ({ page }) => {
    const folderRow = page.locator('.file-row[data-is-dir="true"]').first();
    await expect(folderRow).toBeVisible();

    const folderPath = await folderRow.getAttribute('data-path');
    const folderName = folderPath?.split('/').filter(Boolean).pop();

    const waitTarget = folderName || folderPath;

    await folderRow.dblclick();

    await page.waitForFunction((expectedText) => {
      const display = document.querySelector('#path-display');
      return !!display && display.textContent && expectedText && display.textContent.includes(expectedText);
    }, waitTarget, { timeout: 10000 });

    await expect(page.locator('#path-display')).toContainText(waitTarget);
  });

  test('should disable "Open" action when multiple items are selected', async ({ page }) => {
    const checkboxes = await page.locator('.file-checkbox').all();
    if (checkboxes.length < 2) {
      test.skip('Not enough files to test multi-select');
    }

    await checkboxes[0].check();
    await checkboxes[1].check();

    const firstRow = page.locator('.file-row').first();
    await firstRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const openMenuItem = page.locator('[data-action="open"]');
    const renameItem = page.locator('[data-action="rename"]');
    const propertiesItem = page.locator('[data-action="properties"]');

    await expect(openMenuItem).toHaveClass(/disabled/);
    await expect(renameItem).toHaveClass(/disabled/);
    await expect(propertiesItem).toHaveClass(/disabled/);
  });

  test('should disable single-item actions even when context menu opens on an unselected item', async ({ page }) => {
    const checkboxLocators = await page.locator('.file-checkbox').all();
    if (checkboxLocators.length < 3) {
      test.skip('Not enough rows to verify behaviour');
    }

    await checkboxLocators[0].check();
    await checkboxLocators[1].check();

    const rows = page.locator('.file-row');
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i += 1) {
      const row = rows.nth(i);
      const rowCheckbox = row.locator('.file-checkbox');
      if (await rowCheckbox.isChecked()) {
        continue;
      }

      await row.click({ button: 'right' });
      await page.waitForSelector('#context-menu:not(.hidden)');

      const openMenuItem = page.locator('[data-action="open"]');
      const renameItem = page.locator('[data-action="rename"]');
      const propertiesItem = page.locator('[data-action="properties"]');
      const editModalItem = page.locator('[data-action="edit-modal"]');
      const editWindowItem = page.locator('[data-action="edit-window"]');

      await expect(openMenuItem).toHaveClass(/disabled/);
      await expect(renameItem).toHaveClass(/disabled/);
      await expect(propertiesItem).toHaveClass(/disabled/);
      await expect(editModalItem).toBeHidden();
      await expect(editWindowItem).toBeHidden();

      await page.keyboard.press('Escape');
      break;
    }

    await checkboxLocators[0].uncheck();
    await checkboxLocators[1].uncheck();
  });

  test('context menu on empty space hides edit options', async ({ page }) => {
    await page.click('#file-list-container', { button: 'right', position: { x: 10, y: 10 } });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const editModalItem = page.locator('[data-action="edit-modal"]');
    const editWindowItem = page.locator('[data-action="edit-window"]');

    await expect(editModalItem).toBeHidden();
    await expect(editWindowItem).toBeHidden();

    await page.keyboard.press('Escape');
  });

  test('paste option should be hidden for files and enabled for folders', async ({ page }) => {
    const fileRow = page.locator('.file-row[data-is-dir="false"]').first();
    await expect(fileRow).toBeVisible();

    await fileRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const pasteItem = page.locator('[data-action="paste"]');
    await expect(pasteItem).toBeHidden();
    await page.keyboard.press('Escape');

    await fileRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');
    await page.locator('[data-action="copy"]').click();
    await page.waitForTimeout(200);

    const folderRow = page.locator('.file-row[data-is-dir="true"]').first();
    await folderRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    await expect(pasteItem).toBeVisible();
    await expect(pasteItem).not.toHaveClass(/disabled/);

    await page.keyboard.press('Escape');
    await page.evaluate(() => window.clipboard.clear());
  });

  test('should not navigate when clicking disabled "Open" item', async ({ page }) => {
    const binaryRow = page.locator('.file-row').filter({ hasText: 'program.exe' }).first();
    await expect(binaryRow).toBeVisible();

    await binaryRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const openMenuItem = page.locator('[data-action="open"]');
    await expect(openMenuItem).toHaveClass(/disabled/);

    const currentUrl = page.url();

    await openMenuItem.click({ force: true });
    await expect(page).toHaveURL(currentUrl);

    const downloadPromise = page.waitForEvent('download', { timeout: 1000 }).catch(() => null);
    const download = await downloadPromise;
    expect(download).toBeNull();

    await expect(page.locator('#context-menu')).toHaveClass(/hidden/);
  });

  test('should still allow "Download" action for files', async ({ page }) => {
    const fileRow = page.locator('.file-row[data-is-dir="false"]').first();
    await expect(fileRow).toBeVisible();

    await fileRow.click({ button: 'right' });
    await page.waitForSelector('#context-menu:not(.hidden)');

    const downloadMenuItem = page.locator('[data-action="download"]');
    await expect(downloadMenuItem).not.toHaveClass(/disabled/);
  });
});
