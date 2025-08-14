// Simple text editor without external dependencies
class SimpleEditor {
    constructor(container, initialContent = '') {
        this.container = container;
        this.originalContent = initialContent;
        this.modified = false;
        this.initEditor();
    }

    initEditor() {
        // Create editor wrapper
        const editorWrapper = document.createElement('div');
        editorWrapper.className = 'editor-wrapper';
        
        // Create line number gutter
        this.lineNumbers = document.createElement('div');
        this.lineNumbers.className = 'line-numbers';
        
        // Create textarea element
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'simple-editor';
        this.textarea.value = this.originalContent;
        this.textarea.spellcheck = false;
        this.textarea.wrap = 'off';
        
        // Set up event listeners
        this.textarea.addEventListener('input', () => this.onInput());
        this.textarea.addEventListener('keydown', (e) => this.onKeyDown(e));
        this.textarea.addEventListener('scroll', () => this.syncScroll());
        
        // Add elements to wrapper
        editorWrapper.appendChild(this.lineNumbers);
        editorWrapper.appendChild(this.textarea);
        
        // Add to container
        this.container.innerHTML = '';
        this.container.appendChild(editorWrapper);
        
        // Initialize line numbers
        this.updateLineNumbers();
        
        // Focus the editor
        this.textarea.focus();
        
        // Update cursor position
        this.updateCursorPosition();
    }

    onInput() {
        const isModified = this.textarea.value !== this.originalContent;
        if (isModified !== this.modified) {
            this.modified = isModified;
            this.updateModifiedIndicator();
        }
        this.updateLineNumbers();
        this.updateCursorPosition();
    }

    onKeyDown(e) {
        // Handle Tab key
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.textarea.selectionStart;
            const end = this.textarea.selectionEnd;
            const value = this.textarea.value;
            
            // Insert tab character
            this.textarea.value = value.substring(0, start) + '\t' + value.substring(end);
            
            // Move cursor after tab
            this.textarea.selectionStart = this.textarea.selectionEnd = start + 1;
            
            // Trigger input event
            this.onInput();
        }
        
        // Note: Ctrl/Cmd+S is handled by EditorApp to avoid duplicate save requests
    }

    updateModifiedIndicator() {
        if (window.editorApp) {
            window.editorApp.updateModifiedIndicator();
        }
    }

    updateCursorPosition() {
        const textarea = this.textarea;
        const text = textarea.value.substring(0, textarea.selectionStart);
        const lines = text.split('\n');
        const lineNum = lines.length;
        const col = lines[lines.length - 1].length + 1;
        
        const cursorElement = document.getElementById('cursor-position');
        if (cursorElement) {
            cursorElement.textContent = `Ln ${lineNum}, Col ${col}`;
        }
    }

    getContent() {
        return this.textarea.value;
    }

    setContent(content) {
        this.textarea.value = content;
        this.originalContent = content;
        this.modified = false;
        this.updateModifiedIndicator();
        this.updateLineNumbers();
    }

    focus() {
        this.textarea.focus();
    }

    // Implement basic edit operations
    undo() {
        document.execCommand('undo');
    }

    redo() {
        document.execCommand('redo');
    }

    cut() {
        // Ensure textarea is focused
        this.textarea.focus();
        // Try to use document.execCommand
        const success = document.execCommand('cut');
        if (success) {
            // Trigger input event to update modified state
            this.onInput();
        }
        return success;
    }

    copy() {
        // Ensure textarea is focused
        this.textarea.focus();
        // Copy doesn't modify content, just execute the command
        return document.execCommand('copy');
    }

    paste() {
        // Try modern clipboard API first
        if (navigator.clipboard && navigator.clipboard.readText) {
            navigator.clipboard.readText()
                .then(text => {
                    const start = this.textarea.selectionStart;
                    const end = this.textarea.selectionEnd;
                    const value = this.textarea.value;
                    
                    // Insert pasted text at cursor position
                    this.textarea.value = value.substring(0, start) + text + value.substring(end);
                    
                    // Move cursor after pasted text
                    this.textarea.selectionStart = this.textarea.selectionEnd = start + text.length;
                    
                    // Trigger input event
                    this.onInput();
                    this.textarea.focus();
                })
                .catch(err => {
                    // Fallback to execCommand if clipboard API fails
                    this.textarea.focus();
                    document.execCommand('paste');
                });
        } else {
            // Fallback for older browsers
            this.textarea.focus();
            document.execCommand('paste');
        }
    }

    selectAll() {
        this.textarea.select();
    }

    find() {
        const searchTerm = prompt('Find:');
        if (searchTerm) {
            const content = this.textarea.value;
            const index = content.indexOf(searchTerm);
            if (index !== -1) {
                this.textarea.setSelectionRange(index, index + searchTerm.length);
                this.textarea.focus();
            } else {
                alert('Not found');
            }
        }
    }

    replace() {
        const searchTerm = prompt('Find:');
        if (!searchTerm) return;
        
        const replaceTerm = prompt('Replace with:');
        if (replaceTerm === null) return;
        
        const content = this.textarea.value;
        const newContent = content.replace(new RegExp(searchTerm, 'g'), replaceTerm);
        
        if (newContent !== content) {
            this.textarea.value = newContent;
            this.onInput();
        }
    }

    updateLineNumbers() {
        const text = this.textarea.value;
        const lines = text.split('\n');
        const lineCount = lines.length;
        
        // Generate line numbers
        let lineNumbersHTML = '';
        for (let i = 1; i <= lineCount; i++) {
            lineNumbersHTML += `<div class="line-number">${i}</div>`;
        }
        
        this.lineNumbers.innerHTML = lineNumbersHTML;
    }
    
    syncScroll() {
        // Synchronize scrolling between line numbers and textarea
        this.lineNumbers.scrollTop = this.textarea.scrollTop;
    }
}

// Export for use in editor app
window.SimpleEditor = SimpleEditor;