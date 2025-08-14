// Editor Menu Handler
class EditorMenu {
    constructor() {
        this.editor = null;
        this.initMenus();
    }

    setEditor(editor) {
        this.editor = editor;
    }

    initMenus() {
        // Handle menu clicks
        document.querySelectorAll('.menu-action').forEach(action => {
            // Prevent text selection loss on mousedown
            action.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevents text selection loss
            });
            
            action.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const actionName = action.dataset.action;
                // Close menu immediately
                this.closeAllMenus();
                // Handle action directly without delay
                this.handleAction(actionName);
            });
        });

        // Close menus when clicking outside
        document.addEventListener('click', () => {
            this.closeAllMenus();
        });

        // Toggle menu on menu item click
        document.querySelectorAll('.menu-item').forEach(item => {
            // Prevent text selection loss on mousedown
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevents text selection loss
            });
            
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasActive = item.classList.contains('active');
                this.closeAllMenus();
                if (!wasActive) {
                    item.classList.add('active');
                }
            });
        });
    }

    closeAllMenus() {
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('active');
        });
        // Also ensure dropdowns are hidden
        document.querySelectorAll('.dropdown').forEach(dropdown => {
            dropdown.style.display = '';
        });
    }

    handleAction(action) {
        if (!this.editor && !['close'].includes(action)) {
            console.warn('Editor not initialized');
            return;
        }

        switch (action) {
            case 'save':
                this.save();
                break;
            case 'close':
                this.close();
                break;
            case 'undo':
                this.undo();
                break;
            case 'redo':
                this.redo();
                break;
            case 'cut':
                this.cut();
                break;
            case 'copy':
                this.copy();
                break;
            case 'paste':
                this.paste();
                break;
            case 'find':
                this.find();
                break;
            case 'replace':
                this.replace();
                break;
        }
    }

    save() {
        if (window.editorApp) {
            window.editorApp.save();
        }
    }

    close() {
        if (window.editorApp && window.editorApp.isModified()) {
            if (!confirm('You have unsaved changes. Are you sure you want to close?')) {
                return;
            }
        }
        window.close();
    }

    undo() {
        if (!this.editor) return;
        this.editor.undo();
    }

    redo() {
        if (!this.editor) return;
        this.editor.redo();
    }

    cut() {
        if (!this.editor) return;
        this.editor.cut();
    }

    copy() {
        if (!this.editor) return;
        this.editor.copy();
    }

    paste() {
        if (!this.editor) return;
        this.editor.paste();
    }

    find() {
        if (!this.editor) return;
        this.editor.find();
    }

    replace() {
        if (!this.editor) return;
        this.editor.replace();
    }
}

// Initialize menu when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.editorMenu = new EditorMenu();
});