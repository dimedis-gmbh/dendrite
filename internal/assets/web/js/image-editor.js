// Simplified Image Editor - using TUI Image Editor with minimal modifications
(function() {
    'use strict';
    
    class ImageEditorApp {
        constructor() {
            this.editor = null;
            this.filePath = null;
            this.fileName = null;
            this.isModified = false;
            this.isModal = false;
            
            this.init();
        }
        
        init() {
            // Parse URL parameters
            const urlParams = new URLSearchParams(window.location.search);
            let filePath = urlParams.get('path');
            this.isModal = urlParams.get('modal') === 'true';
            
            if (!filePath) {
                this.showStatus('No file path provided', 'error');
                return;
            }
            
            // Remove leading slash if present to avoid double slash in URLs
            this.filePath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
            
            this.fileName = this.filePath.split('/').pop() || this.filePath;
            
            // Update UI
            document.getElementById('filename').textContent = this.fileName;
            document.title = `${this.fileName} - Dendrite Image Editor`;
            
            // Initialize editor with default TUI configuration
            this.initializeEditor();
            
            // Setup our custom buttons
            this.setupEventListeners();
            
            // Load image after editor is ready
            setTimeout(() => {
                this.loadImage();
            }, 500);
        }
        
        initializeEditor() {
            const container = document.getElementById('tui-image-editor');
            
            if (!container) {
                alert('Editor container not found');
                return;
            }
            
            // White theme configuration
            const whiteTheme = {
                // Main background
                'common.backgroundColor': '#ffffff',
                'common.border': '1px solid #ddd',
                
                // Header
                'header.backgroundColor': '#f8f8f8',
                'header.border': '0px',
                
                // Load button (hidden but configured)
                'loadButton.backgroundColor': '#fff',
                'loadButton.border': '1px solid #ddd',
                'loadButton.color': '#222',
                'loadButton.fontFamily': "'Noto Sans', sans-serif",
                'loadButton.fontSize': '12px',
                
                // Download button (hidden but configured)
                'downloadButton.backgroundColor': '#4a90e2',
                'downloadButton.border': '1px solid #4a90e2',
                'downloadButton.color': '#fff',
                'downloadButton.fontFamily': "'Noto Sans', sans-serif",
                'downloadButton.fontSize': '12px',
                
                // Menu icons
                'menu.normalIcon.color': '#555555',
                'menu.activeIcon.color': '#4a90e2',
                'menu.disabledIcon.color': '#ccc',
                'menu.hoverIcon.color': '#4a90e2',
                
                // Submenu icons
                'submenu.normalIcon.color': '#555555',
                'submenu.activeIcon.color': '#4a90e2',
                
                // Submenu background
                'submenu.backgroundColor': '#f5f5f5',
                'submenu.partition.color': '#ddd',
                
                // Submenu labels
                'submenu.normalLabel.color': '#333',
                'submenu.normalLabel.fontWeight': 'normal',
                'submenu.activeLabel.color': '#4a90e2',
                'submenu.activeLabel.fontWeight': 'normal',
                
                // Checkbox
                'checkbox.border': '1px solid #ccc',
                'checkbox.backgroundColor': '#fff',
                
                // Range slider
                'range.pointer.color': '#4a90e2',
                'range.bar.color': '#ccc',
                'range.subbar.color': '#4a90e2',
                
                'range.disabledPointer.color': '#999',
                'range.disabledBar.color': '#eee',
                'range.disabledSubbar.color': '#999',
                
                'range.value.color': '#333',
                'range.value.fontWeight': 'normal',
                'range.value.fontSize': '11px',
                'range.value.border': '1px solid #ccc',
                'range.value.backgroundColor': '#fff',
                'range.title.color': '#333',
                'range.title.fontWeight': 'normal',
                
                // Colorpicker
                'colorpicker.button.border': '1px solid #ccc',
                'colorpicker.title.color': '#333'
            };
            
            // Use TUI Image Editor with white theme
            this.editor = new tui.ImageEditor(container, {
                includeUI: {
                    loadImage: {
                        path: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
                        name: 'Blank'
                    },
                    theme: whiteTheme,
                    menu: ['crop', 'flip', 'rotate', 'draw', 'shape', 'icon', 'text', 'mask', 'filter'],
                    initMenu: 'filter',
                    uiSize: {
                        width: '100%',
                        height: '700px'
                    },
                    menuBarPosition: 'bottom'
                },
                cssMaxWidth: 1000,
                cssMaxHeight: 600,
                usageStatistics: false
            });
            
            // Listen for modifications - comprehensive change tracking
            this.editor.on('objectAdded', () => {
                this.isModified = true;
                this.updateModifiedIndicator();
            });
            
            this.editor.on('objectModified', () => {
                this.isModified = true;
                this.updateModifiedIndicator();
            });
            
            this.editor.on('objectMoved', () => {
                this.isModified = true;
                this.updateModifiedIndicator();
            });
            
            this.editor.on('objectRotated', () => {
                this.isModified = true;
                this.updateModifiedIndicator();
            });
            
            this.editor.on('objectScaled', () => {
                this.isModified = true;
                this.updateModifiedIndicator();
            });
            
            this.editor.on('undoStackChanged', (length) => {
                if (length > 0) {
                    this.isModified = true;
                    this.updateModifiedIndicator();
                }
            });
            
            this.editor.on('redoStackChanged', () => {
                this.isModified = true;
                this.updateModifiedIndicator();
            });
            
            // Track filter changes - filters might fire different events
            this.editor.on('applyFilter', () => {
                console.log('Filter applied');
                this.isModified = true;
                this.updateModifiedIndicator();
            });
            
            this.editor.on('removeFilter', () => {
                console.log('Filter removed');
                this.isModified = true;
                this.updateModifiedIndicator();
            });
        }
        
        async loadImage() {
            try {
                // Fetch the image
                const response = await fetch(`/api/files/${encodeURIComponent(this.filePath)}`);
                
                if (!response.ok) {
                    throw new Error(`Failed to load image: ${response.statusText}`);
                }
                
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);
                
                // Load into editor
                this.editor.loadImageFromURL(imageUrl, 'Image').then(() => {
                    console.log('Image loaded successfully');
                    
                    // Reset modified flag when image loads
                    this.isModified = false;
                    this.updateModifiedIndicator();
                    
                    // Clean up blob URL after loading
                    setTimeout(() => {
                        URL.revokeObjectURL(imageUrl);
                    }, 1000);
                }).catch(err => {
                    this.showStatus('Failed to load image: ' + err.message, 'error');
                });
                
            } catch (error) {
                this.showStatus('Failed to load image: ' + error.message, 'error');
            }
        }
        
        setupEventListeners() {
            // Save button
            document.getElementById('save-btn').addEventListener('click', () => {
                this.saveImage();
            });
            
            // Revert button
            document.getElementById('revert-btn').addEventListener('click', () => {
                if (this.isModified && confirm('Revert all changes?')) {
                    this.loadImage();
                }
            });
            
            // Close button
            document.getElementById('close-btn').addEventListener('click', () => {
                if (this.isModified && !confirm('You have unsaved changes. Close anyway?')) {
                    return;
                }
                
                if (this.isModal && window.parent) {
                    window.parent.postMessage({ action: 'closeImageEditor' }, '*');
                } else {
                    window.close();
                }
            });
            
            // Keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    this.saveImage();
                }
            });
            
            // Browser close warning for unsaved changes
            window.addEventListener('beforeunload', (e) => {
                if (this.isModified) {
                    // Cancel the event and show browser warning
                    e.preventDefault();
                    // Chrome requires returnValue to be set
                    e.returnValue = '';
                    // Return value for older browsers
                    return '';
                }
            });
        }
        
        async saveImage() {
            try {
                // Get the full image with all filters and effects applied
                // Use proper parameters to ensure everything is saved
                const dataURL = this.editor.toDataURL({
                    format: 'png',  // Use PNG to preserve quality and transparency
                    quality: 1,     // Maximum quality
                    multiplier: 1   // No scaling
                });
                
                console.log('Saving image with dataURL length:', dataURL.length);
                
                // Convert dataURL to blob
                const response = await fetch(dataURL);
                const blob = await response.blob();
                
                console.log('Blob size:', blob.size, 'Type:', blob.type);
                
                // Save using PUT endpoint
                const saveResponse = await fetch(`/api/files/${encodeURIComponent(this.filePath)}/raw`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/octet-stream'
                    },
                    body: blob
                });
                
                if (!saveResponse.ok) {
                    throw new Error(`Failed to save: ${saveResponse.statusText}`);
                }
                
                this.isModified = false;
                this.updateModifiedIndicator();
                this.showStatus('Image saved successfully', 'success');
                
            } catch (error) {
                this.showStatus('Failed to save: ' + error.message, 'error');
            }
        }
        
        updateModifiedIndicator() {
            const indicator = document.getElementById('modified-indicator');
            if (this.isModified) {
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        }
        
        showStatus(message, type = 'success') {
            const statusElement = document.getElementById('status-message');
            
            // Clear any existing timeout
            if (this.statusTimeout) {
                clearTimeout(this.statusTimeout);
            }
            
            // Clear any existing fade timeout
            if (this.fadeTimeout) {
                clearTimeout(this.fadeTimeout);
            }
            
            // Reset classes and set message
            statusElement.className = '';
            statusElement.textContent = message;
            
            // Add appropriate class
            if (type === 'error') {
                statusElement.classList.add('error');
            }
            
            // Show the message
            statusElement.classList.add('show');
            
            // Start fade out after 2 seconds
            this.statusTimeout = setTimeout(() => {
                statusElement.classList.add('fade-out');
                
                // Remove everything after animation completes
                this.fadeTimeout = setTimeout(() => {
                    statusElement.className = '';
                    statusElement.textContent = '';
                }, 300); // Match the CSS transition duration
            }, 2000);
        }
    }
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.imageEditorApp = new ImageEditorApp();
        });
    } else {
        window.imageEditorApp = new ImageEditorApp();
    }
})();