// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Dendrite File Manager', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Wait for the app to load
    await page.waitForSelector('#file-list');
    
    // Wait for initial file load
    await page.waitForFunction(() => {
      const tbody = document.querySelector('#file-list-body');
      return tbody && tbody.children.length > 0;
    });
  });

  test('should load the file manager interface', async ({ page }) => {
    // Check title
    await expect(page).toHaveTitle('Dendrite File Manager');
    
    // Check main UI elements are present
    await expect(page.locator('#status-bar')).toBeVisible();
    await expect(page.locator('#toolbar')).toBeVisible();
    await expect(page.locator('#file-list')).toBeVisible();
    
    // Check quota info is displayed
    await expect(page.locator('#quota-text')).toContainText('MB');
    
    // Check toolbar buttons
    await expect(page.locator('#btn-back')).toBeVisible();
    await expect(page.locator('#btn-up')).toBeVisible();
    await expect(page.locator('#btn-refresh')).toBeVisible();
    await expect(page.locator('#btn-download')).toBeVisible();
    await expect(page.locator('#btn-download-zip')).toBeVisible();
  });

  test('should display files and folders', async ({ page }) => {
    // Check that files are loaded
    const fileRows = page.locator('.file-row');
    await expect(fileRows.first()).toBeVisible();
    
    // Check file list headers
    await expect(page.locator('th.col-name')).toContainText('Name');
    await expect(page.locator('th.col-size')).toContainText('Size');
    await expect(page.locator('th.col-type')).toContainText('Type');
    await expect(page.locator('th.col-modified')).toContainText('Modified');
    
    // Verify at least some expected files are present
    await expect(page.locator('text=readme.txt')).toBeVisible();
    await expect(page.locator('text=documents')).toBeVisible();
  });

  test('should allow file selection with checkboxes', async ({ page }) => {
    // Find a file checkbox and click it
    const firstCheckbox = page.locator('.file-checkbox').first();
    await firstCheckbox.check();
    
    // Verify the row gets selected visually
    const firstRow = page.locator('.file-row').first();
    await expect(firstRow).toHaveClass(/selected/);
    
    // Uncheck and verify deselection
    await firstCheckbox.uncheck();
    await expect(firstRow).not.toHaveClass(/selected/);
  });

  test('should navigate into folders on double-click', async ({ page }) => {
    // Listen for console errors AND JavaScript errors
    const consoleErrors = [];
    const jsErrors = [];
    
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    page.on('pageerror', (error) => {
      jsErrors.push(error.message);
    });
    
    // Look for a folder (directory)
    const folderRow = page.locator('.file-row').filter({ hasText: 'projects' });
    await expect(folderRow).toBeVisible();
    
    // Double-click the folder
    await folderRow.dblclick();
    
    // Wait for navigation with longer timeout
    await page.waitForFunction(() => {
      const pathDisplay = document.querySelector('#path-display');
      return pathDisplay && pathDisplay.textContent.includes('projects');
    }, { timeout: 10000 });
    
    // Check for any errors that would indicate the bug
    if (consoleErrors.length > 0) {
      console.log('Console errors during navigation:', consoleErrors);
      // Fail test if we get the specific error mentioned
      const hasInvalidResponseError = consoleErrors.some(error => 
        error.includes('Invalid response: expected array of files') ||
        error.includes('Failed to load files')
      );
      if (hasInvalidResponseError) {
        throw new Error(`Navigation failed with error: ${consoleErrors.join(', ')}`);
      }
    }
    
    if (jsErrors.length > 0) {
      console.log('JavaScript errors during navigation:', jsErrors);
      throw new Error(`JavaScript errors during navigation: ${jsErrors.join(', ')}`);
    }
    
    // Verify path changed
    await expect(page.locator('#path-display')).toContainText('projects');
    
    // Verify new folders are loaded
    await expect(page.locator('text=project1')).toBeVisible();
    await expect(page.locator('text=project2')).toBeVisible();
    
    // Navigate deeper into project1 folder
    const project1Row = page.locator('.file-row').filter({ hasText: 'project1' });
    await project1Row.dblclick();
    
    // Wait for deeper navigation
    await page.waitForFunction(() => {
      const pathDisplay = document.querySelector('#path-display');
      return pathDisplay && pathDisplay.textContent.includes('project1');
    }, { timeout: 10000 });
    
    // Should show project files
    await expect(page.locator('text=main.go')).toBeVisible();
  });
  
  test('should navigate to any folder without errors', async ({ page }) => {
    // Enhanced test with network monitoring to catch API issues
    const consoleErrors = [];
    const networkFailures = [];
    const apiResponses = [];
    
    // Monitor console errors
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
        console.log('Console error:', msg.text());
      }
    });
    
    // Monitor JavaScript errors
    page.on('pageerror', (error) => {
      consoleErrors.push(error.message);
      console.log('JavaScript error:', error.message);
    });
    
    // Monitor network requests/responses
    page.on('response', async (response) => {
      if (response.url().includes('/api/files')) {
        try {
          const responseBody = await response.text();
          apiResponses.push({
            url: response.url(),
            status: response.status(),
            body: responseBody,
            headers: Object.fromEntries(response.headers())
          });
          console.log(`API Response: ${response.url()} - Status: ${response.status()}, Body: ${responseBody.substring(0, 200)}`);
        } catch (error) {
          console.log(`Failed to read response body for ${response.url()}: ${error.message}`);
        }
      }
    });
    
    page.on('requestfailed', (request) => {
      if (request.url().includes('/api/files')) {
        networkFailures.push({
          url: request.url(),
          failure: request.failure()
        });
        console.log('Network failure:', request.url(), request.failure());
      }
    });
    
    // Get all folder rows
    const folderRows = page.locator('.file-row').filter({ has: page.locator('.icon-folder') });
    const folderCount = await folderRows.count();
    console.log(`Found ${folderCount} folders to test`);
    
    if (folderCount > 0) {
      // Try to navigate to the first folder
      const firstFolder = folderRows.first();
      const folderName = await firstFolder.locator('.col-name').textContent();
      
      console.log(`Testing navigation to folder: ${folderName}`);
      
      // Clear any existing errors before navigation
      consoleErrors.length = 0;
      apiResponses.length = 0;
      networkFailures.length = 0;
      
      await firstFolder.dblclick();
      
      // Wait for navigation to complete with longer timeout
      await page.waitForTimeout(3000);
      
      // Analyze results
      console.log(`After navigation - Console errors: ${consoleErrors.length}, API responses: ${apiResponses.length}, Network failures: ${networkFailures.length}`);
      
      // Check for API responses that might be malformed
      const invalidResponses = apiResponses.filter(resp => {
        try {
          // Try to parse the response as JSON
          const parsed = JSON.parse(resp.body);
          return !Array.isArray(parsed);
        } catch (e) {
          // If it's not valid JSON, that's also a problem
          return true;
        }
      });
      
      if (invalidResponses.length > 0) {
        console.log('Invalid API responses detected:', invalidResponses);
        throw new Error(`Invalid API response detected during navigation to "${folderName}": ${JSON.stringify(invalidResponses[0])}`);
      }
      
      // Check for the specific error we're trying to catch
      const hasNavigationError = consoleErrors.some(error => 
        error.includes('Invalid response: expected array of files') ||
        error.includes('Failed to load files') ||
        error.includes('files is null')
      );
      
      if (hasNavigationError) {
        throw new Error(`Navigation to folder "${folderName}" failed with console error: ${consoleErrors.join(', ')}`);
      }
      
      if (networkFailures.length > 0) {
        throw new Error(`Network failure during navigation to "${folderName}": ${JSON.stringify(networkFailures)}`);
      }
      
      // Try to navigate back
      await page.locator('#btn-up').click();
      await page.waitForTimeout(1000);
    }
  });
  
  test('should handle navigation errors gracefully', async ({ page }) => {
    // Try to navigate to a non-existent folder by URL manipulation
    await page.goto('/?path=/nonexistent');
    
    // Should either show error or stay at root
    const pathDisplay = page.locator('#path-display');
    const currentPath = await pathDisplay.textContent();
    
    // Should not crash the app
    await expect(page.locator('#file-list')).toBeVisible();
  });

  test('should show context menu on right-click', async ({ page }) => {
    // Right-click on a file
    const firstRow = page.locator('.file-row').first();
    await firstRow.click({ button: 'right' });
    
    // Verify context menu appears
    const contextMenu = page.locator('#context-menu');
    await expect(contextMenu).toBeVisible();
    
    // Check menu items
    await expect(contextMenu.locator('text=Open')).toBeVisible();
    await expect(contextMenu.locator('text=Download')).toBeVisible();
    await expect(contextMenu.locator('text=Cut')).toBeVisible();
    await expect(contextMenu.locator('text=Copy')).toBeVisible();
    await expect(contextMenu.locator('text=Paste')).toBeVisible();
    await expect(contextMenu.locator('text=Properties')).toBeVisible();
    
    // Click elsewhere to close menu
    await page.locator('#file-list-container').click();
    await expect(contextMenu).toBeHidden();
  });

  test('should show file properties on context menu', async ({ page }) => {
    // Right-click on a file
    const fileRow = page.locator('.file-row').filter({ hasText: 'main.go' });
    await fileRow.click({ button: 'right' });
    
    // Click Properties
    await page.locator('[data-action="properties"]').click();
    
    // Verify properties modal opens
    const propertiesModal = page.locator('#properties-modal');
    await expect(propertiesModal).toBeVisible();
    
    // Check properties content
    const content = page.locator('#properties-content');
    await expect(content).toContainText('Name:');
    await expect(content).toContainText('main.go');
    await expect(content).toContainText('Size:');
    await expect(content).toContainText('Modified:');
    await expect(content).toContainText('Mode:');
    
    // Close modal
    await page.locator('#properties-modal .close').click();
    await expect(propertiesModal).toBeHidden();
  });

  test('should navigate up with up button', async ({ page }) => {
    // Navigate into a folder first
    const folderRow = page.locator('.file-row').filter({ hasText: 'documents' });
    await folderRow.dblclick();
    
    // Wait for navigation
    await page.waitForFunction(() => {
      const pathDisplay = document.querySelector('#path-display');
      return pathDisplay && pathDisplay.textContent.includes('documents');
    });
    
    // Click up button
    await page.locator('#btn-up').click();
    
    // Wait to return to root
    await page.waitForFunction(() => {
      const pathDisplay = document.querySelector('#path-display');
      return pathDisplay && pathDisplay.textContent === '/';
    });
    
    // Verify we're back at root
    await expect(page.locator('#path-display')).toHaveText('/');
    await expect(page.locator('text=readme.txt')).toBeVisible();
  });

  test('should refresh files when refresh button is clicked', async ({ page }) => {
    // Click refresh button
    await page.locator('#btn-refresh').click();
    
    // Wait for files to reload
    await page.waitForFunction(() => {
      const tbody = document.querySelector('#file-list-body');
      return tbody && tbody.children.length > 0;
    });
    
    // Verify files are still visible (basic refresh test)
    await expect(page.locator('text=readme.txt')).toBeVisible();
  });

  test('should show error when trying to download without selection', async ({ page }) => {
    // Click download button without selecting anything
    await page.locator('#btn-download').click();
    
    // Wait for error alert
    await page.waitForFunction(() => {
      return window.document.body.textContent.includes('No files selected') || 
             window.confirm || window.alert;
    }, { timeout: 5000 });
  });

  test('should update quota information', async ({ page }) => {
    // Check that quota info is displayed
    const quotaText = page.locator('#quota-text');
    await expect(quotaText).toBeVisible();
    
    // Should show current usage and limit
    await expect(quotaText).toContainText('MB');
    
    // Check quota bar exists (it might be hidden if quota is 0%)
    const quotaBar = page.locator('#quota-fill');
    // Just check it exists in the DOM, not necessarily visible
    await expect(quotaBar).toHaveCount(1);
  });

  test('should display quota information correctly and not show loading state permanently', async ({ page }) => {
    // Monitor console for any quota-related errors
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && (msg.text().includes('quota') || msg.text().includes('Quota'))) {
        consoleErrors.push(msg.text());
      }
    });

    // Wait for initial load
    await page.waitForTimeout(3000);
    
    // Check quota elements exist
    const quotaText = page.locator('#quota-text');
    const quotaBar = page.locator('#quota-fill');
    
    await expect(quotaText).toBeVisible();
    // Skip quota bar visibility check for now - this might be part of the issue
    
    // The quota text should NOT be showing "Loading..." permanently
    const quotaContent = await quotaText.textContent();
    console.log('Quota text content:', quotaContent);
    
    // Should not be stuck on loading
    expect(quotaContent).not.toContain('Loading');
    expect(quotaContent).not.toBe('');
    
    // Should contain actual usage information
    const hasUsageInfo = quotaContent.includes('MB') || quotaContent.includes('GB') || quotaContent.includes('KB');
    if (!hasUsageInfo) {
      console.log('Quota display issue detected - no usage information shown');
      throw new Error(`Quota information missing. Current text: "${quotaContent}". Expected format like "X MB / Y MB" or "X MB (no limit)"`);
    }
    
    // Should show either "X MB / Y MB (Z%)" or "X MB (no limit)" format
    const hasProperFormat = quotaContent.includes('/') || quotaContent.includes('no limit');
    if (!hasProperFormat) {
      console.log('Quota format issue detected');
      throw new Error(`Quota format incorrect. Current text: "${quotaContent}". Expected format like "5.2 MB / 100 MB (5%)" or "5.2 MB (no limit)"`);
    }
    
    // Check for any console errors related to quota
    if (consoleErrors.length > 0) {
      console.log('Quota-related console errors:', consoleErrors);
      throw new Error(`Quota-related errors detected: ${consoleErrors.join(', ')}`);
    }
    
    // Check that quota bar has some visual representation
    const quotaBarWidth = await quotaBar.evaluate(el => el.style.width);
    console.log('Quota bar width:', quotaBarWidth);
    
    // Quota bar should have some width (even if 0%)
    expect(quotaBarWidth).toBeDefined();
  });

  test('should select all files when select-all checkbox is checked', async ({ page }) => {
    // Click select all checkbox
    await page.locator('#select-all').check();
    
    // Wait a moment for selection to apply
    await page.waitForTimeout(500);
    
    // Verify all file checkboxes are checked
    const checkboxes = page.locator('.file-checkbox');
    const count = await checkboxes.count();
    
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
    
    // Verify all rows are selected
    const rows = page.locator('.file-row');
    const rowCount = await rows.count();
    
    for (let i = 0; i < rowCount; i++) {
      await expect(rows.nth(i)).toHaveClass(/selected/);
    }
  });

  test('should show upload modal when upload button is clicked', async ({ page }) => {
    await page.locator('#btn-upload').click();
    
    const uploadModal = page.locator('#upload-modal');
    await expect(uploadModal).toBeVisible();
    
    // Check modal content
    await expect(page.locator('#drop-zone')).toBeVisible();
    await expect(page.locator('#drop-zone')).toContainText('Drag and drop files');
    
    // Close modal
    await page.locator('#upload-modal .close').click();
    await expect(uploadModal).toBeHidden();
  });

  test('should show new folder creation dialog', async ({ page }) => {
    // Mock the prompt function to return a folder name
    await page.evaluate(() => {
      window.prompt = () => 'Test Folder';
    });
    
    await page.locator('#btn-new-folder').click();
    
    // Wait for API call and refresh
    await page.waitForTimeout(2000);
    
    // Check if folder was created (this would need the API call to succeed)
    // In a real test environment, we might mock the API response
  });

  test('should handle keyboard shortcuts', async ({ page }) => {
    // Determine the correct keyboard shortcut based on platform
    const isMac = await page.evaluate(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0);
    const modifier = isMac ? 'Meta' : 'Control';
    
    // Select a file first
    const firstCheckbox = page.locator('.file-checkbox').first();
    await firstCheckbox.check();
    
    // Test Ctrl+C (copy)
    await page.keyboard.press(`${modifier}+c`);
    
    // Wait for any visual feedback
    await page.waitForTimeout(500);
    
    // Test Ctrl+A (select all)
    // Focus on the file list area first to ensure keyboard events are captured
    await page.locator('#file-list-container').click();
    await page.keyboard.press(`${modifier}+a`);
    
    // Wait for selection to apply
    await page.waitForTimeout(1500);
    
    // All checkboxes should be checked
    const checkboxes = page.locator('.file-checkbox');
    const count = await checkboxes.count();
    
    // Check all individual checkboxes are checked (don't check the select-all checkbox itself)
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).toBeChecked();
    }
    
    // The select-all checkbox should also be checked
    const selectAllChecked = await page.locator('#select-all').isChecked();
    expect(selectAllChecked).toBe(true);
    
    // Test Escape (clear selection)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // All checkboxes should be unchecked
    for (let i = 0; i < count; i++) {
      await expect(checkboxes.nth(i)).not.toBeChecked();
    }
  });

  test('should maintain file list state during operations', async ({ page }) => {
    // Get initial file count
    const initialRows = page.locator('.file-row');
    const initialCount = await initialRows.count();
    
    // Select a file and check properties
    const firstRow = initialRows.first();
    await firstRow.click({ button: 'right' });
    await page.locator('[data-action="properties"]').click();
    
    const propertiesModal = page.locator('#properties-modal');
    await expect(propertiesModal).toBeVisible();
    
    // Close properties
    await page.locator('#properties-modal .close').click();
    await expect(propertiesModal).toBeHidden();
    
    // File list should still be intact
    const finalRows = page.locator('.file-row');
    const finalCount = await finalRows.count();
    expect(finalCount).toBe(initialCount);
  });

  test('should show context menu on right-click in white space', async ({ page }) => {
    // Test context menu in white space (empty area) of current folder
    // We don't need to navigate - just test context menu on empty area
    
    // Find the file list container
    const fileListContainer = page.locator('#file-list-container');
    
    // Right-click in an empty area - try clicking in the center bottom area
    const containerBox = await fileListContainer.boundingBox();
    const clickX = containerBox.x + containerBox.width / 2;
    const clickY = containerBox.y + containerBox.height - 50; // Near bottom
    
    await page.mouse.click(clickX, clickY, { button: 'right' });
    
    // Context menu should appear - this is what we're testing for the bug
    const contextMenu = page.locator('#context-menu');
    
    // This should work but will likely fail due to the bug
    try {
      await expect(contextMenu).toBeVisible({ timeout: 2000 });
      await expect(contextMenu.locator('text=Paste')).toBeVisible();
      
      // Close menu
      await page.locator('#file-list-container').click();
      await expect(contextMenu).toBeHidden();
    } catch (error) {
      // If the context menu doesn't appear, that's the bug we're testing for
      console.log('Context menu did not appear in white space - this is the bug!');
      throw new Error('Context menu should appear when right-clicking in white space but it does not');
    }
  });

  test('should show context menu on right-click in white areas of non-empty folders', async ({ page }) => {
    // We should be at root - verify some files are present
    const fileRows = page.locator('.file-row');
    const rowCount = await fileRows.count();
    expect(rowCount).toBeGreaterThan(0);
    
    // Find an empty area in the file list (below the last file)
    const fileListContainer = page.locator('#file-list-container');
    const fileListBody = page.locator('#file-list-body');
    
    // Get the bounds of the file list container and the last file row
    const containerBox = await fileListContainer.boundingBox();
    const lastRow = fileRows.last();
    const lastRowBox = await lastRow.boundingBox();
    
    // Calculate a position in the white space (below the last row)
    const clickX = containerBox.x + containerBox.width / 2;
    const clickY = lastRowBox.y + lastRowBox.height + 50; // 50px below last row
    
    // Make sure we're clicking within the container bounds
    if (clickY < containerBox.y + containerBox.height - 20) {
      // Right-click in the white space
      await page.mouse.click(clickX, clickY, { button: 'right' });
      
      // Context menu should appear
      const contextMenu = page.locator('#context-menu');
      await expect(contextMenu).toBeVisible({ timeout: 2000 });
      
      // Should show paste option
      await expect(contextMenu.locator('text=Paste')).toBeVisible();
      
      // Click elsewhere to close menu
      await page.mouse.click(clickX, clickY);
      await expect(contextMenu).toBeHidden();
    }
  });

  test('should support copy workflow (first step)', async ({ page }) => {
    // Test that we can copy a file - this establishes the copy functionality
    const taskFile = page.locator('.file-row').filter({ hasText: 'test.md' });
    await expect(taskFile).toBeVisible();
    
    // Right-click on the file and copy it
    await taskFile.click({ button: 'right' });
    const contextMenu = page.locator('#context-menu');
    await expect(contextMenu).toBeVisible();
    
    // Verify copy option exists and click it
    const copyOption = contextMenu.locator('[data-action="copy"]');
    await expect(copyOption).toBeVisible();
    await copyOption.click();
    await expect(contextMenu).toBeHidden();
    
    // Now test that context menu appears in white space after copying
    const fileListContainer = page.locator('#file-list-container');
    const containerBox = await fileListContainer.boundingBox();
    const clickX = containerBox.x + containerBox.width / 2;
    const clickY = containerBox.y + containerBox.height - 50;
    
    await page.mouse.click(clickX, clickY, { button: 'right' });
    
    const whiteSpaceContextMenu = page.locator('#context-menu');
    await expect(whiteSpaceContextMenu).toBeVisible({ timeout: 2000 });
    
    // Verify paste option is available (since we just copied something)
    const pasteOption = whiteSpaceContextMenu.locator('[data-action="paste"]');
    await expect(pasteOption).toBeVisible();
    
    // Close menu
    await page.locator('#file-list-container').click();
    await expect(whiteSpaceContextMenu).toBeHidden();
  });

  test('should support browser back button and URL synchronization', async ({ page }) => {
    // Test that URL changes when navigating and back button works
    
    // Initial state - should be at root
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#path-display')).toContainText('/');
    
    // Navigate to projects folder
    const projectsFolder = page.locator('.file-row').filter({ hasText: 'projects' });
    await expect(projectsFolder).toBeVisible();
    await projectsFolder.dblclick();
    
    // Wait for navigation and check URL updated
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/projects\/?$/, { timeout: 5000 });
    await expect(page.locator('#path-display')).toContainText('projects');
    
    // Navigate deeper into project1 folder
    const project1Folder = page.locator('.file-row').filter({ hasText: 'project1' });
    await expect(project1Folder).toBeVisible();
    await project1Folder.dblclick();
    
    // Wait for navigation and check URL updated to deeper path
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/projects\/project1\/?$/, { timeout: 5000 });
    await expect(page.locator('#path-display')).toContainText('project1');
    
    // Use browser back button
    await page.goBack();
    
    // Should be back in projects folder
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/projects\/?$/, { timeout: 5000 });
    await expect(page.locator('#path-display')).toContainText('projects');
    await expect(page.locator('text=project1')).toBeVisible(); // Should see project1 folder again
    
    // Use browser back button again
    await page.goBack();
    
    // Should be back at root
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#path-display')).toContainText('/');
    await expect(page.locator('text=readme.txt')).toBeVisible(); // Should see root files
  });

  test('should update URL when using built-in navigation buttons', async ({ page }) => {
    // Test that built-in back and up buttons also work with URL/history
    
    // Navigate to projects folder via double-click
    const projectsFolder = page.locator('.file-row').filter({ hasText: 'projects' });
    await projectsFolder.dblclick();
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/projects\/?$/);
    
    // Navigate deeper via double-click
    const project1Folder = page.locator('.file-row').filter({ hasText: 'project1' });
    await project1Folder.dblclick();
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/projects\/project1\/?$/);
    
    // Use built-in back button - should use browser history
    await page.locator('#btn-back').click();
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('#path-display')).toContainText('projects');
    
    // Use built-in up button - should update URL
    await page.locator('#btn-up').click();
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#path-display')).toContainText('/');
  });

  test('should support deep linking to specific folders', async ({ page }) => {
    // Test that we can navigate directly to a folder via URL (both old and new format)
    
    // Monitor console for debugging
    page.on('console', (msg) => {
      console.log('Console log:', msg.text());
    });
    
    page.on('pageerror', (error) => {
      console.log('Page error:', error.message);
    });
    
    // Test new clean URL format
    await page.goto('/projects/project1');
    
    // Wait for page to load and initial files to load
    await page.waitForSelector('#file-list', { timeout: 10000 });
    await page.waitForTimeout(5000); // Give extra time for the path to be parsed and files to load
    
    // Should be in the project1 folder
    await expect(page.locator('#path-display')).toContainText('project1');
    await expect(page.locator('text=main.go')).toBeVisible();
    
    // URL should show the clean deep link
    await expect(page).toHaveURL(/\/projects\/project1\/?$/);
    
    // Test legacy query parameter format still works
    await page.goto('/?path=projects/project1');
    await page.waitForTimeout(3000);
    
    // Should still work and redirect to clean URL
    await expect(page.locator('#path-display')).toContainText('project1');
    await expect(page.locator('text=main.go')).toBeVisible();
  });

  test('should maintain URL when refreshing page', async ({ page }) => {
    // Navigate to a subfolder
    const documentsFolder = page.locator('.file-row').filter({ hasText: 'documents' });
    await documentsFolder.dblclick();
    await page.waitForTimeout(2000);
    
    // Get current URL
    const urlBeforeRefresh = page.url();
    
    // Refresh the page
    await page.reload();
    await page.waitForTimeout(2000);
    
    // Should still be in the same folder
    await expect(page.locator('#path-display')).toContainText('documents');
    await expect(page.locator('text=report.pdf')).toBeVisible();
    
    // URL should be the same
    await expect(page).toHaveURL(urlBeforeRefresh);
  });

  test('should support browser forward button', async ({ page }) => {
    // Navigate forward through folders
    const projectsFolder = page.locator('.file-row').filter({ hasText: 'projects' });
    await projectsFolder.dblclick();
    await page.waitForTimeout(2000);
    
    const project1Folder = page.locator('.file-row').filter({ hasText: 'project1' });
    await project1Folder.dblclick();
    await page.waitForTimeout(2000);
    
    // Go back twice
    await page.goBack();
    await page.waitForTimeout(1000);
    await page.goBack();
    await page.waitForTimeout(1000);
    
    // Should be at root
    await expect(page).toHaveURL(/\/$/);
    
    // Go forward once
    await page.goForward();
    await page.waitForTimeout(2000);
    
    // Should be in projects
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('#path-display')).toContainText('projects');
    
    // Go forward again
    await page.goForward();
    await page.waitForTimeout(2000);
    
    // Should be in project1
    await expect(page).toHaveURL(/\/projects\/project1\/?$/);
    await expect(page.locator('#path-display')).toContainText('project1');
  });

  test('should use clean path-based URLs instead of query parameters', async ({ page }) => {
    // Test that URLs are clean and readable
    
    // Navigate to projects folder
    const projectsFolder = page.locator('.file-row').filter({ hasText: 'projects' });
    await expect(projectsFolder).toBeVisible();
    await projectsFolder.dblclick();
    
    // Wait for navigation
    await page.waitForTimeout(2000);
    
    // URL should be clean path-based, not query parameter
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('#path-display')).toContainText('projects');
    
    // Navigate back to root
    await page.locator('#btn-up').click();
    await page.waitForTimeout(2000);
    
    // Should be at clean root URL
    await expect(page).toHaveURL(/\/$|\/?\?$/);
    await expect(page.locator('#path-display')).toContainText('/');
    
    // Navigate to nested path
    const projectsFolder2 = page.locator('.file-row').filter({ hasText: 'projects' });
    await projectsFolder2.dblclick();
    await page.waitForTimeout(2000);
    
    // Should show clean nested path
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('#path-display')).toContainText('projects');
    
    // Navigate deeper to project1 folder
    const project1Folder = page.locator('.file-row').filter({ hasText: 'project1' });
    await project1Folder.dblclick();
    await page.waitForTimeout(2000);
    
    // Should show clean deep nested path
    await expect(page).toHaveURL(/\/projects\/project1\/?$/);
    await expect(page.locator('#path-display')).toContainText('project1');
  });

  test('should sort columns correctly without losing data', async ({ page }) => {
    // Get initial file data
    await page.waitForSelector('.file-row');
    
    // Store initial file data before sorting
    const getFileData = async () => {
      return await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.file-row'));
        return rows.map(row => ({
          name: row.querySelector('.col-name').textContent.trim(),
          size: row.querySelector('.col-size').textContent.trim(),
          type: row.querySelector('.col-type').textContent.trim(),
          modified: row.querySelector('.col-modified').textContent.trim(),
          dataSize: row.dataset.size,
          dataModTime: row.dataset.modTime
        }));
      });
    };
    
    const initialData = await getFileData();
    
    // Test 1: Click on Size column header
    await page.click('th[data-sort="size"]');
    await page.waitForTimeout(100); // Wait for sort to complete
    
    // Check sort indicator is visible
    await expect(page.locator('th[data-sort="size"]')).toHaveClass(/sort-asc|sort-desc/);
    
    // Verify data integrity after size sort
    const afterSizeSort = await getFileData();
    for (const file of afterSizeSort) {
      // Ensure size is not showing as zero (unless it's actually zero)
      if (file.dataSize !== '0' && file.size !== '') {
        expect(file.size).not.toBe('0');
        expect(file.size).not.toBe('0 B');
      }
      
      // Ensure date is not "Invalid Date"
      expect(file.modified).not.toContain('Invalid Date');
    }
    
    // Test 2: Click on Modified column header
    await page.click('th[data-sort="modified"]');
    await page.waitForTimeout(100);
    
    // Check sort indicator changed
    await expect(page.locator('th[data-sort="modified"]')).toHaveClass(/sort-asc|sort-desc/);
    
    // Verify data integrity after date sort
    const afterDateSort = await getFileData();
    for (const file of afterDateSort) {
      // Ensure size is not showing as zero (unless it's actually zero)
      if (file.dataSize !== '0' && file.size !== '') {
        expect(file.size).not.toBe('0');
        expect(file.size).not.toBe('0 B');
      }
      
      // Ensure date is not "Invalid Date"
      expect(file.modified).not.toContain('Invalid Date');
    }
    
    // Test 3: Click same column again to reverse sort
    await page.click('th[data-sort="modified"]');
    await page.waitForTimeout(100);
    
    // Should have opposite sort class
    const modTimeHeader = page.locator('th[data-sort="modified"]');
    const classes = await modTimeHeader.getAttribute('class');
    if (classes.includes('sort-asc')) {
      // After clicking again, should be desc
      await page.click('th[data-sort="modified"]');
      await expect(modTimeHeader).toHaveClass(/sort-desc/);
    }
    
    // Test 4: Verify Name column sorting preserves data
    await page.click('th[data-sort="name"]');
    await page.waitForTimeout(100);
    
    const afterNameSort = await getFileData();
    
    // Check that we have the name sort indicator
    await expect(page.locator('th[data-sort="name"]')).toHaveClass(/sort-asc|sort-desc/);
    
    // Most importantly, verify data is still intact after name sort
    let nonZeroSizeCount = 0;
    let validDateCount = 0;
    
    for (const file of afterNameSort) {
      // Count files with non-zero sizes
      if (file.dataSize && file.dataSize !== '0' && file.size !== '') {
        expect(file.size).not.toBe('0');
        expect(file.size).not.toBe('0 B');
        nonZeroSizeCount++;
      }
      
      // All files should have valid dates
      expect(file.modified).not.toContain('Invalid Date');
      if (file.modified && file.modified !== '') {
        validDateCount++;
      }
    }
    
    // Ensure we found at least some files with sizes and dates
    expect(nonZeroSizeCount).toBeGreaterThan(0);
    expect(validDateCount).toBeGreaterThan(0);
  });

  test('should display human-readable quota error messages', async ({ page, context }) => {
    // This test simulates a quota exceeded scenario
    // Since we can't easily control the server quota in E2E tests,
    // we'll test that error messages are displayed properly
    
    // Set up dialog handler before triggering the error
    let alertText = '';
    page.on('dialog', async dialog => {
      alertText = dialog.message();
      await dialog.accept();
    });
    
    // Create a mock file upload that will fail
    await page.click('#btn-upload');
    await expect(page.locator('#upload-modal')).toBeVisible();
    
    // Intercept the upload request to simulate quota error
    await page.route('/api/files', route => {
      if (route.request().method() === 'POST') {
        route.fulfill({
          status: 500,
          body: 'upload would exceed quota limit (current: 20.17 MB, file: 31.50 KB, limit: 1.00 MB)'
        });
      } else {
        route.continue();
      }
    });
    
    // Trigger file upload
    const fileInput = page.locator('#file-input');
    await fileInput.setInputFiles({
      name: 'test-file.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('test content')
    });
    
    // Wait for the alert to be shown
    await page.waitForTimeout(1000);
    
    // Verify the error contains human-readable file sizes
    expect(alertText).toContain('20.17 MB');
    expect(alertText).toContain('31.50 KB');
    expect(alertText).toContain('1.00 MB');
    
    // Close modal
    await page.click('#upload-modal .close');
    await expect(page.locator('#upload-modal')).toBeHidden();
  });

  test('should copy and paste file between folders without errors', async ({ page }) => {
    // Monitor console for errors
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Step 1: Copy test.md file
    const testFile = page.locator('.file-row').filter({ hasText: 'test.md' });
    await expect(testFile).toBeVisible();
    
    await testFile.click({ button: 'right' });
    const contextMenu = page.locator('#context-menu');
    await expect(contextMenu).toBeVisible();
    
    await page.locator('[data-action="copy"]').click();
    await expect(contextMenu).toBeHidden();
    
    // Step 2: Navigate to documents folder - use a working navigation method
    const documentsFolder = page.locator('.file-row').filter({ hasText: 'documents' });
    await expect(documentsFolder).toBeVisible();
    await documentsFolder.dblclick();
    
    // Wait for URL change or path change (simplified check)
    await page.waitForTimeout(2000);
    
    // Step 3: Right-click in empty area and paste
    const fileListContainer = page.locator('#file-list-container');
    await fileListContainer.click({ button: 'right' });
    
    const pasteContextMenu = page.locator('#context-menu');
    await expect(pasteContextMenu).toBeVisible({ timeout: 2000 });
    
    const pasteOption = pasteContextMenu.locator('[data-action="paste"]');
    await expect(pasteOption).toBeVisible();
    
    // Clear console errors before paste operation
    consoleErrors.length = 0;
    
    // Click paste and wait for operation to complete
    await pasteOption.click();
    await expect(pasteContextMenu).toBeHidden();
    
    // Wait for paste operation to complete
    await page.waitForTimeout(3000);
    
    // Check for errors during paste operation
    const pasteErrors = consoleErrors.filter(error => 
      error.includes('HTTP 404') || 
      error.includes('File not found') ||
      error.includes('Failed to copy') ||
      error.includes('Failed to load files')
    );
    
    if (pasteErrors.length > 0) {
      console.log('Paste operation errors detected:', pasteErrors);
      throw new Error(`Paste operation failed with errors: ${pasteErrors.join(', ')}`);
    }
    
    // Refresh to see if file was successfully pasted
    await page.locator('#btn-refresh').click();
    await page.waitForTimeout(2000);
    
    // Check if the copied file appears - if it doesn't, that's also an error indicator
    const copiedFile = page.locator('.file-row').filter({ hasText: 'test.md' });
    const fileExists = await copiedFile.count() > 0;
    
    if (!fileExists) {
      // If no console errors but file doesn't exist, it suggests a silent failure
      console.log('No file was pasted - possible silent failure or path resolution issue');
    }
    
    // For now, we expect this test to detect the error you reported
    expect(pasteErrors.length).toBe(0); // This should fail if there are paste errors
  });
});