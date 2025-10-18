// API client for Dendrite file manager
class DendriteAPI {
    constructor() {
        this.baseURL = '/api';
    }

    async request(url, options = {}) {
        try {
            // Add JWT token to headers if available
            const jwt = localStorage.getItem('dendrite_jwt');
            if (jwt) {
                // Check if JWT has expired
                const expiryStr = localStorage.getItem('dendrite_jwt_expires');
                if (expiryStr) {
                    const expiry = parseInt(expiryStr);
                    if (Date.now() > expiry) {
                        // JWT has expired
                        localStorage.removeItem('dendrite_jwt');
                        localStorage.removeItem('dendrite_jwt_claims');
                        localStorage.removeItem('dendrite_jwt_expires');
                        throw new Error('Session expired. Please authenticate again.');
                    }
                }
                
                // Add Authorization header
                if (!options.headers) {
                    options.headers = {};
                }
                options.headers['Authorization'] = `Bearer ${jwt}`;
            }
            
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

    async getFileExif(path) {
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
        return this.requestJSON(`/files/${encodeURIComponent(normalizedPath)}/exif`);
    }

    // Download file
    async downloadFile(path, { inline = false } = {}) {
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
        let endpoint = `/files/${encodeURIComponent(normalizedPath)}`;
        if (inline) {
            endpoint += '?inline=1';
        }
        return this.request(endpoint);
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
        return this.postFileMutation('move', sourcePath, destPath);
    }

    // Copy file or directory
    async copyFile(sourcePath, destPath) {
        return this.postFileMutation('copy', sourcePath, destPath);
    }

    normalizeApiPath(path = '') {
        return path.startsWith('/') ? path.substring(1) : path;
    }

    async postFileMutation(action, sourcePath, destPath) {
        const normalizedSourcePath = this.normalizeApiPath(sourcePath);
        const normalizedDestPath = this.normalizeApiPath(destPath);

        return this.requestJSON(`/files/${encodeURIComponent(normalizedSourcePath)}/${action}`, {
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
