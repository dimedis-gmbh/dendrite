// Monaco Editor App for Dendrite
class MonacoEditorApp {
    constructor() {
        this.editor = null;
        this.filePath = null;
        this.originalContent = '';
        this.modified = false;
        this.jwt = null;
        this.toastTimeout = null;
        this.init();
    }
    
    async init() {
        // Get parameters from URL
        const params = new URLSearchParams(window.location.search);
        this.filePath = params.get('path');
        this.jwt = params.get('jwt');
        
        if (!this.filePath) {
            this.showError('No file path specified');
            return;
        }
        
        // Set window title
        const fileName = this.filePath.split('/').pop() || 'Untitled';
        document.title = `${fileName} - Dendrite Editor`;
        
        // Update file path in status bar
        document.getElementById('file-path').textContent = this.filePath;
        
        // Configure Monaco loader
        require.config({ 
            paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }
        });
        
        // Configure Monaco environment for web workers
        window.MonacoEnvironment = {
            getWorkerUrl: function(workerId, label) {
                return `data:text/javascript;charset=utf-8,${encodeURIComponent(`
                    self.MonacoEnvironment = {
                        baseUrl: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/'
                    };
                    importScripts('https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/base/worker/workerMain.js');
                `)}`;
            }
        };
        
        // Load Monaco
        require(['vs/editor/editor.main'], () => {
            this.createEditor();
            this.loadFile();
            this.setupEventHandlers();
            document.getElementById('loading').style.display = 'none';
        });
    }
    
    createEditor() {
        // Detect preferred color scheme
        const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        this.editor = monaco.editor.create(document.getElementById('editor-container'), {
            value: '// Loading file...',
            language: 'plaintext',
            theme: isDarkMode ? 'vs-dark' : 'vs',
            automaticLayout: true,
            fontSize: 14,
            fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Courier New", monospace',
            fontLigatures: true,
            wordWrap: 'off',
            minimap: { 
                enabled: true,
                showSlider: 'always',
                renderCharacters: false,
                maxColumn: 80
            },
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            rulers: [80, 120],
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: true,
            // Search widget configuration
            find: {
                seedSearchStringFromSelection: true,
                autoFindInSelection: 'never',
                globalFindClipboard: false,
                addExtraSpaceOnTop: true,
                loop: true
            },
            // Additional editor options
            lineNumbers: 'on',
            glyphMargin: false,
            folding: true,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 4,
            renderLineHighlight: 'all',
            scrollbar: {
                useShadows: false,
                vertical: 'visible',
                horizontal: 'visible',
                verticalScrollbarSize: 10,
                horizontalScrollbarSize: 10
            },
            // Disable auto-completion and suggestions
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            acceptSuggestionOnEnter: 'off',
            acceptSuggestionOnCommitCharacter: false,
            wordBasedSuggestions: false,
            suggest: {
                enabled: false
            },
            autoClosingBrackets: 'never',
            autoClosingQuotes: 'never',
            autoIndent: 'advanced',
            formatOnPaste: false,
            formatOnType: false
        });
        
        // Track content changes
        this.editor.onDidChangeModelContent(() => {
            this.updateModifiedState();
        });
        
        // Update cursor position
        this.editor.onDidChangeCursorPosition((e) => {
            const position = e.position;
            document.getElementById('cursor-position').textContent = 
                `Ln ${position.lineNumber}, Col ${position.column}`;
        });
        
        // Update selection info
        this.editor.onDidChangeCursorSelection((e) => {
            const selection = e.selection;
            const model = this.editor.getModel();
            
            if (!selection.isEmpty()) {
                const selectedText = model.getValueInRange(selection);
                const lines = selectedText.split('\n').length;
                const chars = selectedText.length;
                document.getElementById('selection-info').textContent = 
                    `(${chars} chars, ${lines} lines selected)`;
            } else {
                document.getElementById('selection-info').textContent = '';
            }
        });
    }
    
    async loadFile() {
        try {
            const headers = {};
            if (this.jwt) {
                headers['Authorization'] = `Bearer ${this.jwt}`;
            }
            
            // Remove leading slash if present
            const cleanPath = this.filePath.startsWith('/') ? this.filePath.substring(1) : this.filePath;
            
            const response = await fetch(`/api/files/${encodeURIComponent(cleanPath)}/raw`, { headers });
            if (!response.ok) {
                throw new Error(`Failed to load file: ${response.statusText}`);
            }
            
            const content = await response.text();
            this.originalContent = content;
            
            // Set content
            this.editor.setValue(content);
            
            // Detect and set language
            const language = this.detectLanguage(this.filePath);
            monaco.editor.setModelLanguage(this.editor.getModel(), language);
            
            // Update language in status bar
            const languages = monaco.languages.getLanguages();
            const langInfo = languages.find(l => l.id === language);
            document.getElementById('file-language').textContent = langInfo ? langInfo.aliases[0] : 'Plain Text';
            
            // Reset modified state
            this.modified = false;
            this.updateModifiedIndicator();
            
            // Focus editor
            this.editor.focus();
            
        } catch (error) {
            this.showError(`Error loading file: ${error.message}`);
            this.editor.setValue(`// Error loading file: ${error.message}\n// Path: ${this.filePath}`);
        }
    }
    
    async save() {
        if (!this.modified) {
            this.showToast('No changes to save');
            return;
        }
        
        const content = this.editor.getValue();
        
        try {
            const headers = { 'Content-Type': 'text/plain' };
            if (this.jwt) {
                headers['Authorization'] = `Bearer ${this.jwt}`;
            }
            
            // Remove leading slash if present
            const cleanPath = this.filePath.startsWith('/') ? this.filePath.substring(1) : this.filePath;
            
            const response = await fetch(`/api/files/${encodeURIComponent(cleanPath)}/raw`, {
                method: 'PUT',
                headers: headers,
                body: content
            });
            
            if (!response.ok) {
                const error = await response.text();
                throw new Error(error || response.statusText);
            }
            
            this.originalContent = content;
            this.modified = false;
            this.updateModifiedIndicator();
            this.showToast('File saved successfully', 'success');
            
        } catch (error) {
            this.showError(`Error saving file: ${error.message}`);
        }
    }
    
    setupEventHandlers() {
        // Save command (Ctrl/Cmd+S)
        this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
            this.save();
        });
        
        // Menu button handlers
        document.getElementById('save-btn').onclick = () => this.save();
        document.getElementById('undo-btn').onclick = () => this.editor.trigger('keyboard', 'undo');
        document.getElementById('redo-btn').onclick = () => this.editor.trigger('keyboard', 'redo');
        document.getElementById('find-btn').onclick = () => this.editor.trigger('keyboard', 'actions.find');
        document.getElementById('replace-btn').onclick = () => this.editor.trigger('keyboard', 'editor.action.startFindReplaceAction');
        document.getElementById('comment-line-btn').onclick = () => this.editor.trigger('keyboard', 'editor.action.commentLine');
        document.getElementById('comment-block-btn').onclick = () => this.editor.trigger('keyboard', 'editor.action.blockComment');
        
        // Handle messages from parent window (for modal integration)
        window.addEventListener('message', (e) => {
            if (e.data && e.data.action === 'checkUnsavedChanges') {
                window.parent.postMessage({
                    action: 'unsavedChangesStatus',
                    hasUnsavedChanges: this.modified,
                    filePath: this.filePath
                }, '*');
            } else if (e.data && e.data.action === 'forceClose') {
                // Reset modified flag to allow closing
                this.modified = false;
                this.updateModifiedIndicator();
            }
        });
        
        // Warn before leaving if there are unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (this.modified) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
        
        // Handle keyboard shortcut display based on platform
        const isMac = navigator.platform.indexOf('Mac') !== -1;
        
        // Update tooltips with proper keyboard shortcuts
        if (isMac) {
            document.getElementById('save-btn').title = 'Save (⌘S)';
            document.getElementById('undo-btn').title = 'Undo (⌘Z)';
            document.getElementById('redo-btn').title = 'Redo (⌘⇧Z)';
            document.getElementById('find-btn').title = 'Find (⌘F)';
            document.getElementById('replace-btn').title = 'Replace (⌥⌘F)';
            document.getElementById('comment-line-btn').title = 'Toggle Line Comment (⌘/)';
            document.getElementById('comment-block-btn').title = 'Toggle Block Comment (⌥⇧A)';
            
            // Override Replace shortcut to Option-Command-F on Mac
            this.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF, () => {
                this.editor.trigger('keyboard', 'editor.action.startFindReplaceAction');
            });
        } else {
            document.getElementById('save-btn').title = 'Save (Ctrl+S)';
            document.getElementById('undo-btn').title = 'Undo (Ctrl+Z)';
            document.getElementById('redo-btn').title = 'Redo (Ctrl+Y)';
            document.getElementById('find-btn').title = 'Find (Ctrl+F)';
            document.getElementById('replace-btn').title = 'Replace (Ctrl+H)';
            document.getElementById('comment-line-btn').title = 'Toggle Line Comment (Ctrl+/)';
            document.getElementById('comment-block-btn').title = 'Toggle Block Comment (Shift+Alt+A)';
        }
    }
    
    detectLanguage(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const name = filePath.split('/').pop().toLowerCase();
        
        // Check for specific filenames first
        const filenameMap = {
            'dockerfile': 'dockerfile',
            'makefile': 'makefile',
            'gemfile': 'ruby',
            'rakefile': 'ruby',
            'jenkinsfile': 'groovy',
            'cmakelists.txt': 'cmake'
        };
        
        if (filenameMap[name]) {
            return filenameMap[name];
        }
        
        // Check by extension
        const extensionMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'python',
            'go': 'go',
            'rs': 'rust',
            'java': 'java',
            'cpp': 'cpp',
            'cc': 'cpp',
            'cxx': 'cpp',
            'c': 'c',
            'h': 'c',
            'hpp': 'cpp',
            'cs': 'csharp',
            'php': 'php',
            'rb': 'ruby',
            'swift': 'swift',
            'kt': 'kotlin',
            'scala': 'scala',
            'sh': 'shell',
            'bash': 'shell',
            'zsh': 'shell',
            'fish': 'shell',
            'ps1': 'powershell',
            'psm1': 'powershell',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'scss',
            'sass': 'scss',
            'less': 'less',
            'xml': 'xml',
            'json': 'json',
            'jsonc': 'json',
            'yaml': 'yaml',
            'yml': 'yaml',
            'toml': 'toml',
            'ini': 'ini',
            'cfg': 'ini',
            'conf': 'ini',
            'md': 'markdown',
            'markdown': 'markdown',
            'sql': 'sql',
            'r': 'r',
            'R': 'r',
            'lua': 'lua',
            'vim': 'vimscript',
            'vimrc': 'vimscript',
            'diff': 'diff',
            'patch': 'diff',
            'dockerfile': 'dockerfile',
            'tf': 'hcl',
            'hcl': 'hcl',
            'graphql': 'graphql',
            'gql': 'graphql',
            'vue': 'vue',
            'svelte': 'svelte',
            'clj': 'clojure',
            'cljs': 'clojure',
            'ex': 'elixir',
            'exs': 'elixir',
            'elm': 'elm',
            'ml': 'ocaml',
            'mli': 'ocaml',
            'fs': 'fsharp',
            'fsi': 'fsharp',
            'fsx': 'fsharp',
            'dart': 'dart',
            'pas': 'pascal',
            'pp': 'pascal',
            'pl': 'perl',
            'pm': 'perl',
            'asm': 'asm',
            's': 'asm',
            'bat': 'bat',
            'cmd': 'bat',
            'proto': 'proto',
            'gradle': 'groovy',
            'groovy': 'groovy',
            'hbs': 'handlebars',
            'handlebars': 'handlebars'
        };
        
        return extensionMap[ext] || 'plaintext';
    }
    
    updateModifiedState() {
        const currentContent = this.editor.getValue();
        const wasModified = this.modified;
        this.modified = currentContent !== this.originalContent;
        
        if (wasModified !== this.modified) {
            this.updateModifiedIndicator();
        }
    }
    
    updateModifiedIndicator() {
        const indicator = document.getElementById('modified-indicator');
        if (this.modified) {
            indicator.textContent = '● Modified';
            indicator.style.display = 'block';
        } else {
            indicator.textContent = '';
            indicator.style.display = 'none';
        }
    }
    
    showToast(message, type = 'info') {
        // Clear any existing toast timeout
        if (this.toastTimeout) {
            clearTimeout(this.toastTimeout);
        }
        
        // Remove any existing toast
        const existingToast = document.querySelector('.toast');
        if (existingToast) {
            existingToast.remove();
        }
        
        // Create new toast
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // Show toast with animation
        setTimeout(() => toast.classList.add('show'), 10);
        
        // Hide and remove toast after 3 seconds
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    showError(message) {
        console.error(message);
        this.showToast(message, 'error');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.editorApp = new MonacoEditorApp();
});