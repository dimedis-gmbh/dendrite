// API client for Dendrite file manager
class DendriteAPI {
    constructor() {
        this.baseURL = '/api';
    }

    async request(url, options = {}) {
        try {
            const response = await fetch(this.baseURL + url, options);
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`HTTP ${response.status}: ${error}`);
            }
            return response;
        } catch (error) {
            console.error('API request failed:', url, error);
            throw error;
        }
    }

    async requestJSON(url, options = {}) {
        const response = await this.request(url, options);
        try {
            return await response.json();
        } catch (error) {
            console.error('Failed to parse JSON response:', error);
            throw new Error('Invalid JSON response from server');
        }
    }

    // List files in directory
    async listFiles(path = '') {
        const params = path ? `?path=${encodeURIComponent(path)}` : '';
        return this.requestJSON(`/files${params}`);
    }

    // Get quota information
    async getQuota() {
        return this.requestJSON('/quota');
    }

    // Get file statistics
    async getFileStat(path) {
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
        return this.requestJSON(`/files/${encodeURIComponent(normalizedPath)}/stat`);
    }

    // Download file
    async downloadFile(path) {
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
        return this.request(`/files/${encodeURIComponent(normalizedPath)}`);
    }

    // Upload file
    async uploadFile(path, file) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('path', path || '/');

        return this.requestJSON('/files', {
            method: 'POST',
            body: formData
        });
    }

    // Delete file or directory
    async deleteFile(path) {
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
        return this.requestJSON(`/files/${encodeURIComponent(normalizedPath)}`, {
            method: 'DELETE'
        });
    }

    // Move file or directory
    async moveFile(sourcePath, destPath) {
        // Normalize paths - remove leading slash for API URL construction
        const normalizedSourcePath = sourcePath.startsWith('/') ? sourcePath.substring(1) : sourcePath;
        const normalizedDestPath = destPath.startsWith('/') ? destPath.substring(1) : destPath;
        
        return this.requestJSON(`/files/${encodeURIComponent(normalizedSourcePath)}/move`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ destPath: normalizedDestPath })
        });
    }

    // Copy file or directory
    async copyFile(sourcePath, destPath) {
        // Normalize paths - remove leading slash for API URL construction
        const normalizedSourcePath = sourcePath.startsWith('/') ? sourcePath.substring(1) : sourcePath;
        const normalizedDestPath = destPath.startsWith('/') ? destPath.substring(1) : destPath;
        
        return this.requestJSON(`/files/${encodeURIComponent(normalizedSourcePath)}/copy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ destPath: normalizedDestPath })
        });
    }

    // Download multiple files as ZIP
    async downloadZip(paths, name = 'download.zip') {
        const response = await this.request('/download/zip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ paths, name })
        });

        // Create download link
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }

    // Create new folder
    async createFolder(path) {
        return this.requestJSON('/mkdir', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ path })
        });
    }
}