// File icon mapping for different file types using SVG icons
class FileIcons {
    // Map file extensions to icon filenames
    static getIconPath(fileName, isDir, mimeType) {
        if (isDir) return '/icons/mimetypes/folder.svg';
        
        // Ensure fileName is a string and trim any whitespace
        if (!fileName || typeof fileName !== 'string') {
            return '/icons/mimetypes/file-default.svg';
        }
        
        const ext = fileName.trim().split('.').pop().toLowerCase();
        const name = fileName.toLowerCase();
        
        // Try to use MIME type if available
        if (mimeType) {
            const mimeIcon = this.getMimeTypeIcon(mimeType);
            if (mimeIcon) return mimeIcon;
        }
        
        // Map extensions to specific icons
        const extensionMap = {
            // Documents
            'pdf': '/icons/mimetypes/application-pdf.svg',
            'doc': '/icons/mimetypes/x-office-document.svg',
            'docx': '/icons/mimetypes/x-office-document.svg',
            'odt': '/icons/mimetypes/x-office-document.svg',
            'rtf': '/icons/mimetypes/x-office-document.svg',
            
            // Spreadsheets
            'xls': '/icons/mimetypes/x-office-spreadsheet.svg',
            'xlsx': '/icons/mimetypes/x-office-spreadsheet.svg',
            'ods': '/icons/mimetypes/x-office-spreadsheet.svg',
            'csv': '/icons/mimetypes/text-csv.svg',
            
            // Presentations
            'ppt': '/icons/mimetypes/x-office-presentation.svg',
            'pptx': '/icons/mimetypes/x-office-presentation.svg',
            'odp': '/icons/mimetypes/x-office-presentation.svg',
            
            // Text files
            'txt': '/icons/mimetypes/text-plain.svg',
            'md': '/icons/mimetypes/text-plain.svg',
            'markdown': '/icons/mimetypes/text-plain.svg',
            'log': '/icons/mimetypes/text-plain.svg',
            'readme': '/icons/mimetypes/text-plain.svg',
            
            // Web files
            'html': '/icons/mimetypes/text-html.svg',
            'htm': '/icons/mimetypes/text-html.svg',
            'css': '/icons/mimetypes/text-css.svg',
            'scss': '/icons/mimetypes/text-css.svg',
            'sass': '/icons/mimetypes/text-css.svg',
            'less': '/icons/mimetypes/text-css.svg',
            
            // Programming languages
            'js': '/icons/mimetypes/application-javascript.svg',
            'jsx': '/icons/mimetypes/application-javascript.svg',
            'ts': '/icons/mimetypes/application-javascript.svg',
            'tsx': '/icons/mimetypes/application-javascript.svg',
            'py': '/icons/mimetypes/text-x-python.svg',
            'java': '/icons/mimetypes/text-x-java.svg',
            'c': '/icons/mimetypes/text-x-c.svg',
            'cpp': '/icons/mimetypes/text-x-csrc.svg',
            'cc': '/icons/mimetypes/text-x-csrc.svg',
            'cxx': '/icons/mimetypes/text-x-csrc.svg',
            'h': '/icons/mimetypes/text-x-c.svg',
            'hpp': '/icons/mimetypes/text-x-csrc.svg',
            'go': '/icons/mimetypes/text-x-script.svg',
            'rs': '/icons/mimetypes/text-x-script.svg',
            'php': '/icons/mimetypes/text-x-script.svg',
            'rb': '/icons/mimetypes/text-x-script.svg',
            'swift': '/icons/mimetypes/text-x-script.svg',
            'kt': '/icons/mimetypes/text-x-script.svg',
            'scala': '/icons/mimetypes/text-x-script.svg',
            'r': '/icons/mimetypes/text-x-script.svg',
            'sh': '/icons/mimetypes/shellscript.svg',
            'bash': '/icons/mimetypes/shellscript.svg',
            'zsh': '/icons/mimetypes/shellscript.svg',
            'fish': '/icons/mimetypes/shellscript.svg',
            
            // Data files
            'json': '/icons/mimetypes/application-json.svg',
            'xml': '/icons/mimetypes/application-xml.svg',
            'yaml': '/icons/mimetypes/application-yaml.svg',
            'yml': '/icons/mimetypes/application-yaml.svg',
            'toml': '/icons/mimetypes/text-x-generic.svg',
            'ini': '/icons/mimetypes/text-x-generic.svg',
            'conf': '/icons/mimetypes/text-x-generic.svg',
            'config': '/icons/mimetypes/text-x-generic.svg',
            
            // Images
            'jpg': '/icons/mimetypes/image-jpeg.svg',
            'jpeg': '/icons/mimetypes/image-jpeg.svg',
            'png': '/icons/mimetypes/image-png.svg',
            'gif': '/icons/mimetypes/image-gif.svg',
            'svg': '/icons/mimetypes/image-svg-xml.svg',
            'bmp': '/icons/mimetypes/image-x-generic.svg',
            'ico': '/icons/mimetypes/image-x-generic.svg',
            'webp': '/icons/mimetypes/image-x-generic.svg',
            'tiff': '/icons/mimetypes/image-x-generic.svg',
            'tif': '/icons/mimetypes/image-x-generic.svg',
            'psd': '/icons/mimetypes/image-x-generic.svg',
            'ai': '/icons/mimetypes/image-x-generic.svg',
            'eps': '/icons/mimetypes/image-x-generic.svg',
            
            // Audio
            'mp3': '/icons/mimetypes/audio-mpeg.svg',
            'wav': '/icons/mimetypes/audio-x-generic.svg',
            'flac': '/icons/mimetypes/audio-x-generic.svg',
            'aac': '/icons/mimetypes/audio-x-generic.svg',
            'ogg': '/icons/mimetypes/audio-x-generic.svg',
            'wma': '/icons/mimetypes/audio-x-generic.svg',
            'm4a': '/icons/mimetypes/audio-x-generic.svg',
            'opus': '/icons/mimetypes/audio-x-generic.svg',
            
            // Video
            'mp4': '/icons/mimetypes/video-mp4.svg',
            'avi': '/icons/mimetypes/video-x-generic.svg',
            'mkv': '/icons/mimetypes/video-x-generic.svg',
            'mov': '/icons/mimetypes/video-x-generic.svg',
            'wmv': '/icons/mimetypes/video-x-generic.svg',
            'flv': '/icons/mimetypes/video-x-generic.svg',
            'webm': '/icons/mimetypes/video-x-generic.svg',
            'm4v': '/icons/mimetypes/video-x-generic.svg',
            'mpg': '/icons/mimetypes/video-x-generic.svg',
            'mpeg': '/icons/mimetypes/video-x-generic.svg',
            '3gp': '/icons/mimetypes/video-x-generic.svg',
            
            // Archives
            'zip': '/icons/mimetypes/application-zip.svg',
            'rar': '/icons/mimetypes/application-x-archive.svg',
            '7z': '/icons/mimetypes/application-x-archive.svg',
            'tar': '/icons/mimetypes/application-x-tar.svg',
            'gz': '/icons/mimetypes/application-x-archive.svg',
            'bz2': '/icons/mimetypes/application-x-archive.svg',
            'xz': '/icons/mimetypes/application-x-archive.svg',
            'tgz': '/icons/mimetypes/application-x-tar.svg',
            'tbz': '/icons/mimetypes/application-x-tar.svg',
            'txz': '/icons/mimetypes/application-x-tar.svg',
            'cab': '/icons/mimetypes/package-x-generic.svg',
            
            // Executables
            'exe': '/icons/mimetypes/application-x-ms-dos-executable.svg',
            'msi': '/icons/mimetypes/application-x-ms-dos-executable.svg',
            'dll': '/icons/mimetypes/application-x-executable.svg',
            'so': '/icons/mimetypes/application-x-executable.svg',
            'dylib': '/icons/mimetypes/application-x-executable.svg',
            'app': '/icons/mimetypes/application-x-executable.svg',
            'deb': '/icons/mimetypes/package-x-generic.svg',
            'rpm': '/icons/mimetypes/package-x-generic.svg',
            'dmg': '/icons/mimetypes/package-x-generic.svg',
            'pkg': '/icons/mimetypes/package-x-generic.svg',
        };
        
        return extensionMap[ext] || '/icons/mimetypes/file-default.svg';
    }
    
    // Map MIME types to icon filenames
    static getMimeTypeIcon(mimeType) {
        if (!mimeType) return null;
        
        const mimeMap = {
            // Text
            'text/plain': '/icons/mimetypes/text-plain.svg',
            'text/html': '/icons/mimetypes/text-html.svg',
            'text/css': '/icons/mimetypes/text-css.svg',
            'text/csv': '/icons/mimetypes/text-csv.svg',
            'text/xml': '/icons/mimetypes/application-xml.svg',
            
            // Application
            'application/pdf': '/icons/mimetypes/application-pdf.svg',
            'application/json': '/icons/mimetypes/application-json.svg',
            'application/xml': '/icons/mimetypes/application-xml.svg',
            'application/zip': '/icons/mimetypes/application-zip.svg',
            'application/x-tar': '/icons/mimetypes/application-x-tar.svg',
            'application/x-gzip': '/icons/mimetypes/application-x-archive.svg',
            'application/x-bzip2': '/icons/mimetypes/application-x-archive.svg',
            'application/javascript': '/icons/mimetypes/application-javascript.svg',
            
            // Documents
            'application/msword': '/icons/mimetypes/x-office-document.svg',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '/icons/mimetypes/x-office-document.svg',
            'application/vnd.ms-excel': '/icons/mimetypes/x-office-spreadsheet.svg',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '/icons/mimetypes/x-office-spreadsheet.svg',
            'application/vnd.ms-powerpoint': '/icons/mimetypes/x-office-presentation.svg',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': '/icons/mimetypes/x-office-presentation.svg',
            
            // Images
            'image/jpeg': '/icons/mimetypes/image-jpeg.svg',
            'image/png': '/icons/mimetypes/image-png.svg',
            'image/gif': '/icons/mimetypes/image-gif.svg',
            'image/svg+xml': '/icons/mimetypes/image-svg-xml.svg',
            'image/webp': '/icons/mimetypes/image-x-generic.svg',
            'image/bmp': '/icons/mimetypes/image-x-generic.svg',
            'image/tiff': '/icons/mimetypes/image-x-generic.svg',
            
            // Audio
            'audio/mpeg': '/icons/mimetypes/audio-mpeg.svg',
            'audio/mp3': '/icons/mimetypes/audio-mpeg.svg',
            'audio/wav': '/icons/mimetypes/audio-x-generic.svg',
            'audio/ogg': '/icons/mimetypes/audio-x-generic.svg',
            'audio/webm': '/icons/mimetypes/audio-x-generic.svg',
            
            // Video
            'video/mp4': '/icons/mimetypes/video-mp4.svg',
            'video/mpeg': '/icons/mimetypes/video-x-generic.svg',
            'video/webm': '/icons/mimetypes/video-x-generic.svg',
            'video/ogg': '/icons/mimetypes/video-x-generic.svg',
            'video/quicktime': '/icons/mimetypes/video-x-generic.svg',
        };
        
        // Check exact match
        if (mimeMap[mimeType]) {
            return mimeMap[mimeType];
        }
        
        // Check by general type
        const [type] = mimeType.split('/');
        switch (type) {
            case 'text':
                return '/icons/mimetypes/text-x-generic.svg';
            case 'image':
                return '/icons/mimetypes/image-x-generic.svg';
            case 'audio':
                return '/icons/mimetypes/audio-x-generic.svg';
            case 'video':
                return '/icons/mimetypes/video-x-generic.svg';
            default:
                return null;
        }
    }
    
    // Create an img element for the icon
    static createIcon(fileName, isDir, mimeType) {
        const iconPath = this.getIconPath(fileName, isDir, mimeType);
        return `<img src="${iconPath}" alt="" class="file-icon w-5 h-5" />`;
    }
}