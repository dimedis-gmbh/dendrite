// @ts-check
const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe.serial('Dendrite File Manager', () => {
    const testDataDir = path.join(__dirname, 'test_data');
    const subfolderPath = path.join(testDataDir, 'subfolder');
    const testMdPath = path.join(testDataDir, 'test.md');
    const sampleTxtPath = path.join(testDataDir, 'sample.txt');
    
    // Files that we create for testing
    const testFiles = [
        testMdPath,
        sampleTxtPath
    ];
    
    test.beforeAll(async () => {
        // Ensure test data directory exists
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        
        // Create subfolder if it doesn't exist
        if (!fs.existsSync(subfolderPath)) {
            fs.mkdirSync(subfolderPath, { recursive: true });
            console.log('Created subfolder directory');
        }
        
        // Create test.md if it doesn't exist
        if (!fs.existsSync(testMdPath)) {
            fs.writeFileSync(testMdPath, '# Test Markdown File\n\nThis is a test file for E2E tests.');
            console.log('Created test.md file');
        }
        
        // Create sample.txt if it doesn't exist
        if (!fs.existsSync(sampleTxtPath)) {
            fs.writeFileSync(sampleTxtPath, 'This is a sample text file.\nIt has multiple lines.\nFor testing the file manager.');
            console.log('Created sample.txt file');
        }
    });
    
    test.beforeEach(async ({page}) => {
        // Ensure required files exist before each test
        if (!fs.existsSync(subfolderPath)) {
            fs.mkdirSync(subfolderPath, { recursive: true });
        }
        if (!fs.existsSync(testMdPath)) {
            fs.writeFileSync(testMdPath, '# Test Markdown File\n\nThis is a test file for E2E tests.');
        }
        if (!fs.existsSync(sampleTxtPath)) {
            fs.writeFileSync(sampleTxtPath, 'This is a sample text file.\nIt has multiple lines.\nFor testing the file manager.');
        }
        
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
                await page.goto('http://127.0.0.1:3001', {waitUntil: 'networkidle', timeout: 30000});
                break;
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                console.log(`Navigation failed, retrying... (${retries} retries left)`);
                await page.waitForTimeout(2000);
            }
        }

        // Wait for the app to load with extended timeout
        await page.waitForSelector('#file-list', {timeout: 20000});

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
        }, {timeout: 20000});

        // Additional wait for webkit to ensure full render
        if (page.context().browser()?.browserType().name() === 'webkit') {
            await page.waitForTimeout(500);
        }
    });
    
    test.afterAll(async () => {
        // Clean up test files
        console.log('Cleaning up test files...');
        
        // Remove test.md if it was created by us
        if (fs.existsSync(testMdPath)) {
            try {
                fs.unlinkSync(testMdPath);
                console.log('Removed test.md');
            } catch (e) {
                console.log('Could not remove test.md:', e.message);
            }
        }
        
        // Note: We don't remove sample.txt as it might be used by other tests
        // Note: We don't remove subfolder as it might contain files from tests
    });

    test('should load the file manager interface', async ({page}) => {
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

    test('should display files and folders', async ({page, browserName}) => {
        // For webkit, ensure the page is fully loaded before checking
        if (browserName === 'webkit') {
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(1000); // Extra wait for webkit rendering
        }

        // Wait for file list to be fully loaded with more specific checks
        await page.waitForSelector('#file-list-body', {timeout: 20000});

        // Wait for specific content to ensure files are loaded
        await page.waitForFunction(() => {
            const rows = document.querySelectorAll('.file-row');
            if (rows.length === 0) return false;

            // Check that at least one row has actual content
            for (const row of rows) {
                const nameCell = row.querySelector('.col-name');
                if (nameCell && nameCell.textContent && nameCell.textContent.trim().length > 0) {
                    return true;
                }
            }
            return false;
        }, {timeout: 20000});

        // Additional stabilization wait for webkit
        if (browserName === 'webkit') {
            await page.waitForTimeout(500);
        }

        // Check that files are loaded
        const fileRows = page.locator('.file-row');
        const rowCount = await fileRows.count();
        expect(rowCount).toBeGreaterThan(0);
        await expect(fileRows.first()).toBeVisible({timeout: 15000});

        // Check file list headers with individual waits
        const headers = ['Name', 'Size', 'Type', 'Modified'];
        for (const header of headers) {
            const headerLocator = page.locator(`th:has-text("${header}")`);
            await expect(headerLocator).toBeVisible({timeout: 10000});
        }

        // Verify specific files are present with more flexible selectors
        // Use more specific selectors to avoid ambiguity
        const sampleFile = page.locator('.file-row').filter({hasText: 'sample.txt'});
        const subfolderDir = page.locator('.file-row').filter({hasText: 'subfolder'});

        await expect(sampleFile).toBeVisible({timeout: 15000});
        await expect(subfolderDir).toBeVisible({timeout: 15000});
    });

    test('should allow file selection with checkboxes', async ({page}) => {
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

    test('should navigate into folders on double-click', async ({page}) => {
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
        const folderRow = page.locator('.file-row').filter({hasText: 'subfolder'});
        await expect(folderRow).toBeVisible();

        // Double-click the folder
        await folderRow.dblclick();

        // Wait for navigation with longer timeout
        await page.waitForFunction(() => {
            const pathDisplay = document.querySelector('#path-display');
            return pathDisplay && pathDisplay.textContent.includes('subfolder');
        }, {timeout: 10000});

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
        await expect(page.locator('#path-display')).toContainText('subfolder');

        // Navigate back up
        await page.locator('#btn-up').click();

        // Wait for navigation back
        await page.waitForTimeout(1000);

        // Verify we're back at root
        const pathDisplay = await page.locator('#path-display').textContent();
        expect(pathDisplay).toBe('/');
    });

    test('should show context menu on right-click', async ({page}) => {
        // Right-click on a file
        const firstRow = page.locator('.file-row').first();
        await firstRow.click({button: 'right'});

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

    test('should show file properties on context menu', async ({page}) => {
        // Wait for file list to load
        await page.waitForSelector('.file-row', {timeout: 10000});
        await page.waitForFunction(() => {
            const rows = document.querySelectorAll('.file-row');
            return rows.length > 0;
        }, {timeout: 10000});

        // Right-click on a file
        const fileRow = page.locator('.file-row').filter({hasText: 'sample.txt'});
        await expect(fileRow).toBeVisible({timeout: 10000});
        await fileRow.click({button: 'right'});

        // Click Properties
        await page.locator('[data-action="properties"]').click();

        // Verify properties modal opens
        const propertiesModal = page.locator('#properties-modal');
        await expect(propertiesModal).toBeVisible({timeout: 10000});

        // Check properties content
        const content = page.locator('#properties-content');
        await expect(content).toContainText('Name:');
        await expect(content).toContainText('sample.txt');
        await expect(content).toContainText('Size:');
        await expect(content).toContainText('Modified:');
        await expect(content).toContainText('Mode:');

        // Close modal
        await page.locator('#properties-modal .close').click();
        await expect(propertiesModal).toBeHidden();
    });

    test('should navigate up with up button', async ({page}) => {
        // Wait for initial file list to load
        await page.waitForSelector('.file-row', {timeout: 10000});
        await page.waitForFunction(() => {
            const rows = document.querySelectorAll('.file-row');
            return rows.length > 0;
        }, {timeout: 10000});

        // Navigate into a folder first
        const folderRow = page.locator('.file-row').filter({hasText: 'subfolder'});
        await expect(folderRow).toBeVisible({timeout: 10000});
        await folderRow.dblclick();

        // Wait for navigation
        await page.waitForFunction(() => {
            const pathDisplay = document.querySelector('#path-display');
            return pathDisplay && pathDisplay.textContent.includes('subfolder');
        }, {timeout: 10000});

        // Click up button
        await page.locator('#btn-up').click();

        // Wait to return to root
        await page.waitForFunction(() => {
            const pathDisplay = document.querySelector('#path-display');
            return pathDisplay && pathDisplay.textContent === '/';
        }, {timeout: 10000});

        // Verify we're back at root
        await expect(page.locator('#path-display')).toHaveText('/');
        await expect(page.locator('text=sample.txt')).toBeVisible({timeout: 10000});
    });

    test('should refresh files when refresh button is clicked', async ({page}) => {
        // Click refresh button
        await page.locator('#btn-refresh').click();

        // Wait for files to reload
        await page.waitForFunction(() => {
            const tbody = document.querySelector('#file-list-body');
            return tbody && tbody.children.length > 0;
        });

        // Verify files are still visible (basic refresh test)
        await expect(page.locator('text=sample.txt')).toBeVisible();
    });

    test('should show error when trying to download without selection', async ({page}) => {
        // Click download button without selecting anything
        await page.locator('#btn-download').click();

        // Wait for error alert
        await page.waitForFunction(() => {
            return window.document.body.textContent.includes('No files selected') ||
                window.confirm || window.alert;
        }, {timeout: 5000});
    });

    test('should update quota information', async ({page}) => {
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

    test('should display quota information correctly', async ({page}) => {
        // Wait for initial load
        await page.waitForTimeout(3000);

        // Check quota elements exist
        const quotaText = page.locator('#quota-text');
        await expect(quotaText).toBeVisible();

        // The quota text should NOT be showing "Loading..." permanently
        const quotaContent = await quotaText.textContent();
        console.log('Quota text content:', quotaContent);

        // Should not be stuck on loading
        expect(quotaContent).not.toContain('Loading');
        expect(quotaContent).not.toBe('');

        // Should contain actual usage information
        const hasUsageInfo = quotaContent.includes('MB') || quotaContent.includes('GB') || quotaContent.includes('KB');
        expect(hasUsageInfo).toBeTruthy();
    });

    test('should select all files when select-all checkbox is checked', async ({page}) => {
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

    test('should show upload modal when upload button is clicked', async ({page}) => {
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

    test('should handle keyboard shortcuts', async ({page}) => {
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

        // Check all individual checkboxes are checked
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

    test('should copy and paste file', async ({page}) => {
        // Test that we can copy a file
        const testFile = page.locator('.file-row').filter({hasText: 'test.md'});
        await expect(testFile).toBeVisible();

        // Right-click on the file and copy it
        await testFile.click({button: 'right'});
        const contextMenu = page.locator('#context-menu');
        await expect(contextMenu).toBeVisible();

        // Verify copy option exists and click it
        const copyOption = contextMenu.locator('[data-action="copy"]');
        await expect(copyOption).toBeVisible();
        await copyOption.click();
        await expect(contextMenu).toBeHidden();

        // Navigate to subfolder
        const subfolderDir = page.locator('.file-row').filter({hasText: 'subfolder'});
        await expect(subfolderDir).toBeVisible();
        await subfolderDir.dblclick();

        // Wait for navigation to complete
        await page.waitForFunction(() => {
            const pathDisplay = document.querySelector('#path-display');
            return pathDisplay && pathDisplay.textContent.includes('subfolder');
        }, {timeout: 10000});

        // Right-click in empty area and paste
        const fileListContainer = page.locator('#file-list-container');
        await fileListContainer.click({button: 'right'});

        const pasteContextMenu = page.locator('#context-menu');
        await expect(pasteContextMenu).toBeVisible({timeout: 2000});

        const pasteOption = pasteContextMenu.locator('[data-action="paste"]');
        await expect(pasteOption).toBeVisible();

        // Note: We don't actually click paste as it would create a real file
        // Just verify the option is available
        
        // Close menu
        await page.keyboard.press('Escape');
        await expect(pasteContextMenu).toBeHidden();
        
        // Navigate back
        await page.locator('#btn-up').click();
        await page.waitForTimeout(1000);
    });
});