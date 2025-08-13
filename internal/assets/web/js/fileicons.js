// File icon mapping for different file types
class FileIcons {
    static getIconClass(fileName, isDir) {
        if (isDir) return 'icon-folder';
        
        // Ensure fileName is a string and trim any whitespace
        if (!fileName || typeof fileName !== 'string') {
            return 'icon-file';
        }
        
        const ext = fileName.trim().split('.').pop().toLowerCase();
        
        // Documents
        if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) {
            return 'icon-document';
        }
        
        // Spreadsheets
        if (['xls', 'xlsx', 'ods', 'csv'].includes(ext)) {
            return 'icon-spreadsheet';
        }
        
        // Presentations
        if (['ppt', 'pptx', 'odp'].includes(ext)) {
            return 'icon-presentation';
        }
        
        // PDF files
        if (ext === 'pdf') {
            return 'icon-pdf';
        }
        
        // Code/Programming files
        if (['js', 'ts', 'jsx', 'tsx', 'go', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'rb', 'swift', 'rs', 'kt', 'scala', 'r', 'sh', 'bash'].includes(ext)) {
            return 'icon-code';
        }
        
        // Web files
        if (['html', 'htm', 'css', 'scss', 'sass', 'less'].includes(ext)) {
            return 'icon-web';
        }
        
        // Data files
        if (['json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'conf', 'config'].includes(ext)) {
            return 'icon-data';
        }
        
        // Text files
        if (['txt', 'md', 'log', 'readme', 'license', 'authors', 'contributors', 'changelog', 'todo'].includes(ext)) {
            return 'icon-text';
        }
        
        // Image files
        if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'ico', 'webp', 'tiff', 'tif', 'psd', 'ai', 'eps'].includes(ext)) {
            return 'icon-image';
        }
        
        // Audio files
        if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus'].includes(ext)) {
            return 'icon-audio';
        }
        
        // Video files
        if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp'].includes(ext)) {
            return 'icon-video';
        }
        
        // Archive files
        if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'tbz', 'txz', 'cab', 'deb', 'rpm'].includes(ext)) {
            return 'icon-archive';
        }
        
        // Executable/Binary files
        if (['exe', 'dll', 'so', 'dylib', 'app', 'deb', 'rpm', 'dmg', 'pkg', 'msi'].includes(ext)) {
            return 'icon-executable';
        }
        
        // Default file icon
        return 'icon-file';
    }
    
    static createIcon(fileName, isDir) {
        const iconClass = this.getIconClass(fileName, isDir);
        return `<div class="file-icon ${iconClass}"></div>`;
    }
}