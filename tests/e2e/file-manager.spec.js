// @ts-check
const {test, expect} = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SAMPLE_EXIF_JPEG_BASE64 = '/9j/4QGPRXhpZgAATU0AKgAAAAgACQEPAAIAAAAMAAAAegEQAAIAAAAHAAAAhgEaAAUAAAABAAAAjQEbAAUAAAABAAAAlQEoAAMAAAABAAIAAAExAAIAAAAHAAAAnQE7AAIAAAAHAAAApIdpAAQAAAABAAAAq4glAAQAAAABAAABJQAAAABEZW5kcml0ZUNhbQBNb2RlbFgAAAABLAAAAAEAAAEsAAAAAXBpZXhpZgBUZXN0ZXIAAAeCmgAFAAAAAQAAAQGCnQAFAAAAAQAAAQmIJwADAAAAAQDIAACQAwACAAAAFAAAARGgAQADAAAAAQABAACgAgAEAAAAAQAAAAOgAwAEAAAAAQAAAAIAAAABAAAAfQAAABwAAAAKMjAyNToxMDowOCAyMDo0MDowMAAABAABAAIAAAACTgAAAAACAAUAAAADAAABVwADAAIAAAACRQAAAAAEAAUAAAADAAABbwAAACgAAAABAAAAAAAAAAEAAAAAAAAAAQAAAEoAAAABAAAAAAAAAAEAAAAAAAAAAf/bAEMAAwICAwICAwMDAwQDAwQFCAUFBAQFCgcHBggMCgwMCwoLCw0OEhANDhEOCwsQFhARExQVFRUMDxcYFhQYEhQVFP/bAEMBAwQEBQQFCQUFCRQNCw0UFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFP/AABEIAAIAAwMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAAAAQIDBAUGBwgJCgv/xAC1EAACAQMDAgQDBQUEBAAAAX0BAgMABBEFEiExQQYTUWEHInEUMoGRoQgjQrHBFVLR8CQzYnKCCQoWFxgZGiUmJygpKjQ1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4eLj5OXm5+jp6vHy8/T19vf4+fr/xAAfAQADAQEBAQEBAQEBAAAAAAAAAQIDBAUGBwgJCgv/xAC1EQACAQIEBAMEBwUEBAABAncAAQIDEQQFITEGEkFRB2FxEyIygQgUQpGhscEJIzNS8BVictEKFiQ04SXxFxgZGiYnKCkqNTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqCg4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2dri4+Tl5ufo6ery8/T19vf4+fr/2gAMAwEAAhEDEQA/APW6KKK/Aj8vP//Z';

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
        await expect(page.locator('#path-display')).toBeVisible();
        await expect(page.locator('#file-list-container')).toBeVisible();
        await expect(page.locator('#file-list')).toBeVisible();

        // Check quota info is displayed
        await expect(page.locator('#quota-text')).toContainText('MB');

        // Check toolbar buttons
        await expect(page.locator('#btn-up')).toBeVisible();
        await expect(page.locator('#btn-refresh')).toBeVisible();
        await expect(page.locator('#btn-download')).toBeVisible();
        await expect(page.locator('#btn-download-zip')).toBeVisible();
        await expect(page.locator('#btn-upload')).toBeVisible();
        await expect(page.locator('#btn-new-folder')).toBeVisible();
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
        await expect(contextMenu.locator('[data-action="open"]')).toBeVisible();
        await expect(contextMenu.locator('[data-action="download"]')).toBeVisible();
        await expect(contextMenu.locator('[data-action="cut"]')).toBeVisible();
        await expect(contextMenu.locator('[data-action="copy"]')).toBeVisible();
        await expect(contextMenu.locator('[data-action="paste"]')).toBeVisible();
        await expect(contextMenu.locator('[data-action="properties"]')).toBeVisible();

        // Click elsewhere to close menu
        await page.locator('#file-list-container').click();
        await expect(contextMenu).toBeHidden();
    });

    test('should show file properties on context menu', async ({page}) => {
        const imageFileName = `image-properties-${Date.now()}.jpg`;
        const imageFilePath = path.join(testDataDir, imageFileName);

        try {
            fs.writeFileSync(imageFilePath, Buffer.from(SAMPLE_EXIF_JPEG_BASE64, 'base64'));

            await page.reload();
            await page.waitForSelector('.file-row', {timeout: 10000});
            await page.waitForFunction(() => {
                const rows = document.querySelectorAll('.file-row');
                return rows.length > 0;
            }, {timeout: 10000});

            const imageRow = page.locator('.file-row').filter({hasText: imageFileName}).first();
            await expect(imageRow).toBeVisible({timeout: 10000});
            await imageRow.click({button: 'right'});

            await page.locator('[data-action="properties"]').click();

            const propertiesModal = page.locator('#properties-modal');
            await expect(propertiesModal).toBeVisible({timeout: 10000});

            const content = propertiesModal.locator('#properties-content');
            const rows = content.locator('tr');
            const valueCell = (label) => rows.filter({ hasText: label }).locator('td').nth(1);

            await expect(valueCell('Name:')).toHaveText(imageFileName);
            await expect(valueCell('MIME Type:')).toHaveText('image/jpeg');
            await expect(valueCell('Dimensions:')).toHaveText('3 × 2 px');
            await expect(valueCell('Color depth:')).toHaveText('8-bit');
            await expect(valueCell('Color type:')).toHaveText('YCbCr');
            await expect(valueCell('Color space:')).toHaveText('sRGB');
            await expect(valueCell('Resolution:')).toContainText('300.00 DPI');

            await page.locator('#properties-modal .close').click();
            await expect(propertiesModal).toBeHidden();

            await imageRow.click({button: 'right'});
            const exifItem = page.locator('[data-action="exif"]');
            await expect(exifItem).toBeVisible();
            await exifItem.click();

            const exifModal = page.locator('#exif-modal');
            await expect(exifModal).toBeVisible({ timeout: 10000 });
            const exifContent = exifModal.locator('#exif-content');
            await expect(exifContent).toContainText('Make');
            await expect(exifContent).toContainText('DendriteCam');
            await expect(exifContent).toContainText('ModelX');

            await page.locator('#exif-modal .close').click();
            await expect(exifModal).toBeHidden();
        } finally {
            if (fs.existsSync(imageFilePath)) {
                fs.unlinkSync(imageFilePath);
            }
            await page.reload();
        }
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

    test('should keep download action disabled when nothing is selected', async ({page}) => {
        const downloadButton = page.locator('#btn-download');
        await expect(downloadButton).toBeDisabled();

        // Force-click should not trigger an error modal
        await downloadButton.click({ force: true });
        await expect(page.locator('#error-modal')).toHaveClass(/hidden/);
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
        const dropZone = page.locator('#drop-zone');
        await expect(dropZone).toBeVisible();
        await expect(dropZone).toContainText('Upload files');
        await expect(dropZone).toContainText('or drag and drop');

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

        const copiedFilePath = path.join(subfolderPath, 'test.md');
        if (fs.existsSync(copiedFilePath)) {
            fs.unlinkSync(copiedFilePath);
        }

        // Right-click on the file and copy it
        await testFile.click({button: 'right'});
        const contextMenu = page.locator('#context-menu');
        await expect(contextMenu).toBeVisible();

        // Verify copy option exists and click it
        const copyOption = contextMenu.locator('[data-action="copy"]');
        await expect(copyOption).toBeVisible();
        await copyOption.click();
        await expect(contextMenu).toBeHidden();

        const pasteButton = page.locator('#btn-paste');
        await expect(pasteButton).toBeEnabled();

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
        await pasteOption.click();
        await expect(pasteContextMenu).toBeHidden();

        const copiedRow = page.locator('.file-row').filter({hasText: 'test.md'});
        await expect(copiedRow).toBeVisible({ timeout: 10000 });

        await page.evaluate(() => window.clipboard.clear());
        await expect(pasteButton).toBeDisabled();

        if (fs.existsSync(copiedFilePath)) {
            fs.unlinkSync(copiedFilePath);
        }

        await page.reload();
        await page.locator('#btn-up').click();
        await page.waitForTimeout(1000);
    });

    test('should paste file into folder via folder context menu', async ({page}) => {
        const fileName = 'sample.txt';
        const destinationPath = path.join(subfolderPath, fileName);

        if (fs.existsSync(destinationPath)) {
            fs.unlinkSync(destinationPath);
        }

        const sourceRow = page.locator('.file-row').filter({ hasText: fileName }).first();
        await expect(sourceRow).toBeVisible();

        const contextMenu = page.locator('#context-menu');

        await sourceRow.click({ button: 'right' });
        await expect(contextMenu).toBeVisible();
        await contextMenu.locator('[data-action="copy"]').click();
        await expect(contextMenu).toBeHidden();

        const folderRow = page.locator('.file-row').filter({ hasText: 'subfolder' }).first();
        await expect(folderRow).toBeVisible();

        await folderRow.click({ button: 'right' });
        await expect(contextMenu).toBeVisible();

        const pasteOption = contextMenu.locator('[data-action="paste"]');
        await expect(pasteOption).toBeVisible();
        await expect(pasteOption).not.toHaveClass(/disabled/);

        await pasteOption.click();
        await expect(contextMenu).toBeHidden();

        await expect.poll(() => fs.existsSync(destinationPath)).toBe(true);

        await folderRow.dblclick();
        await page.waitForFunction(() => {
            const display = document.querySelector('#path-display');
            return display && display.textContent && display.textContent.includes('subfolder');
        }, { timeout: 10000 });

        const pastedFileRow = page.locator('.file-row').filter({ hasText: fileName }).first();
        await expect(pastedFileRow).toBeVisible({ timeout: 10000 });

        await page.locator('#btn-up').click();
        await page.waitForFunction(() => {
            const display = document.querySelector('#path-display');
            return display && display.textContent === '/';
        }, { timeout: 10000 });

        if (fs.existsSync(destinationPath)) {
            fs.unlinkSync(destinationPath);
        }

        await page.locator('#btn-refresh').click();
        await page.waitForTimeout(500);
    });

    test('should cut and paste file between folders', async ({page}) => {
        const tempFileName = `temp-cut-${Date.now()}.txt`;
        const tempFilePath = path.join(testDataDir, tempFileName);

        fs.writeFileSync(tempFilePath, 'Temporary file used for cut/paste tests.');

        await page.reload();
        await page.waitForSelector('.file-row');

        const tempFileRow = page.locator('.file-row').filter({ hasText: tempFileName }).first();
        await expect(tempFileRow).toBeVisible();

        // Cut the temporary file
        await tempFileRow.click({ button: 'right' });
        await page.waitForSelector('#context-menu:not(.hidden)');
        await page.locator('[data-action="cut"]').click();

        // Navigate into subfolder and paste
        const subfolderDir = page.locator('.file-row').filter({ hasText: 'subfolder' }).first();
        await expect(subfolderDir).toBeVisible();
        await subfolderDir.dblclick();
        await page.waitForFunction(() => {
            const display = document.querySelector('#path-display');
            return display && display.textContent && display.textContent.includes('subfolder');
        }, { timeout: 10000 });

        const container = page.locator('#file-list-container');
        await container.click({ button: 'right' });
        await page.waitForSelector('#context-menu:not(.hidden)');
        await page.locator('[data-action="paste"]').click();

        const pastedRow = page.locator('.file-row').filter({ hasText: tempFileName }).first();
        await expect(pastedRow).toBeVisible({ timeout: 10000 });

        // Ensure file removed from root
        await page.locator('#btn-up').click();
        await page.waitForFunction(() => {
            const display = document.querySelector('#path-display');
            return display && display.textContent === '/';
        }, { timeout: 10000 });
        await expect(page.locator('.file-row').filter({ hasText: tempFileName })).toHaveCount(0);

        // Move file back to root using cut/paste
        await subfolderDir.dblclick();
        await page.waitForFunction(() => {
            const display = document.querySelector('#path-display');
            return display && display.textContent && display.textContent.includes('subfolder');
        }, { timeout: 10000 });

        await pastedRow.click({ button: 'right' });
        await page.waitForSelector('#context-menu:not(.hidden)');
        await page.locator('[data-action="cut"]').click();

        await page.locator('#btn-up').click();
        await page.waitForFunction(() => {
            const display = document.querySelector('#path-display');
            return display && display.textContent === '/';
        }, { timeout: 10000 });

        await container.click({ button: 'right', position: { x: 20, y: 20 } });
        await page.waitForSelector('#context-menu:not(.hidden)');
        await page.locator('[data-action="paste"]').click();

        const restoredRow = page.locator('.file-row').filter({ hasText: tempFileName }).first();
        await expect(restoredRow).toBeVisible({ timeout: 10000 });

        await page.evaluate(() => window.clipboard.clear());

        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        await page.reload();
    });

    test('should delete file via context menu without prior selection', async ({page}) => {
        const tempFileName = `temp-delete-${Date.now()}.txt`;
        const tempFilePath = path.join(testDataDir, tempFileName);

        fs.writeFileSync(tempFilePath, 'Temporary file used for delete tests.');

        await page.reload();
        await page.waitForSelector('.file-row');

        const tempFileRow = page.locator('.file-row').filter({ hasText: tempFileName }).first();
        await expect(tempFileRow).toBeVisible();

        await tempFileRow.click({ button: 'right' });
        await page.waitForSelector('#context-menu:not(.hidden)');
        await page.locator('[data-action="delete"]').click();

        const deleteModal = page.locator('#delete-modal');
        const deleteList = page.locator('#delete-modal-list');
        await expect(deleteModal).toBeVisible();
        await expect(deleteModal.locator('#delete-modal-description')).toContainText(tempFileName);
        await expect(deleteList).toBeVisible();
        await expect(deleteList).toContainText(tempFileName);

        await page.locator('#delete-confirm-btn').click();
        await expect(deleteModal).toBeHidden();

        await expect(tempFileRow).toHaveCount(0);
        await expect.poll(() => fs.existsSync(tempFilePath)).toBe(false);

        await page.reload();
    });

    test('should confirm bulk deletion with count summary when more than ten files selected', async ({page}) => {
        const timestamp = Date.now();
        const tempFileNames = Array.from({ length: 12 }, (_, index) => `bulk-delete-${timestamp}-${index}.txt`);
        const tempFilePaths = tempFileNames.map(name => path.join(testDataDir, name));

        tempFilePaths.forEach((filePath) => {
            fs.writeFileSync(filePath, 'Temporary file used for bulk delete tests.');
        });

        await page.reload();
        await page.waitForSelector('.file-row');

        for (const name of tempFileNames) {
            const row = page.locator('.file-row').filter({ hasText: name }).first();
            await expect(row).toBeVisible();
            await row.locator('.file-checkbox').check();
        }

        const lastRow = page.locator('.file-row').filter({ hasText: tempFileNames[tempFileNames.length - 1] }).first();
        await lastRow.click({ button: 'right' });
        await page.waitForSelector('#context-menu:not(.hidden)');
        await page.locator('[data-action="delete"]').click();

        const deleteModal = page.locator('#delete-modal');
        const deleteList = page.locator('#delete-modal-list');
        await expect(deleteModal).toBeVisible();
        await expect(deleteModal.locator('#delete-modal-description')).toContainText(`${tempFileNames.length} items`);
        await expect(deleteList).toBeHidden();

        await page.locator('#delete-confirm-btn').click();
        await expect(deleteModal).toBeHidden();

        await expect.poll(() => tempFilePaths.every(filePath => !fs.existsSync(filePath))).toBe(true);

        await page.reload();
    });
});
