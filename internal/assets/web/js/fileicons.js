// File icon mapping for different file types
class FileIcons {
    static getIconClass(fileName, isDir) {
        if (isDir) return 'icon-folder';
        
        const ext = fileName.split('.').pop().toLowerCase();
        
        // Text files
        if (['txt', 'md', 'log', 'readme', 'go', 'js', 'html', 'css', 'json', 'xml', 'yaml', 'yml'].includes(ext)) {
            return 'icon-text';
        }
        
        // Image files
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'ico', 'webp'].includes(ext)) {
            return 'icon-image';
        }
        
        // Archive files
        if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) {
            return 'icon-archive';
        }
        
        // Default file icon
        return 'icon-file';
    }
    
    static createIcon(fileName, isDir) {
        const iconClass = this.getIconClass(fileName, isDir);
        return `<div class="file-icon ${iconClass}"></div>`;
    }
}