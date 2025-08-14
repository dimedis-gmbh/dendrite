// Dendrite Editor Application
class EditorApp {
    constructor() {
        this.editor = null;
        this.filePath = null;
        this.originalContent = '';
        this.modified = false;
        this.jwt = null;
        this.isModal = false;
        
        // Extract JWT from localStorage if available
        const auth = localStorage.getItem('dendrite_auth');
        if (auth) {
            try {
                const authData = JSON.parse(auth);
                this.jwt = authData.jwt;
            } catch (e) {
                console.error('Failed to parse auth data:', e);
            }
        }
        
        this.init();
    }

    async init() {
        // Get file path from URL
        const params = new URLSearchParams(window.location.search);
        this.filePath = params.get('path');
        
        // Detect if we're in a modal (iframe) or standalone window
        this.isModal = window.self !== window.top;
        
        if (!this.filePath) {
            this.showError('No file path specified');
            return;
        }

        // Update title and status bar
        const filename = this.filePath.split('/').pop();
        document.title = `${filename} - Dendrite Editor`;
        document.getElementById('filename').textContent = filename;

        // Load file content - MUST complete before initializing editor
        await this.loadFile();
        
        // Initialize editor ONLY after content is loaded
        this.initEditor();
        
        // Set up keyboard shortcuts
        this.setupKeyboardShortcuts();
        
        // Set up beforeunload handler
        if (this.isModal) {
            // For modal editor, we'll handle closing through parent communication
            window.addEventListener('message', (e) => {
                if (e.data && e.data.action === 'checkUnsavedChanges') {
                    // Respond to parent about unsaved changes
                    window.parent.postMessage({
                        action: 'unsavedChangesStatus',
                        hasUnsavedChanges: this.modified,
                        filePath: this.filePath
                    }, '*');
                } else if (e.data && e.data.action === 'forceClose') {
                    // Parent confirmed close despite unsaved changes
                    this.modified = false; // Clear modified flag to prevent beforeunload
                }
            });
        } else {
            // For standalone window, use standard beforeunload
            window.addEventListener('beforeunload', (e) => {
                if (this.modified) {
                    e.preventDefault();
                    e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                    return e.returnValue;
                }
            });
        }
    }

    async loadFile() {
        try {
            const headers = {};
            if (this.jwt) {
                headers['Authorization'] = `Bearer ${this.jwt}`;
            }
            
            // Remove leading slash if present, as the API expects path without it
            const cleanPath = this.filePath.startsWith('/') ? this.filePath.substring(1) : this.filePath;
            
            const response = await fetch(`/api/files/${encodeURIComponent(cleanPath)}/raw`, {
                headers: headers
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
            }
            
            this.originalContent = await response.text();
        } catch (error) {
            this.showError(`Error loading file: ${error.message}`);
            this.originalContent = '';
        }
    }

    initEditor() {
        const container = document.getElementById('editor-container');
        
        // Create simple editor
        this.editor = new window.SimpleEditor(container, this.originalContent);
        
        // Connect editor to menu
        if (window.editorMenu) {
            window.editorMenu.setEditor(this.editor);
        }
    }

    detectLanguage(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const langMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'javascript',
            'tsx': 'javascript',
            'py': 'python',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'css',
            'sass': 'css',
            'json': 'json',
            'md': 'markdown',
            'markdown': 'markdown',
            'sql': 'sql',
            'xml': 'xml',
            'svg': 'xml',
            'yml': 'yaml',
            'yaml': 'yaml',
            'go': 'go',
            'sh': 'shell',
            'bash': 'shell'
        };

        const langName = langMap[ext];
        if (langName && window.CM.languages[langName]) {
            return window.CM.languages[langName]();
        }
        
        // Default to plain text (no language extension)
        return [];
    }

    onContentChange() {
        // This is now handled by SimpleEditor
    }

    updateModifiedIndicator() {
        const indicator = document.getElementById('modified-indicator');
        const isModified = this.editor && this.editor.modified;
        if (isModified) {
            indicator.textContent = '● Modified';
            document.title = `● ${this.filePath.split('/').pop()} - Dendrite Editor`;
        } else {
            indicator.textContent = '';
            document.title = `${this.filePath.split('/').pop()} - Dendrite Editor`;
        }
        this.modified = isModified;
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey;
            
            if (ctrlOrCmd) {
                switch(e.key.toLowerCase()) {
                    case 's':
                        e.preventDefault();
                        this.save();
                        break;
                    case 'w':
                        e.preventDefault();
                        if (window.editorMenu) {
                            window.editorMenu.close();
                        }
                        break;
                }
            }
        });
    }

    async save() {
        if (!this.editor || !this.editor.modified) {
            this.showMessage('No changes to save');
            return;
        }

        const content = this.editor.getContent();
        
        try {
            const headers = {
                'Content-Type': 'text/plain'
            };
            if (this.jwt) {
                headers['Authorization'] = `Bearer ${this.jwt}`;
            }
            
            // Remove leading slash if present, as the API expects path without it
            const cleanPath = this.filePath.startsWith('/') ? this.filePath.substring(1) : this.filePath;
            
            const response = await fetch(`/api/files/${encodeURIComponent(cleanPath)}/raw`, {
                method: 'PUT',
                headers: headers,
                body: content
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to save: ${error}`);
            }
            
            this.originalContent = content;
            this.editor.setContent(content); // This resets the modified flag
            this.updateModifiedIndicator();
            this.showMessage('File saved successfully');
        } catch (error) {
            this.showError(`Error saving file: ${error.message}`);
        }
    }

    isModified() {
        return this.editor && this.editor.modified;
    }

    showMessage(message) {
        // Could implement a toast notification here
        console.log(message);
    }

    showError(message) {
        console.error(message);
        alert(message);
    }
}

// Initialize the editor app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.editorApp = new EditorApp();
});