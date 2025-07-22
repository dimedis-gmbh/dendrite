// Utility functions for Dendrite file manager

// Format file size in human readable format
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    if (bytes < 0) return ''; // Directory
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date in Windows Explorer style
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays < 7) {
        return date.toLocaleDateString([], { weekday: 'short' }) + ' ' + 
               date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString([], { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
        });
    }
}

// Get file type from name
function getFileType(name, isDir) {
    if (isDir) return 'File folder';
    
    const ext = name.split('.').pop().toLowerCase();
    const types = {
        'txt': 'Text Document',
        'md': 'Markdown Document',
        'html': 'HTML Document',
        'css': 'CSS Document',
        'js': 'JavaScript File',
        'json': 'JSON File',
        'xml': 'XML Document',
        'pdf': 'PDF Document',
        'doc': 'Microsoft Word Document',
        'docx': 'Microsoft Word Document',
        'xls': 'Microsoft Excel Worksheet',
        'xlsx': 'Microsoft Excel Worksheet',
        'ppt': 'Microsoft PowerPoint Presentation',
        'pptx': 'Microsoft PowerPoint Presentation',
        'zip': 'ZIP Archive',
        'rar': 'RAR Archive',
        '7z': '7-Zip Archive',
        'tar': 'TAR Archive',
        'gz': 'GZIP Archive',
        'jpg': 'JPEG Image',
        'jpeg': 'JPEG Image',
        'png': 'PNG Image',
        'gif': 'GIF Image',
        'bmp': 'Bitmap Image',
        'svg': 'SVG Vector Image',
        'mp3': 'MP3 Audio',
        'wav': 'WAV Audio',
        'mp4': 'MP4 Video',
        'avi': 'AVI Video',
        'mov': 'QuickTime Video',
        'go': 'Go Source File',
        'py': 'Python File',
        'java': 'Java Source File',
        'c': 'C Source File',
        'cpp': 'C++ Source File',
        'h': 'Header File',
        'yaml': 'YAML Document',
        'yml': 'YAML Document'
    };
    
    return types[ext] || ext.toUpperCase() + ' File';
}

// Join paths properly
function joinPath(...parts) {
    return parts
        .map(part => part.toString().replace(/^\/+|\/+$/g, ''))
        .filter(part => part.length > 0)
        .join('/') || '/';
}

// Get parent path
function getParentPath(path) {
    if (path === '/' || path === '') return '';
    const parts = path.split('/').filter(p => p);
    parts.pop();
    return parts.length ? '/' + parts.join('/') : '/';
}

// Get filename from path
function getFileName(path) {
    return path.split('/').pop() || '';
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show loading overlay
function showLoading() {
    document.getElementById('loading').classList.remove('hidden');
}

// Hide loading overlay
function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

// Show error message
function showError(message) {
    alert('Error: ' + message); // Simple error display for now
}

// Show success message
function showSuccess(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #4CAF50;
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        z-index: 10000;
        font-size: 14px;
        max-width: 300px;
    `;
    
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 3000);
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check if quota is exceeded
function isQuotaExceeded(quota) {
    return quota.limit > 0 && quota.exceeded;
}

// Get quota percentage
function getQuotaPercentage(quota) {
    if (quota.limit <= 0) return 0;
    return Math.round((quota.used / quota.limit) * 100);
}