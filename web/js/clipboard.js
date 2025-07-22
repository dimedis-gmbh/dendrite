// Clipboard operations for cut, copy, paste
class Clipboard {
    constructor() {
        this.items = [];
        this.operation = null; // 'cut' or 'copy'
    }
    
    cut(paths) {
        this.items = [...paths];
        this.operation = 'cut';
        this.updateUI();
    }
    
    copy(paths) {
        this.items = [...paths];
        this.operation = 'copy';
        this.updateUI();
    }
    
    clear() {
        this.items = [];
        this.operation = null;
        this.updateUI();
    }
    
    isEmpty() {
        return this.items.length === 0;
    }
    
    getItems() {
        return [...this.items];
    }
    
    getOperation() {
        return this.operation;
    }
    
    updateUI() {
        // Update visual indicators for cut items
        document.querySelectorAll('.file-row').forEach(row => {
            const path = row.dataset.path;
            if (this.operation === 'cut' && this.items.includes(path)) {
                row.style.opacity = '0.5';
            } else {
                row.style.opacity = '1';
            }
        });
        
        // Update context menu paste state
        const pasteItem = document.querySelector('[data-action="paste"]');
        if (pasteItem) {
            pasteItem.classList.toggle('disabled', this.isEmpty());
        }
    }
}

// Global clipboard instance
window.clipboard = new Clipboard();