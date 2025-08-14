const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.describe('Editor JavaScript Error Detection', () => {
    const testDataDir = path.join(__dirname, 'test-data');
    const testFilePath = path.join(testDataDir, 'sample.js');

    test.beforeEach(async ({ page }) => {
        // Capture console errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                console.log('Console error:', msg.text());
                errors.push(msg.text());
            }
        });
        
        // Capture page errors (uncaught exceptions)
        page.on('pageerror', error => {
            console.log('Page error:', error.message);
            errors.push(error.message);
        });
        
        // Store errors on page for later access
        page.errors = errors;
        
        // Navigate to the main page
        await page.goto('http://127.0.0.1:3001');
        await page.waitForSelector('.file-row', { timeout: 10000 });
    });

    test('should not have JavaScript errors when opening editor', async ({ page }) => {
        // Find and open a JS file
        const fileRow = page.locator('.file-row').filter({ hasText: 'sample.js' }).first();
        await expect(fileRow).toBeVisible({ timeout: 20000 });
        
        // Right-click to open context menu
        await fileRow.click({ button: 'right' });
        
        // Wait for context menu to appear
        await page.waitForTimeout(500);
        await expect(page.locator('#context-menu')).toBeVisible({ timeout: 10000 });
        
        // Click "Edit (modal)"
        await page.click('[data-action="edit-modal"]');
        
        // Wait for modal to appear
        await expect(page.locator('#editor-modal')).toBeVisible({ timeout: 10000 });
        
        // Wait for iframe to load
        const iframe = page.frameLocator('#editor-modal-iframe');
        
        // Capture iframe console errors
        const iframeErrors = [];
        await page.evaluate(() => {
            const iframe = document.querySelector('#editor-modal-iframe');
            if (iframe && iframe.contentWindow) {
                // This won't work due to cross-origin, but we try
                try {
                    iframe.contentWindow.console.error = function(...args) {
                        window.parent.postMessage({ type: 'iframe-error', message: args.join(' ') }, '*');
                    };
                } catch(e) {
                    console.log('Cannot override iframe console');
                }
            }
        });
        
        // Listen for messages from iframe
        await page.evaluateHandle(() => {
            window.addEventListener('message', (e) => {
                if (e.data && e.data.type === 'iframe-error') {
                    console.error('Iframe error:', e.data.message);
                }
            });
        });
        
        // Wait longer for any errors to appear
        await page.waitForTimeout(3000);
        
        // Check if editor container exists (this will fail if JS errors prevent initialization)
        try {
            await iframe.locator('#editor-container').waitFor({ timeout: 5000 });
        } catch (e) {
            console.error('Editor container not found - likely due to JS errors');
            throw new Error('Editor failed to initialize - check for JavaScript errors');
        }
        
        // Check if the textarea exists (SimpleEditor should create it)
        try {
            const editorTextarea = iframe.locator('.simple-editor');
            await expect(editorTextarea).toBeVisible({ timeout: 5000 });
        } catch (e) {
            console.error('Editor textarea not found - SimpleEditor failed to initialize');
            throw new Error('SimpleEditor not initialized - likely "window.SimpleEditor is not a constructor" error');
        }
        
        // Check collected errors
        if (page.errors && page.errors.length > 0) {
            console.error('JavaScript errors detected:', page.errors);
            throw new Error(`JavaScript errors detected: ${page.errors.join(', ')}`);
        }
        
        // Verify editor actually works by checking if content is loaded
        const editor = iframe.locator('.simple-editor');
        const content = await editor.inputValue();
        
        if (!content || content.length === 0) {
            throw new Error('Editor is empty - file content not loaded (possibly due to JS initialization errors)');
        }
        
        console.log('Editor loaded successfully without JS errors');
        console.log('Content length:', content.length);
    });
    
    test('should detect missing SimpleEditor constructor error', async ({ page }) => {
        // This test specifically looks for the SimpleEditor constructor issue
        
        // Navigate directly to editor page
        await page.goto('http://127.0.0.1:3001/editor.html?path=sample.js');
        
        // Capture any errors
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });
        
        page.on('pageerror', error => {
            errors.push(error.message);
        });
        
        // Wait for page to load
        await page.waitForTimeout(2000);
        
        // Check if SimpleEditor is defined
        const hasSimpleEditor = await page.evaluate(() => {
            return typeof window.SimpleEditor !== 'undefined';
        });
        
        if (!hasSimpleEditor) {
            throw new Error('CRITICAL: window.SimpleEditor is not defined - script failed to load');
        }
        
        // Check if it's a constructor
        const isConstructor = await page.evaluate(() => {
            return typeof window.SimpleEditor === 'function';
        });
        
        if (!isConstructor) {
            throw new Error('CRITICAL: window.SimpleEditor is not a constructor');
        }
        
        // Check for specific error messages
        const hasConstructorError = errors.some(err => 
            err.includes('SimpleEditor is not a constructor') ||
            err.includes('window.SimpleEditor is not a constructor')
        );
        
        if (hasConstructorError) {
            throw new Error('CRITICAL: SimpleEditor constructor error detected');
        }
        
        // Check if editor was initialized
        const editorInitialized = await page.evaluate(() => {
            return window.editorApp && window.editorApp.editor !== null;
        });
        
        if (!editorInitialized) {
            throw new Error('CRITICAL: Editor app failed to initialize editor instance');
        }
        
        console.log('SimpleEditor is properly defined as a constructor');
    });
});