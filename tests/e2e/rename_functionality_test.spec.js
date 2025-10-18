const { test, expect } = require('@playwright/test');

const CONTEXT_MENU_TIMEOUT = process.env.CI ? 10000 : 5000;
const MODAL_TIMEOUT = process.env.CI ? 10000 : 5000;
const TOAST_TIMEOUT = process.env.CI ? 15000 : 5000;

async function openRenameModal(page, targetRow) {
  await targetRow.click({ button: 'right' });
  await page.waitForSelector('#context-menu:not(.hidden)', { timeout: CONTEXT_MENU_TIMEOUT });
  const renameItem = page.locator('[data-action="rename"]');
  await renameItem.click({ timeout: CONTEXT_MENU_TIMEOUT });
  const modal = page.locator('#rename-modal');
  await expect(modal).toBeVisible({ timeout: MODAL_TIMEOUT });
  await expect(page.locator('#context-menu')).toHaveClass(/hidden/, { timeout: CONTEXT_MENU_TIMEOUT });
  return {
    modal,
    input: page.locator('#rename-name'),
    confirmButton: page.locator('#rename-confirm-btn'),
    cancelButton: page.locator('#rename-cancel-btn'),
    errorText: page.locator('#rename-error')
  };
}

async function waitForSuccessToast(page, text = 'Successfully renamed') {
  await page.waitForFunction(
    expected => {
      const toast = document.querySelector('.toast.success');
      return toast && toast.textContent && toast.textContent.includes(expected);
    },
    text,
    { timeout: TOAST_TIMEOUT }
  );
}

test.describe('Rename Functionality', () => {
  test.beforeEach(async ({ page, browserName }) => {
    // Set up console logging for debugging
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text());
      }
    });
    
    // Navigate with retry logic for webkit
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        console.log(`Navigation failed, retrying... (${retries} retries left)`);
        await page.waitForTimeout(2000);
      }
    }
    
    // Wait for the app to load with extended timeout
    await page.waitForSelector('#file-list-body', { timeout: 20000 });
    
    // Wait for initial file load with more robust check
    await page.waitForFunction(() => {
      const tbody = document.querySelector('#file-list-body');
      // Check that tbody exists and has children
      if (!tbody) return false;
      // For webkit, also check that the first row is fully rendered
      const firstRow = tbody.querySelector('.file-row');
      if (!firstRow) return false;
      // Check that the row has content
      const nameCell = firstRow.querySelector('.col-name');
      return nameCell && nameCell.textContent && nameCell.textContent.trim().length > 0;
    }, { timeout: 20000 });
    
    // Additional wait for webkit to ensure full render
    if (browserName === 'webkit') {
      await page.waitForTimeout(500);
    }
  });

  test('should show rename dialog when clicking rename in context menu', async ({ page, browserName }) => {
    // Wait for files to load with extra time for CI
    await page.waitForSelector('.file-row', { timeout: process.env.CI ? 20000 : 10000 });
    
    // Additional wait for webkit
    if (browserName === 'webkit' && process.env.CI) {
      await page.waitForTimeout(1000);
    }
    
    // Find a file
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    const originalPath = await fileRow.getAttribute('data-path');
    const expectedName = originalPath.split('/').pop();
    
    const { modal, input, cancelButton } = await openRenameModal(page, fileRow);
    await expect(input).toHaveValue(expectedName, { timeout: MODAL_TIMEOUT });
    
    await cancelButton.click();
    await expect(modal).toBeHidden({ timeout: MODAL_TIMEOUT });
  });

  test('should rename file successfully', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    const newName = `renamed_${Date.now()}.txt`;

    const { modal, input, confirmButton } = await openRenameModal(page, fileRow);
    await input.fill(newName);
    await confirmButton.click();
    await waitForSuccessToast(page);
    await expect(modal).toBeHidden({ timeout: MODAL_TIMEOUT });

    await page.waitForSelector(`[data-path*="${newName}"]`, { timeout: process.env.CI ? 10000 : 5000 });
  });

  test('should show error when renaming to existing name', async ({ page }) => {
    await page.waitForSelector('.file-row');

    const files = await page.locator('.file-row[data-is-dir="false"]').all();
    if (files.length < 2) {
      test.skip('Not enough files for this test');
      return;
    }

    const duplicateName = (await files[1].locator('.col-name').textContent()).trim();

    const { modal, input, confirmButton } = await openRenameModal(page, files[0]);
    await input.fill(duplicateName);
    await confirmButton.click();

    const errorModal = page.locator('#error-modal');
    await expect(errorModal).toBeVisible({ timeout: MODAL_TIMEOUT });
    await expect(errorModal.locator('#error-message')).toContainText('already exists');
    await errorModal.locator('#error-ok-btn').click();
    await expect(errorModal).toBeHidden({ timeout: MODAL_TIMEOUT });
    await expect(modal).toBeHidden({ timeout: MODAL_TIMEOUT });
  });

  test('should disable rename for multiple selections', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Select multiple files
    const checkboxes = await page.locator('.file-checkbox').all();
    if (checkboxes.length >= 2) {
      await checkboxes[0].check();
      await checkboxes[1].check();
      
      // Right-click on one of the selected items
      const firstRow = await page.locator('.file-row').first();
      await firstRow.click({ button: 'right' });
      
      // Wait for context menu
      await page.waitForSelector('#context-menu:not(.hidden)');
      
      // Check that rename is disabled
      const renameItem = page.locator('[data-action="rename"]');
      await expect(renameItem).toHaveClass(/disabled/);
    }
  });

  test('should not allow slashes in new name', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    const { modal, input, confirmButton, errorText, cancelButton } = await openRenameModal(page, fileRow);
    await input.fill('invalid/name.txt');
    await confirmButton.click();

    await expect(errorText).toBeVisible({ timeout: MODAL_TIMEOUT });
    await expect(errorText).toHaveText(/cannot contain \/ or \\/i);
    await expect(modal).toBeVisible();

    await cancelButton.click();
    await expect(modal).toBeHidden({ timeout: MODAL_TIMEOUT });
  });

  test('should cancel rename when dialog is dismissed', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a file and note its name
    const fileRow = await page.locator('.file-row[data-is-dir="false"]').first();
    const originalPath = await fileRow.getAttribute('data-path');
    
    const { modal, cancelButton } = await openRenameModal(page, fileRow);
    await cancelButton.click();
    await expect(modal).toBeHidden({ timeout: MODAL_TIMEOUT });
    
    // Verify file still has original name - use first() to avoid multiple matches
    const originalFileRow = page.locator(`[data-path="${originalPath}"]`).first();
    await expect(originalFileRow).toBeVisible();
  });

  test('should work for folders as well as files', async ({ page }) => {
    // Wait for files to load
    await page.waitForSelector('.file-row');
    
    // Find a folder
    const folderRow = await page.locator('.file-row[data-is-dir="true"]').first();
    if (!folderRow) {
      test.skip('No folders found for this test');
      return;
    }
    
    const newName = `renamed_folder_${Date.now()}`;

    const { modal, input, confirmButton } = await openRenameModal(page, folderRow);
    await expect(modal).toBeVisible();
    await input.fill(newName);
    await confirmButton.click();
    await waitForSuccessToast(page);
    await expect(modal).toBeHidden({ timeout: MODAL_TIMEOUT });

    await page.waitForSelector(`[data-path*="${newName}"][data-is-dir="true"]`, { timeout: process.env.CI ? 10000 : 5000 });
  });
});
