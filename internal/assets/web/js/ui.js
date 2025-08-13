// UI management and event handlers
class UI {
    constructor(api) {
        this.api = api;
        this.currentPath = '/';
        this.selectedFiles = new Set();
        this.sortColumn = 'name';
        this.sortDirection = 'asc';
        
        this.initEventListeners();
        this.initBrowserHistory();
    }
    
    initEventListeners() {
        // Toolbar buttons
        document.getElementById('btn-back').addEventListener('click', () => this.navigateBack());
        document.getElementById('btn-up').addEventListener('click', () => this.navigateUp());
        document.getElementById('btn-refresh').addEventListener('click', () => this.refresh());
        document.getElementById('btn-upload').addEventListener('click', () => this.showUploadModal());
        document.getElementById('btn-new-folder').addEventListener('click', () => this.createNewFolder());
        document.getElementById('btn-download').addEventListener('click', () => this.downloadSelected());
        document.getElementById('btn-download-zip').addEventListener('click', () => this.downloadSelectedAsZip());
        
        // File list events
        document.getElementById('select-all').addEventListener('change', (e) => this.selectAll(e.target.checked));
        document.getElementById('file-list-body').addEventListener('click', (e) => this.handleFileClick(e));
        document.getElementById('file-list-body').addEventListener('dblclick', (e) => this.handleFileDoubleClick(e));
        document.getElementById('file-list-body').addEventListener('contextmenu', (e) => this.showContextMenu(e));
        
        // Also add context menu to the container for white space/empty area right-clicks
        document.getElementById('file-list-container').addEventListener('contextmenu', (e) => this.showContextMenu(e));
        
        // Handle checkbox clicks specifically
        document.getElementById('file-list-body').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox' && e.target.classList.contains('file-checkbox')) {
                this.handleCheckboxChange(e);
            }
        });
        
        // Column sorting
        document.querySelectorAll('#file-list th[data-sort]').forEach(th => {
            th.addEventListener('click', () => this.sortBy(th.dataset.sort));
        });
        
        // Context menu
        document.addEventListener('click', () => this.hideContextMenu());
        document.getElementById('context-menu').addEventListener('click', (e) => this.handleContextMenuAction(e));
        
        // Upload modal
        this.setupUploadModal();
        
        // Properties modal
        this.setupPropertiesModal();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Drag and drop for file upload
        this.setupDragAndDrop();
        
        // Handle JWT authentication if present
        this.handleJWTAuthentication();
        
        // Listen for hash changes to handle new JWT tokens
        window.addEventListener('hashchange', () => {
            // Check if there's a new JWT in the hash
            const newToken = this.extractJWTFromURL();
            if (newToken) {
                // Clear any existing session
                this.clearJWTStorage();
                // Handle the new JWT
                this.handleJWTAuthentication();
                // Reload the file list with new credentials
                this.loadFiles('/');
            }
        });
    }
    
    extractJWTFromURL() {
        // Check URL hash (secure - doesn't get sent to server)
        const hash = window.location.hash.substring(1); // Remove leading #
        if (hash && hash.split('.').length === 3) {
            return hash;
        }
        return null;
    }
    
    parseJWT(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;
            
            const payload = parts[1];
            const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decoded);
        } catch (error) {
            console.error('Failed to parse JWT:', error);
            return null;
        }
    }
    
    handleJWTAuthentication() {
        const jwtToken = this.extractJWTFromURL();
        if (!jwtToken) {
            // Check if JWT is already stored in localStorage
            this.checkStoredJWT();
            return;
        }
        
        // Parse JWT to extract claims
        const claims = this.parseJWT(jwtToken);
        if (!claims) {
            showError('Invalid JWT token');
            return;
        }
        
        // Store JWT and claims in localStorage
        localStorage.setItem('dendrite_jwt', jwtToken);
        localStorage.setItem('dendrite_jwt_claims', JSON.stringify(claims));
        
        // Calculate expiry timestamp
        let expiryTimestamp = null;
        if (claims.expires) {
            expiryTimestamp = new Date(claims.expires).getTime();
        } else if (claims.exp) {
            // Standard JWT exp claim (seconds since epoch)
            expiryTimestamp = claims.exp * 1000;
        }
        
        if (expiryTimestamp) {
            localStorage.setItem('dendrite_jwt_expires', expiryTimestamp.toString());
        }
        
        // Remove JWT from URL hash to prevent it from being bookmarked
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Update session display
        this.updateSessionDisplay();
    }
    
    checkStoredJWT() {
        const storedJWT = localStorage.getItem('dendrite_jwt');
        const expiryStr = localStorage.getItem('dendrite_jwt_expires');
        
        if (!storedJWT) return;
        
        // Check if JWT has expired
        if (expiryStr) {
            const expiry = parseInt(expiryStr);
            if (Date.now() > expiry) {
                // JWT has expired, clear storage
                this.clearJWTStorage();
                showError('Session expired. Please authenticate again.');
                return;
            }
        }
        
        // Update session display
        this.updateSessionDisplay();
    }
    
    clearJWTStorage() {
        localStorage.removeItem('dendrite_jwt');
        localStorage.removeItem('dendrite_jwt_claims');
        localStorage.removeItem('dendrite_jwt_expires');
        
        // Clear session update interval
        if (this.sessionUpdateInterval) {
            clearInterval(this.sessionUpdateInterval);
            this.sessionUpdateInterval = null;
        }
        
        // Hide session info
        const sessionInfo = document.getElementById('session-info');
        if (sessionInfo) {
            sessionInfo.classList.add('hidden');
        }
    }
    
    updateSessionDisplay() {
        const expiryStr = localStorage.getItem('dendrite_jwt_expires');
        const sessionInfo = document.getElementById('session-info');
        const sessionText = document.getElementById('session-text');
        const sessionAlert = document.getElementById('session-alert');
        
        if (!expiryStr || !sessionInfo || !sessionText) {
            if (sessionInfo) {
                sessionInfo.classList.add('hidden');
            }
            return;
        }
        
        const expiry = parseInt(expiryStr);
        const now = Date.now();
        
        if (now > expiry) {
            this.clearJWTStorage();
            showError('Session expired. Please authenticate again.');
            sessionInfo.classList.add('hidden');
            return;
        }
        
        // Calculate time remaining
        const remaining = expiry - now;
        const totalSeconds = Math.floor(remaining / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        // Format the display string
        let timeStr;
        if (days > 0) {
            const remainingHours = hours % 24;
            if (remainingHours > 0) {
                timeStr = `${days} day${days > 1 ? 's' : ''} ${remainingHours} hour${remainingHours > 1 ? 's' : ''}`;
            } else {
                timeStr = `${days} day${days > 1 ? 's' : ''}`;
            }
        } else if (hours > 0) {
            const remainingMinutes = minutes % 60;
            if (remainingMinutes > 0) {
                timeStr = `${hours} hour${hours > 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''}`;
            } else {
                timeStr = `${hours} hour${hours > 1 ? 's' : ''}`;
            }
        } else if (minutes > 0) {
            timeStr = `${minutes} minute${minutes > 1 ? 's' : ''}`;
        } else {
            timeStr = 'less than a minute';
        }
        
        sessionText.textContent = `Session expires in ${timeStr}`;
        sessionInfo.classList.remove('hidden');
        
        // Show/hide alert icon for 5 minutes or less
        if (sessionAlert) {
            if (minutes <= 5) {
                sessionAlert.classList.remove('hidden');
                // Change text color to match alert
                sessionText.style.color = '#ff6b6b';
            } else {
                sessionAlert.classList.add('hidden');
                // Reset text color
                sessionText.style.color = '';
            }
        }
        
        // Set up periodic updates
        if (!this.sessionUpdateInterval) {
            this.sessionUpdateInterval = setInterval(() => this.updateSessionDisplay(), 60000); // Update every minute
        }
    }
    
    initBrowserHistory() {
        // Handle browser back/forward buttons
        window.addEventListener('popstate', (e) => {
            const path = this.getPathFromURL();
            this.loadFiles(path, false); // false = don't push to history again
        });
        
        // Set initial path from URL
        const initialPath = this.getPathFromURL();
        if (initialPath !== '/') {
            this.currentPath = initialPath;
        }
    }
    
    getPathFromURL() {
        // First check if there's a JWT token in the URL
        const jwtToken = this.extractJWTFromURL();
        if (jwtToken) {
            return '/'; // JWT paths always start at root
        }
        
        // First try to get path from URL pathname
        let path = window.location.pathname;
        
        // If pathname is just '/', check for legacy query parameter format
        if (path === '/' || path === '') {
            const urlParams = new URLSearchParams(window.location.search);
            const queryPath = urlParams.get('path');
            if (queryPath) {
                return queryPath;
            }
        }
        
        // Convert URL pathname to internal path format
        if (path === '/' || path === '') {
            return '/';
        }
        
        // Remove leading slash to match internal path format
        // For paths like '/internal/config', we want 'internal/config'
        if (path.startsWith('/')) {
            path = path.substring(1);
        }
        
        // Internal paths should not be empty, if empty return root
        return path || '/';
    }
    
    updateURL(path) {
        let urlPath;
        
        if (path === '/' || path === '') {
            urlPath = '/';
        } else {
            // Ensure path starts with / for URL
            urlPath = path.startsWith('/') ? path : '/' + path;
        }
        
        // Use clean path-based URLs
        const url = new URL(window.location.origin + urlPath);
        window.history.pushState({ path }, '', url);
    }
    
    async refresh() {
        await this.loadFiles(this.currentPath);
        await this.updateQuotaInfo();
    }
    
    async loadFiles(path, updateHistory = true) {
        try {
            showLoading();
            console.log('Loading files for path:', path);
            const files = await this.api.listFiles(path);
            console.log('Received files:', files);
            
            if (!Array.isArray(files)) {
                throw new Error('Invalid response: expected array of files');
            }
            
            this.currentPath = path;
            this.selectedFiles.clear();
            this.renderFileList(files);
            this.updatePathDisplay();
            this.updateToolbar();
            this.updateSortIndicators();
            
            // Update browser URL and history
            if (updateHistory) {
                this.updateURL(path);
            }
        } catch (error) {
            console.error('Failed to load files:', error);
            showError('Failed to load files: ' + error.message);
        } finally {
            hideLoading();
        }
    }
    
    renderFileList(files) {
        const tbody = document.getElementById('file-list-body');
        tbody.innerHTML = '';
        
        // Sort files
        const sortedFiles = this.sortFiles(files);
        
        sortedFiles.forEach(file => {
            const row = document.createElement('tr');
            row.className = 'file-row';
            row.dataset.path = file.path;
            row.dataset.isDir = file.isDir;
            row.dataset.size = file.size || 0;
            row.dataset.modTime = file.modTime || '';
            
            row.innerHTML = `
                <td class="col-select">
                    <input type="checkbox" class="file-checkbox" data-path="${escapeHtml(file.path)}">
                </td>
                <td class="col-icon">
                    ${FileIcons.createIcon(file.name, file.isDir)}
                </td>
                <td class="col-name" title="${escapeHtml(file.name)}">
                    ${escapeHtml(file.name)}
                </td>
                <td class="col-size">${formatFileSize(file.size)}</td>
                <td class="col-type">${escapeHtml(getFileType(file.name, file.isDir))}</td>
                <td class="col-modified" title="${new Date(file.modTime).toLocaleString()}">
                    ${formatDate(file.modTime)}
                </td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Update clipboard UI
        if (window.clipboard) {
            window.clipboard.updateUI();
        }
    }
    
    sortFiles(files) {
        return [...files].sort((a, b) => {
            // Directories first
            if (a.isDir !== b.isDir) {
                return a.isDir ? -1 : 1;
            }
            
            let aVal, bVal;
            switch (this.sortColumn) {
                case 'name':
                    aVal = a.name.toLowerCase();
                    bVal = b.name.toLowerCase();
                    break;
                case 'size':
                    aVal = a.size;
                    bVal = b.size;
                    break;
                case 'type':
                    aVal = getFileType(a.name, a.isDir);
                    bVal = getFileType(b.name, b.isDir);
                    break;
                case 'modified':
                    aVal = new Date(a.modTime);
                    bVal = new Date(b.modTime);
                    break;
                default:
                    return 0;
            }
            
            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    sortBy(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        
        // Update column headers to show sort direction
        this.updateSortIndicators();
        
        // Reload current files with new sort
        const currentFiles = Array.from(document.querySelectorAll('.file-row')).map(row => ({
            name: row.querySelector('.col-name').textContent.trim(),
            path: row.dataset.path,
            isDir: row.dataset.isDir === 'true',
            size: parseInt(row.dataset.size || '0', 10),
            modTime: row.dataset.modTime
        }));
        
        
        if (currentFiles.length > 0) {
            this.renderFileList(currentFiles);
        }
    }
    
    updateSortIndicators() {
        // Remove existing sort indicators
        document.querySelectorAll('#file-list th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        
        // Add sort indicator to current column
        const currentTh = document.querySelector(`#file-list th[data-sort="${this.sortColumn}"]`);
        if (currentTh) {
            currentTh.classList.add(this.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    }
    
    updatePathDisplay() {
        document.getElementById('path-display').textContent = this.currentPath || '/';
    }
    
    updateToolbar() {
        const backBtn = document.getElementById('btn-back');
        const upBtn = document.getElementById('btn-up');
        
        backBtn.disabled = this.currentPath === '/';
        upBtn.disabled = this.currentPath === '/';
    }
    
    async updateQuotaInfo() {
        try {
            const quota = await this.api.getQuota();
            const quotaText = document.getElementById('quota-text');
            const quotaFill = document.getElementById('quota-fill');
            
            if (quota.limit > 0) {
                const percentage = getQuotaPercentage(quota);
                quotaText.textContent = `${formatFileSize(quota.used)} / ${formatFileSize(quota.limit)} (${percentage}%)`;
                quotaFill.style.width = percentage + '%';
                
                // Update colors based on usage
                quotaFill.className = '';
                if (percentage > 90) {
                    quotaFill.classList.add('danger');
                } else if (percentage > 75) {
                    quotaFill.classList.add('warning');
                }
            } else {
                quotaText.textContent = `${formatFileSize(quota.used)} (no limit)`;
                quotaFill.style.width = '0%';
            }
        } catch (error) {
            console.error('Failed to update quota info:', error);
        }
    }
    
    // File selection methods
    handleFileClick(e) {
        // Don't handle clicks on checkboxes - let them work naturally
        if (e.target.type === 'checkbox') {
            return;
        }
        
        e.preventDefault();
        const row = e.target.closest('.file-row');
        if (!row) return;
        
        const checkbox = row.querySelector('.file-checkbox');
        const path = row.dataset.path;
        
        if (e.ctrlKey || e.metaKey) {
            // Toggle selection
            this.toggleFileSelection(path, row, checkbox);
        } else if (e.shiftKey && this.selectedFiles.size > 0) {
            // Range selection (simplified)
            this.toggleFileSelection(path, row, checkbox);
        } else {
            // Single selection
            this.clearSelection();
            this.toggleFileSelection(path, row, checkbox);
        }
    }
    
    handleFileDoubleClick(e) {
        const row = e.target.closest('.file-row');
        if (!row) return;
        
        const path = row.dataset.path;
        const isDir = row.dataset.isDir === 'true';
        
        if (isDir) {
            // Navigate into directory
            this.loadFiles(path);
        } else {
            // For files, double-click shows properties (could be changed to do nothing)
            this.showProperties(path);
        }
    }
    
    handleCheckboxChange(e) {
        const checkbox = e.target;
        const row = checkbox.closest('.file-row');
        if (!row) return;
        
        const path = checkbox.dataset.path;
        
        if (checkbox.checked) {
            this.selectedFiles.add(path);
            row.classList.add('selected');
        } else {
            this.selectedFiles.delete(path);
            row.classList.remove('selected');
        }
        
        this.updateSelectAllCheckbox();
    }
    
    toggleFileSelection(path, row, checkbox) {
        if (this.selectedFiles.has(path)) {
            this.selectedFiles.delete(path);
            row.classList.remove('selected');
            checkbox.checked = false;
        } else {
            this.selectedFiles.add(path);
            row.classList.add('selected');
            checkbox.checked = true;
        }
        
        this.updateSelectAllCheckbox();
    }
    
    clearSelection() {
        this.selectedFiles.clear();
        document.querySelectorAll('.file-row').forEach(row => {
            row.classList.remove('selected');
            row.querySelector('.file-checkbox').checked = false;
        });
        this.updateSelectAllCheckbox();
    }
    
    selectAll(checked) {
        document.querySelectorAll('.file-row').forEach(row => {
            const path = row.dataset.path;
            const checkbox = row.querySelector('.file-checkbox');
            
            if (checked) {
                this.selectedFiles.add(path);
                row.classList.add('selected');
                checkbox.checked = true;
            } else {
                this.selectedFiles.delete(path);
                row.classList.remove('selected');
                checkbox.checked = false;
            }
        });
    }
    
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all');
        const totalFiles = document.querySelectorAll('.file-row').length;
        const selectedCount = this.selectedFiles.size;
        
        selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalFiles;
        selectAllCheckbox.checked = selectedCount === totalFiles && totalFiles > 0;
    }
    
    // Navigation methods
    navigateBack() {
        // Use browser history to go back
        if (window.history.length > 1) {
            window.history.back();
        } else {
            // Fallback to going up if no history
            this.navigateUp();
        }
    }
    
    navigateUp() {
        const parentPath = getParentPath(this.currentPath);
        if (parentPath !== this.currentPath) {
            this.loadFiles(parentPath);
        }
    }
    
    // File operations
    async downloadFile(path) {
        try {
            const response = await this.api.downloadFile(path);
            const blob = await response.blob();
            
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = getFileName(path);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            showError('Failed to download file: ' + error.message);
        }
    }
    
    async downloadSelectedAsZip() {
        if (this.selectedFiles.size === 0) {
            showError('No files selected. Please select files or folders to download.');
            return;
        }
        
        try {
            const paths = Array.from(this.selectedFiles);
            console.log('Downloading selected files as ZIP:', paths);
            await this.api.downloadZip(paths, 'selected-files.zip');
            showSuccess(`Downloaded ${paths.length} items as ZIP file`);
        } catch (error) {
            showError('Failed to download ZIP: ' + error.message);
        }
    }
    
    async downloadSelected() {
        if (this.selectedFiles.size === 0) {
            showError('No files selected. Please select files to download.');
            return;
        }
        
        if (this.selectedFiles.size === 1) {
            // Single file download
            const path = Array.from(this.selectedFiles)[0];
            const row = document.querySelector(`[data-path="${path}"]`);
            const isDir = row.dataset.isDir === 'true';
            
            if (isDir) {
                // Download folder as ZIP
                await this.downloadSelectedAsZip();
            } else {
                // Download single file
                await this.downloadFile(path);
            }
        } else {
            // Multiple files - download as ZIP
            await this.downloadSelectedAsZip();
        }
    }
    
    // Context menu methods
    showContextMenu(e) {
        e.preventDefault();
        
        const row = e.target.closest('.file-row');
        if (row && !this.selectedFiles.has(row.dataset.path)) {
            // If clicking on a file row that isn't selected, select it
            this.clearSelection();
            this.toggleFileSelection(row.dataset.path, row, row.querySelector('.file-checkbox'));
        } else if (!row) {
            // If clicking in white space (no file row), clear any existing selection
            // This allows context menu operations like "Paste" in empty areas
            this.clearSelection();
        }
        
        // Update context menu items based on selection
        this.updateContextMenuItems();
        
        const contextMenu = document.getElementById('context-menu');
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        contextMenu.classList.remove('hidden');
    }
    
    updateContextMenuItems() {
        const openItem = document.querySelector('[data-action="open"]');
        const renameItem = document.querySelector('[data-action="rename"]');
        const propertiesItem = document.querySelector('[data-action="properties"]');
        const selectedPaths = Array.from(this.selectedFiles);
        
        // Reset all items to enabled state
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('disabled');
        });
        
        // Disable "Open" for files (only enable for folders)
        if (selectedPaths.length === 1) {
            const row = document.querySelector(`[data-path="${selectedPaths[0]}"]`);
            if (row && row.dataset.isDir !== 'true') {
                openItem.classList.add('disabled');
            }
        } else if (selectedPaths.length > 1) {
            // Disable "Open" for multiple selections
            openItem.classList.add('disabled');
            // Also disable rename and properties for multiple selections
            renameItem.classList.add('disabled');
            propertiesItem.classList.add('disabled');
        }
    }
    
    hideContextMenu() {
        document.getElementById('context-menu').classList.add('hidden');
    }
    
    async handleContextMenuAction(e) {
        const action = e.target.dataset.action;
        if (!action) return;
        
        // Don't process if the menu item is disabled
        if (e.target.classList.contains('disabled')) return;
        
        this.hideContextMenu();
        
        const selectedPaths = Array.from(this.selectedFiles);
        if (selectedPaths.length === 0 && action !== 'paste') return;
        
        switch (action) {
            case 'open':
                if (selectedPaths.length === 1) {
                    const row = document.querySelector(`[data-path="${selectedPaths[0]}"]`);
                    if (row.dataset.isDir === 'true') {
                        this.loadFiles(selectedPaths[0]);
                    }
                    // Note: We no longer download files on "open" action
                }
                break;
                
            case 'download':
                if (selectedPaths.length === 1) {
                    this.downloadFile(selectedPaths[0]);
                } else {
                    this.downloadSelectedAsZip();
                }
                break;
                
            case 'cut':
                window.clipboard.cut(selectedPaths);
                break;
                
            case 'copy':
                window.clipboard.copy(selectedPaths);
                break;
                
            case 'paste':
                await this.pasteFiles();
                break;
                
            case 'delete':
                await this.deleteSelectedFiles();
                break;
                
            case 'rename':
                if (selectedPaths.length === 1) {
                    this.renameFile(selectedPaths[0]);
                }
                break;
                
            case 'properties':
                if (selectedPaths.length === 1) {
                    this.showProperties(selectedPaths[0]);
                }
                break;
        }
    }
    
    // Placeholder methods for advanced features
    setupUploadModal() {
        const modal = document.getElementById('upload-modal');
        const closeBtn = modal.querySelector('.close');
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const progressContainer = document.getElementById('upload-progress');
        const progressFill = progressContainer.querySelector('.progress-fill');
        const uploadStatus = document.getElementById('upload-status');
        
        // Close modal handlers
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            this.resetUploadModal();
        });
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                this.resetUploadModal();
            }
        });
        
        // Drop zone click to select files
        dropZone.addEventListener('click', () => {
            fileInput.click();
        });
        
        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.uploadFiles(Array.from(e.target.files));
            }
        });
        
        // Drag and drop events
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) {
                this.uploadFiles(files);
            }
        });
    }
    
    resetUploadModal() {
        const fileInput = document.getElementById('file-input');
        const progressContainer = document.getElementById('upload-progress');
        const dropZone = document.getElementById('drop-zone');
        
        fileInput.value = '';
        progressContainer.classList.add('hidden');
        dropZone.classList.remove('dragover');
    }
    
    async uploadFiles(files) {
        const progressContainer = document.getElementById('upload-progress');
        const progressFill = progressContainer.querySelector('.progress-fill');
        const uploadStatus = document.getElementById('upload-status');
        
        progressContainer.classList.remove('hidden');
        
        let uploadedCount = 0;
        const totalFiles = files.length;
        
        for (const file of files) {
            try {
                uploadStatus.textContent = `Uploading ${file.name}... (${uploadedCount + 1}/${totalFiles})`;
                
                const result = await this.api.uploadFile(this.currentPath, file);
                uploadedCount++;
                
                const progress = (uploadedCount / totalFiles) * 100;
                progressFill.style.width = progress + '%';
                
                console.log('Uploaded file:', result);
                
            } catch (error) {
                showError(`Failed to upload ${file.name}: ${error.message}`);
            }
        }
        
        if (uploadedCount > 0) {
            showSuccess(`Successfully uploaded ${uploadedCount} file(s)`);
            await this.refresh(); // Reload file list
        }
        
        // Close modal after successful upload
        setTimeout(() => {
            document.getElementById('upload-modal').classList.add('hidden');
            this.resetUploadModal();
        }, 1500);
    }
    
    setupPropertiesModal() {
        const modal = document.getElementById('properties-modal');
        const closeBtn = modal.querySelector('.close');
        
        closeBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        });
    }
    
    setupDragAndDrop() {
        const fileListContainer = document.getElementById('file-list-container');
        
        // Prevent default drag behavior on the entire file list area
        fileListContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileListContainer.style.backgroundColor = '#f8f8ff';
        });
        
        fileListContainer.addEventListener('dragleave', (e) => {
            // Only reset if leaving the container entirely
            if (!fileListContainer.contains(e.relatedTarget)) {
                fileListContainer.style.backgroundColor = '';
            }
        });
        
        fileListContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            fileListContainer.style.backgroundColor = '';
            
            if (e.dataTransfer.files.length > 0) {
                const files = Array.from(e.dataTransfer.files);
                this.uploadFiles(files);
            }
        });
        
        // Also prevent default on body to avoid browser default behavior
        document.body.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        document.body.addEventListener('drop', (e) => {
            e.preventDefault();
        });
    }
    
    handleKeyboard(e) {
        // Only handle keyboard shortcuts when not in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }
        
        const isCtrlOrCmd = e.ctrlKey || e.metaKey;
        
        switch (e.key) {
            case 'x':
            case 'X':
                if (isCtrlOrCmd && this.selectedFiles.size > 0) {
                    e.preventDefault();
                    const selectedPaths = Array.from(this.selectedFiles);
                    window.clipboard.cut(selectedPaths);
                    showSuccess(`Cut ${selectedPaths.length} item(s)`);
                }
                break;
                
            case 'c':
            case 'C':
                if (isCtrlOrCmd && this.selectedFiles.size > 0) {
                    e.preventDefault();
                    const selectedPaths = Array.from(this.selectedFiles);
                    window.clipboard.copy(selectedPaths);
                    showSuccess(`Copied ${selectedPaths.length} item(s)`);
                }
                break;
                
            case 'v':
            case 'V':
                if (isCtrlOrCmd && !window.clipboard.isEmpty()) {
                    e.preventDefault();
                    this.pasteFiles();
                }
                break;
                
            case 'Delete':
            case 'Backspace':
                if (e.key === 'Delete' && this.selectedFiles.size > 0) {
                    e.preventDefault();
                    this.deleteSelectedFiles();
                }
                break;
                
            case 'a':
            case 'A':
                if (isCtrlOrCmd) {
                    e.preventDefault();
                    const selectAllCheckbox = document.getElementById('select-all');
                    selectAllCheckbox.checked = true;
                    // Trigger the change event to ensure proper handling
                    selectAllCheckbox.dispatchEvent(new Event('change'));
                }
                break;
                
            case 'F2':
                if (this.selectedFiles.size === 1) {
                    e.preventDefault();
                    const selectedPath = Array.from(this.selectedFiles)[0];
                    this.renameFile(selectedPath);
                }
                break;
                
            case 'F5':
                e.preventDefault();
                this.refresh();
                break;
                
            case 'Escape':
                // Close any open modals
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.classList.add('hidden');
                });
                // Clear selection
                this.clearSelection();
                break;
        }
    }
    
    async pasteFiles() {
        if (window.clipboard.isEmpty()) {
            showError('Nothing to paste.');
            return;
        }
        
        const items = window.clipboard.getItems();
        const operation = window.clipboard.getOperation();
        
        if (items.length === 0) return;
        
        try {
            showLoading();
            
            let successCount = 0;
            const errors = [];
            
            for (const sourcePath of items) {
                try {
                    const fileName = getFileName(sourcePath);
                    const destPath = joinPath(this.currentPath, fileName);
                    
                    if (operation === 'cut') {
                        await this.api.moveFile(sourcePath, destPath);
                        successCount++;
                    } else if (operation === 'copy') {
                        await this.api.copyFile(sourcePath, destPath);
                        successCount++;
                    }
                } catch (error) {
                    errors.push(`${getFileName(sourcePath)}: ${error.message}`);
                }
            }
            
            if (successCount > 0) {
                const action = operation === 'cut' ? 'moved' : 'copied';
                showSuccess(`Successfully ${action} ${successCount} item(s)`);
                
                // Clear clipboard after cut operation
                if (operation === 'cut') {
                    window.clipboard.clear();
                }
                
                await this.refresh();
            }
            
            if (errors.length > 0) {
                const action = operation === 'cut' ? 'move' : 'copy';
                showError(`Failed to ${action} some files:\n${errors.join('\n')}`);
            }
            
        } catch (error) {
            const action = operation === 'cut' ? 'move' : 'copy';
            showError(`${action} operation failed: ${error.message}`);
        } finally {
            hideLoading();
        }
    }
    
    async deleteSelectedFiles() {
        if (this.selectedFiles.size === 0) {
            showError('No files selected for deletion.');
            return;
        }
        
        const selectedPaths = Array.from(this.selectedFiles);
        const fileCount = selectedPaths.length;
        
        // Confirmation dialog
        const confirmed = confirm(`Are you sure you want to delete ${fileCount} item(s)? This action cannot be undone.`);
        if (!confirmed) return;
        
        let deletedCount = 0;
        const errors = [];
        
        try {
            showLoading();
            
            for (const path of selectedPaths) {
                try {
                    await this.api.deleteFile(path);
                    deletedCount++;
                } catch (error) {
                    errors.push(`${getFileName(path)}: ${error.message}`);
                }
            }
            
            if (deletedCount > 0) {
                showSuccess(`Successfully deleted ${deletedCount} item(s)`);
                this.clearSelection();
                await this.refresh();
            }
            
            if (errors.length > 0) {
                showError(`Failed to delete some files:\n${errors.join('\n')}`);
            }
            
        } catch (error) {
            showError(`Delete operation failed: ${error.message}`);
        } finally {
            hideLoading();
        }
    }
    
    async renameFile(path) {
        const currentName = getFileName(path);
        const newName = prompt('Enter new name:', currentName);
        
        if (!newName || newName.trim() === '') {
            return; // User cancelled or entered empty name
        }
        
        const trimmedName = newName.trim();
        
        // Validation: prevent path changes (no slashes allowed)
        if (trimmedName.includes('/') || trimmedName.includes('\\')) {
            showError('File/folder name cannot contain / or \\ characters.');
            return;
        }
        
        // Check if name actually changed
        if (trimmedName === currentName) {
            return; // No change
        }
        
        try {
            showLoading();
            
            // Construct new path (same directory, new name)
            const parentPath = getParentPath(path);
            const newPath = parentPath === '/' ? `/${trimmedName}` : `${parentPath}/${trimmedName}`;
            
            // Check if destination already exists
            const files = await this.api.listFiles(parentPath);
            const nameExists = files.some(file => file.name === trimmedName);
            
            if (nameExists) {
                showError(`A file or folder with the name "${trimmedName}" already exists.`);
                return;
            }
            
            // Perform the rename (move operation)
            await this.api.moveFile(path, newPath);
            
            showSuccess(`Successfully renamed to "${trimmedName}"`);
            await this.refresh();
            
        } catch (error) {
            showError(`Failed to rename: ${error.message}`);
        } finally {
            hideLoading();
        }
    }
    
    async showProperties(path) {
        try {
            showLoading();
            const stat = await this.api.getFileStat(path);
            this.renderPropertiesModal(stat);
        } catch (error) {
            showError('Failed to load file properties: ' + error.message);
        } finally {
            hideLoading();
        }
    }
    
    renderPropertiesModal(stat) {
        const modal = document.getElementById('properties-modal');
        const content = document.getElementById('properties-content');
        
        const formatBytes = (bytes) => bytes < 0 ? 'N/A' : formatFileSize(bytes);
        const formatTime = (timeStr) => new Date(timeStr).toLocaleString();
        
        content.innerHTML = `
            <table style="width: 100%; font-size: 11px;">
                <tr><td><strong>Name:</strong></td><td>${escapeHtml(stat.name)}</td></tr>
                <tr><td><strong>Path:</strong></td><td>${escapeHtml(stat.path)}</td></tr>
                <tr><td><strong>Type:</strong></td><td>${stat.isDir ? 'Directory' : getFileType(stat.name, stat.isDir)}</td></tr>
                <tr><td><strong>Size:</strong></td><td>${formatBytes(stat.size)}</td></tr>
                <tr><td><strong>Mode:</strong></td><td>${stat.mode}</td></tr>
                <tr><td><strong>Modified:</strong></td><td>${formatTime(stat.modTime)}</td></tr>
                <tr><td><strong>Accessed:</strong></td><td>${formatTime(stat.accessTime)}</td></tr>
                <tr><td><strong>Changed:</strong></td><td>${formatTime(stat.changeTime)}</td></tr>
                <tr><td><strong>Owner (UID):</strong></td><td>${stat.uid || stat.UID}</td></tr>
                <tr><td><strong>Group (GID):</strong></td><td>${stat.gid}</td></tr>
                <tr><td><strong>Links:</strong></td><td>${stat.nlink}</td></tr>
                ${stat.mimeType ? `<tr><td><strong>MIME Type:</strong></td><td>${stat.mimeType}</td></tr>` : ''}
            </table>
        `;
        
        modal.classList.remove('hidden');
    }
    
    async createNewFolder() {
        const folderName = prompt('Enter folder name:', 'New Folder');
        if (!folderName || folderName.trim() === '') return;
        
        const trimmedName = folderName.trim();
        
        // Basic validation
        if (trimmedName.includes('/') || trimmedName.includes('\\')) {
            showError('Folder name cannot contain / or \\ characters.');
            return;
        }
        
        try {
            showLoading();
            
            const folderPath = joinPath(this.currentPath, trimmedName);
            await this.api.createFolder(folderPath);
            
            showSuccess(`Folder "${trimmedName}" created successfully`);
            await this.refresh();
            
        } catch (error) {
            showError(`Failed to create folder: ${error.message}`);
        } finally {
            hideLoading();
        }
    }
    
    showUploadModal() {
        const modal = document.getElementById('upload-modal');
        this.resetUploadModal();
        modal.classList.remove('hidden');
    }
}