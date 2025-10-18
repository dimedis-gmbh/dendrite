// UI management and event handlers
class UI {
    constructor(api) {
        this.api = api;
        this.currentPath = '/';
        this.selectedFiles = new Set();
        this.sortColumn = 'name';
        this.sortDirection = 'asc';
        this.contextMenuTargetPath = null;
        this.contextMenuUseSelection = true;
        this.pendingCheckboxRestore = null;
        
        this.initEventListeners();
        this.initBrowserHistory();
    }
    
    initEventListeners() {
        // Toolbar buttons
        document.getElementById('btn-home').addEventListener('click', () => this.navigateHome());
        document.getElementById('btn-up').addEventListener('click', () => this.navigateUp());
        document.getElementById('btn-refresh').addEventListener('click', () => this.refresh());
        document.getElementById('btn-upload').addEventListener('click', () => this.showUploadModal());
        document.getElementById('btn-new-folder').addEventListener('click', () => this.createNewFolder());
        document.getElementById('btn-download').addEventListener('click', () => this.downloadSelected());
        document.getElementById('btn-download-zip').addEventListener('click', () => this.downloadSelectedAsZip());
        const pasteButton = document.getElementById('btn-paste');
        if (pasteButton) {
            pasteButton.addEventListener('click', () => this.pasteFiles());
        }
        
        // File list events
        document.getElementById('select-all').addEventListener('change', (e) => this.selectAll(e.target.checked));
        
        // Consolidated click handler for file list body
        const fileListBody = document.getElementById('file-list-body');

        fileListBody.addEventListener('pointerdown', (e) => {
            const row = e.target.closest('.file-row');
            if (!row) {
                this.pendingCheckboxRestore = null;
                return;
            }

            if (e.button !== 0) {
                const checkbox = row.querySelector('.file-checkbox');
                this.pendingCheckboxRestore = {
                    path: row.dataset.path,
                    button: e.button,
                    shouldBeSelected: this.selectedFiles.has(row.dataset.path),
                    shouldBeChecked: checkbox ? checkbox.checked : false
                };

                if (e.target && e.target.classList && e.target.classList.contains('file-checkbox')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            } else {
                this.pendingCheckboxRestore = null;
            }
        });

        if (!window.PointerEvent) {
            fileListBody.addEventListener('mousedown', (e) => {
                const row = e.target.closest('.file-row');
                if (!row || e.button === 0) {
                    return;
                }

                const checkbox = row.querySelector('.file-checkbox');
                this.pendingCheckboxRestore = {
                    path: row.dataset.path,
                    button: e.button,
                    shouldBeSelected: this.selectedFiles.has(row.dataset.path),
                    shouldBeChecked: checkbox ? checkbox.checked : false
                };

                if (e.target && e.target.classList && e.target.classList.contains('file-checkbox')) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        }

        fileListBody.addEventListener('click', (e) => {
            // Check if clicking on three-dots menu button first
            const button = e.target.closest('.menu-dots-btn');
            if (button) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation(); // Stop all other handlers
                this.showContextMenuFromButton(e, button);
                return; // Stop processing other click handlers
            }
            
            // Otherwise handle regular file clicks
            this.handleFileClick(e);
        }, true); // Use capture phase to handle before bubbling
        
        fileListBody.addEventListener('dblclick', (e) => this.handleFileDoubleClick(e));
        fileListBody.addEventListener('contextmenu', (e) => this.showContextMenu(e));

        fileListBody.addEventListener('pointerup', (e) => {
            if (e.button === 0) {
                return;
            }
            const row = e.target.closest('.file-row');
            if (!row) {
                return;
            }
            this.syncRowSelectionWithState(row);
            this.updateSelectAllCheckbox();
            this.updateButtonStates();
        });

        if (!window.PointerEvent) {
            fileListBody.addEventListener('mouseup', (e) => {
                if (e.button === 0) {
                    return;
                }
                const row = e.target.closest('.file-row');
                if (!row) {
                    return;
                }
                this.syncRowSelectionWithState(row);
                this.updateSelectAllCheckbox();
                this.updateButtonStates();
            });
        }
        
        // Also add context menu to the container for white space/empty area right-clicks
        document.getElementById('file-list-container').addEventListener('contextmenu', (e) => this.showContextMenu(e));
        
        // Handle checkbox clicks specifically
        fileListBody.addEventListener('change', (e) => {
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

        // EXIF modal
        this.setupExifModal();
        
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
        
        // Prefer the current pathname
        let rawPath = window.location.pathname || '/';
        try {
            rawPath = decodeURIComponent(rawPath);
        } catch (error) {
            console.warn('Failed to decode URL pathname:', error);
        }
        
        // If pathname is just '/', check for legacy query parameter format
        if (rawPath === '/' || rawPath === '') {
            const urlParams = new URLSearchParams(window.location.search);
            const queryPath = urlParams.get('path');
            if (queryPath) {
                let decodedQuery = queryPath;
                try {
                    decodedQuery = decodeURIComponent(queryPath);
                } catch (error) {
                    console.warn('Failed to decode path query parameter:', error);
                }
                return this.normalizeInternalPath(decodedQuery);
            }
            return '/';
        }
        
        return this.normalizeInternalPath(rawPath);
    }
    
    normalizeInternalPath(path) {
        if (!path) {
            return '/';
        }
        
        if (path === '/' || path === '') {
            return '/';
        }

        let normalized = path.replace(/\\/g, '/');
        normalized = normalized.replace(/^\/+/, '').replace(/\/+$/, '');
        
        const segments = normalized.split('/').filter(segment => segment.length > 0);
        if (segments.length === 0) {
            return '/';
        }
        
        return segments.join('/');
    }
    
    buildURLPath(path) {
        const normalized = this.normalizeInternalPath(path);
        if (normalized === '/') {
            return '/';
        }
        
        const segments = normalized.split('/').filter(Boolean);
        if (segments.length === 0) {
            return '/';
        }
        
        const encodedSegments = segments.map(segment => encodeURIComponent(segment));
        return '/' + encodedSegments.join('/');
    }
    
    updateURL(path) {
        const normalized = this.normalizeInternalPath(path);
        const urlPath = this.buildURLPath(normalized);
        
        // Use clean path-based URLs
        const url = new URL(window.location.origin + urlPath);
        window.history.pushState({ path: normalized }, '', url);
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
            this.updateButtonStates();
            
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
            row.className = 'file-row hover:bg-gray-50';
            row.dataset.path = file.path;
            row.dataset.isDir = file.isDir;
            row.dataset.size = file.size || 0;
            row.dataset.modTime = file.modTime || '';
            
            // Debug: log what path we're setting
            if (!file.path || file.path === '/') {
                console.warn('File has invalid path:', file.name, 'path:', file.path);
            }
            
            row.innerHTML = `
                <td class="col-select relative w-12 px-6 sm:w-16 sm:px-8">
                    <input type="checkbox" class="file-checkbox absolute left-4 top-1/2 -mt-2 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" data-path="${escapeHtml(file.path)}">
                </td>
                <td class="col-menu w-8 px-1">
                    <button class="menu-dots-btn p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-indigo-500" data-path="${escapeHtml(file.path)}">
                        <svg class="h-5 w-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"></path>
                        </svg>
                    </button>
                </td>
                <td class="col-icon px-3 py-4 text-sm text-gray-500">
                    ${FileIcons.createIcon(file.name, file.isDir, file.mimeType)}
                </td>
                <td class="col-name px-3 py-4 text-sm text-gray-900 font-medium" title="${escapeHtml(file.name)}">
                    ${escapeHtml(file.name)}
                </td>
                <td class="col-size px-3 py-4 text-sm text-gray-500">${formatFileSize(file.size)}</td>
                <td class="col-type px-3 py-4 text-sm text-gray-500">${escapeHtml(getFileType(file.name, file.isDir))}</td>
                <td class="col-modified px-3 py-4 text-sm text-gray-500" title="${new Date(file.modTime).toLocaleString()}">
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
        const homeBtn = document.getElementById('btn-home');
        const upBtn = document.getElementById('btn-up');
        
        // Check if we're at root
        const isRoot = this.currentPath === '/' || this.currentPath === '';
        
        if (homeBtn) {
            homeBtn.disabled = isRoot;
            if (isRoot) {
                homeBtn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                homeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
        
        upBtn.disabled = isRoot;
        if (isRoot) {
            upBtn.classList.add('opacity-50', 'cursor-not-allowed');
        } else {
            upBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
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
        // Only handle clicks on checkboxes
        if (e.target.type !== 'checkbox') {
            return;
        }
        
        // The checkbox change event will handle the actual selection
        // This method now only exists for backwards compatibility
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
            // Only open files that the browser can display
            this.openFileByType(path);
        }
    }

    openFileByType(filePath) {
        const fileName = filePath.split('/').pop() || filePath;
        const viewerType = this.getViewerType(fileName);

        if (viewerType === 'log') {
            this.openLogViewerWindow(filePath);
            return true;
        }

        if (viewerType) {
            this.openFileInViewer(filePath, viewerType);
            return true;
        }

        return false;
    }
    
    handleCheckboxChange(e) {
        const checkbox = e.target;
        const row = checkbox.closest('.file-row');
        if (!row) return;
        
        const path = checkbox.dataset.path || row.dataset.path;
        const pending = this.pendingCheckboxRestore;
        if (pending && pending.path === path && pending.button !== 0) {
            const { shouldBeSelected, shouldBeChecked } = pending;
            this.pendingCheckboxRestore = null;

            checkbox.checked = shouldBeChecked;
            row.classList.toggle('selected', shouldBeSelected);

            if (shouldBeSelected) {
                this.selectedFiles.add(path);
            } else {
                this.selectedFiles.delete(path);
            }

            this.updateSelectAllCheckbox();
            this.updateButtonStates();
            return;
        }

        if (checkbox.checked) {
            this.selectedFiles.add(path);
            row.classList.add('selected');
        } else {
            this.selectedFiles.delete(path);
            row.classList.remove('selected');
        }
        
        this.updateSelectAllCheckbox();
        this.updateButtonStates();
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
        this.updateButtonStates();
    }

    syncRowSelectionWithState(row) {
        if (!row) return;
        const checkbox = row.querySelector('.file-checkbox');
        if (!checkbox) return;

        const path = row.dataset.path || checkbox.dataset.path;
        const shouldBeSelected = this.selectedFiles.has(path);

        checkbox.checked = shouldBeSelected;
        row.classList.toggle('selected', shouldBeSelected);
    }
    
    clearSelection() {
        this.selectedFiles.clear();
        document.querySelectorAll('.file-row').forEach(row => {
            row.classList.remove('selected');
            row.querySelector('.file-checkbox').checked = false;
        });
        this.updateSelectAllCheckbox();
        this.updateButtonStates();
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
        this.updateButtonStates();
    }
    
    updateSelectAllCheckbox() {
        const selectAllCheckbox = document.getElementById('select-all');
        const totalFiles = document.querySelectorAll('.file-row').length;
        const selectedCount = this.selectedFiles.size;
        
        selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < totalFiles;
        selectAllCheckbox.checked = selectedCount === totalFiles && totalFiles > 0;
    }
    
    updateButtonStates() {
        const downloadBtn = document.getElementById('btn-download');
        const zipBtn = document.getElementById('btn-download-zip');
        const pasteBtn = document.getElementById('btn-paste');
        const selectedCount = this.selectedFiles.size;
        
        // Download button: enabled only when exactly 1 item is selected
        if (downloadBtn) {
            downloadBtn.disabled = selectedCount !== 1;
            if (selectedCount !== 1) {
                downloadBtn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                downloadBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
        
        // ZIP button: enabled when 1 or more items are selected
        if (zipBtn) {
            zipBtn.disabled = selectedCount === 0;
            if (selectedCount === 0) {
                zipBtn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                zipBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }

        if (pasteBtn) {
            const clipboardHasItems = window.clipboard && !window.clipboard.isEmpty();
            pasteBtn.disabled = !clipboardHasItems;
            if (clipboardHasItems) {
                pasteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            } else {
                pasteBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }

    updatePasteControls() {
        this.updateButtonStates();
        const contextMenu = document.getElementById('context-menu');
        if (contextMenu && !contextMenu.classList.contains('hidden')) {
            this.updateContextMenuItems();
        }
    }
    
    // Navigation methods
    navigateHome() {
        this.loadFiles('/');
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
        this.pendingCheckboxRestore = null;

        const row = e.target.closest('.file-row');
        if (row) {
            const path = row.dataset.path;
            this.contextMenuTargetPath = path;
            this.contextMenuUseSelection = this.selectedFiles.has(path);

            this.syncRowSelectionWithState(row);
        } else {
            // If clicking in white space (no file row), clear any existing selection
            // This allows context menu operations like "Paste" in empty areas
            this.contextMenuTargetPath = null;
            this.contextMenuUseSelection = true;
            this.clearSelection();
        }

        // Update context menu items based on current selection/target
        this.updateContextMenuItems();

        const contextMenu = document.getElementById('context-menu');
        contextMenu.style.left = e.pageX + 'px';
        contextMenu.style.top = e.pageY + 'px';
        contextMenu.classList.remove('hidden');
    }
    
    showContextMenuFromButton(e, button) {
        const row = button.closest('.file-row');
        const path = button.dataset.path;
        
        // Store the path of the file whose menu button was clicked
        // This will be used by context menu actions even if the file isn't selected
        this.contextMenuTargetPath = path;
        this.contextMenuUseSelection = this.selectedFiles.has(path);

        // Update context menu items based on selection or the clicked file
        this.updateContextMenuItems();
        
        // Position the menu near the button
        const contextMenu = document.getElementById('context-menu');
        const rect = button.getBoundingClientRect();
        
        // Get scroll offsets
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        
        // Position menu to the right of the button (accounting for scroll)
        let left = rect.right + scrollLeft + 5;
        let top = rect.top + scrollTop;
        
        // Check if menu would go off the right edge of the viewport
        const menuWidth = 320; // Approximate width of context menu (w-80 = 20rem = 320px)
        if (rect.right + menuWidth > window.innerWidth) {
            // Position to the left of the button instead
            left = rect.left + scrollLeft - menuWidth - 5;
        }
        
        // Check if menu would go off the bottom of the viewport
        const menuHeight = 400; // Approximate max height of context menu
        if (rect.bottom + menuHeight > window.innerHeight) {
            // Position menu above the button if it would go off bottom
            const spaceAbove = rect.top;
            const spaceBelow = window.innerHeight - rect.bottom;
            
            if (spaceAbove > spaceBelow && spaceAbove > menuHeight) {
                // More space above, position menu above the button
                top = rect.top + scrollTop - menuHeight;
            } else {
                // Adjust to fit in viewport
                top = Math.max(scrollTop + 10, scrollTop + window.innerHeight - menuHeight - 10);
            }
        }
        
        contextMenu.style.left = left + 'px';
        contextMenu.style.top = top + 'px';
        contextMenu.classList.remove('hidden');
    }
    
    updateContextMenuItems() {
        const openItem = document.querySelector('[data-action="open"]');
        const editModalItem = document.querySelector('[data-action="edit-modal"]');
        const editWindowItem = document.querySelector('[data-action="edit-window"]');
        const editImageModalItem = document.querySelector('[data-action="edit-image-modal"]');
        const editImageWindowItem = document.querySelector('[data-action="edit-image-window"]');
        const viewLogModalItem = document.querySelector('[data-action="view-log-modal"]');
        const viewLogWindowItem = document.querySelector('[data-action="view-log-window"]');
        const renameItem = document.querySelector('[data-action="rename"]');
        const propertiesItem = document.querySelector('[data-action="properties"]');
        const pasteItem = document.querySelector('[data-action="paste"]');
        const exifItem = document.querySelector('[data-action="exif"]');
        const clipboardHasItems = window.clipboard && !window.clipboard.isEmpty();

        const selection = Array.from(this.selectedFiles);
        const selectionCount = selection.length;
        const usingSelection = this.contextMenuUseSelection && selectionCount > 0;
        const multiSelect = selectionCount > 1;

        let selectedPaths = usingSelection ? selection : [];
        if (!usingSelection && this.contextMenuTargetPath) {
            selectedPaths = [this.contextMenuTargetPath];
        }

        const disableMenuItem = (item, { hide = false } = {}) => {
            if (!item) {
                return;
            }
            item.classList.add('disabled');
            item.style.pointerEvents = 'none';
            item.style.opacity = '0.5';
            item.style.cursor = 'not-allowed';
            if (hide) {
                item.style.display = 'none';
            }
        };

        const enableMenuItem = (item) => {
            if (!item) {
                return;
            }
            item.classList.remove('disabled');
            item.style.pointerEvents = '';
            item.style.opacity = '';
            item.style.cursor = '';
            item.style.display = '';
        };

        const hideEditOptions = () => {
            disableMenuItem(editModalItem, { hide: true });
            disableMenuItem(editWindowItem, { hide: true });
        };

        const showEditOptions = () => {
            [editModalItem, editWindowItem].forEach(item => {
                if (!item) {
                    return;
                }
                item.style.display = 'block';
                item.classList.remove('disabled');
                item.style.pointerEvents = '';
                item.style.opacity = '';
                item.style.cursor = '';
            });
        };

        const hideImageOptions = () => {
            disableMenuItem(editImageModalItem, { hide: true });
            disableMenuItem(editImageWindowItem, { hide: true });
        };

        const showImageOptions = () => {
            [editImageModalItem, editImageWindowItem].forEach(item => {
                if (!item) {
                    return;
                }
                item.style.display = 'block';
                item.classList.remove('disabled');
                item.style.pointerEvents = '';
                item.style.opacity = '';
                item.style.cursor = '';
            });
        };

        const hideLogOptions = () => {
            if (viewLogModalItem) {
                viewLogModalItem.style.display = 'none';
            }
            if (viewLogWindowItem) {
                viewLogWindowItem.style.display = 'none';
            }
        };

        const showLogOptions = () => {
            if (viewLogModalItem) {
                viewLogModalItem.style.display = 'block';
                viewLogModalItem.classList.remove('disabled');
                viewLogModalItem.style.pointerEvents = '';
                viewLogModalItem.style.opacity = '';
                viewLogModalItem.style.cursor = '';
            }
            if (viewLogWindowItem) {
                viewLogWindowItem.style.display = 'block';
                viewLogWindowItem.classList.remove('disabled');
                viewLogWindowItem.style.pointerEvents = '';
                viewLogWindowItem.style.opacity = '';
                viewLogWindowItem.style.cursor = '';
            }
        };

        const setOpenDisabledState = (disabled) => {
            if (!openItem) {
                return;
            }
            if (disabled) {
                openItem.classList.add('disabled');
                openItem.style.opacity = '0.5';
                openItem.style.cursor = 'not-allowed';
                openItem.style.pointerEvents = 'none';
            } else {
                openItem.classList.remove('disabled');
                openItem.style.opacity = '';
                openItem.style.cursor = '';
                openItem.style.pointerEvents = '';
            }
        };

        // Reset baseline state
        setOpenDisabledState(true);
        document.querySelectorAll('.menu-item').forEach(item => {
            item.classList.remove('disabled');
            item.style.pointerEvents = '';
            item.style.opacity = '';
            item.style.cursor = '';
            if (item.dataset.action && (item.dataset.action.includes('view-log') || item.dataset.action.includes('edit-image'))) {
                item.style.display = 'none';
            }
        });

        if (pasteItem) {
            pasteItem.style.display = '';
            disableMenuItem(pasteItem);
        }

        if (exifItem) {
            exifItem.style.display = 'none';
            disableMenuItem(exifItem, { hide: true });
        }

        if (multiSelect) {
            setOpenDisabledState(true);
            hideEditOptions();
            hideImageOptions();
            hideLogOptions();
            disableMenuItem(renameItem);
            disableMenuItem(propertiesItem);
            if (pasteItem) {
                disableMenuItem(pasteItem, { hide: true });
            }
            if (exifItem) {
                disableMenuItem(exifItem, { hide: true });
            }
            return;
        }

        if (selectedPaths.length === 1) {
            const selectedPath = selectedPaths[0];
            const row = document.querySelector(`[data-path="${selectedPath}"]`);
            if (!row) {
                hideEditOptions();
                hideImageOptions();
                hideLogOptions();
                if (pasteItem) {
                    disableMenuItem(pasteItem, { hide: true });
                }
                if (exifItem) {
                    disableMenuItem(exifItem, { hide: true });
                }
                return;
            }

            if (row.dataset.isDir === 'true') {
                setOpenDisabledState(true);
                hideEditOptions();
                hideImageOptions();
                hideLogOptions();
                if (pasteItem) {
                    if (clipboardHasItems) {
                        enableMenuItem(pasteItem);
                    } else {
                        disableMenuItem(pasteItem);
                    }
                }
                if (exifItem) {
                    disableMenuItem(exifItem, { hide: true });
                }
                return;
            }

            const fileName = selectedPath.split('/').pop() || selectedPath;
            const viewerType = this.getViewerType(fileName);

            if (viewerType) {
                setOpenDisabledState(false);
            } else {
                setOpenDisabledState(true);
            }

            hideEditOptions();
            hideImageOptions();
            hideLogOptions();

            if (viewerType === 'log') {
                showLogOptions();
                if (pasteItem) {
                    disableMenuItem(pasteItem, { hide: true });
                }
                if (exifItem) {
                    disableMenuItem(exifItem, { hide: true });
                }
                return;
            }

            if (this.isImageFile(fileName)) {
                showImageOptions();
                if (pasteItem) {
                    disableMenuItem(pasteItem, { hide: true });
                }
                if (exifItem) {
                    exifItem.style.display = 'block';
                    if (this.supportsExif(fileName)) {
                        enableMenuItem(exifItem);
                    } else {
                        disableMenuItem(exifItem, { hide: true });
                    }
                }
                return;
            }

            if (this.isEditableFile(fileName)) {
                showEditOptions();
                if (pasteItem) {
                    disableMenuItem(pasteItem, { hide: true });
                }
                if (exifItem) {
                    disableMenuItem(exifItem, { hide: true });
                }
                return;
            }

            if (pasteItem) {
                disableMenuItem(pasteItem, { hide: true });
            }
            if (exifItem) {
                disableMenuItem(exifItem, { hide: true });
            }
            return;
        }

        // No selection
        setOpenDisabledState(true);
        hideEditOptions();
        hideImageOptions();
        hideLogOptions();
        if (pasteItem) {
            if (clipboardHasItems) {
                enableMenuItem(pasteItem);
            } else {
                disableMenuItem(pasteItem);
            }
        }
        if (exifItem) {
            disableMenuItem(exifItem, { hide: true });
        }
    }
    
    isLogFile(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        return ext === 'log';
    }
    
    isImageFile(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        return ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'tif', 'tiff', 'heic', 'heif', 'avif'].includes(ext);
    }

    supportsExif(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        return ['jpg', 'jpeg', 'tif', 'tiff', 'heic', 'heif', 'avif'].includes(ext);
    }
    
    isEditableFile(fileName) {
        // Don't treat log files or image files as text-editable since they have their own viewers
        if (this.isLogFile(fileName) || this.isImageFile(fileName)) {
            return false;
        }
        
        const editableExtensions = [
            'txt', 'md', 'js', 'jsx', 'ts', 'tsx', 'json', 'html', 'htm', 
            'css', 'scss', 'sass', 'less', 'xml', 'svg', 'yaml', 'yml', 
            'toml', 'ini', 'conf', 'config', 'sh', 'bash', 'zsh', 'fish',
            'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'hpp',
            'php', 'sql', 'env', 'gitignore', 'dockerfile',
            'makefile', 'readme', 'license', 'editorconfig'
        ];
        
        const ext = fileName.split('.').pop().toLowerCase();
        const fileNameLower = fileName.toLowerCase();
        
        // Check by extension or by common filenames without extensions
        return editableExtensions.includes(ext) || 
               editableExtensions.includes(fileNameLower);
    }

    isVideoFile(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        return ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'm4v', 'mkv', 'avi'].includes(ext);
    }

    isAudioFile(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        return ['mp3', 'ogg', 'oga', 'wav', 'flac', 'aac', 'm4a'].includes(ext);
    }

    isPdfFile(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        return ext === 'pdf';
    }

    isHtmlFile(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();
        return ext === 'html' || ext === 'htm';
    }

    getViewerType(fileName) {
        const ext = fileName.split('.').pop().toLowerCase();

        if (this.isLogFile(fileName)) {
            return 'log';
        }
        if (this.isImageFile(fileName)) {
            return 'image';
        }
        if (this.isVideoFile(fileName)) {
            return 'video';
        }
        if (this.isAudioFile(fileName)) {
            return 'audio';
        }
        if (this.isPdfFile(fileName)) {
            return 'pdf';
        }
        if (ext === 'svg') {
            return 'text';
        }
        if (this.isHtmlFile(fileName)) {
            return 'html';
        }
        if (this.isEditableFile(fileName)) {
            return 'text';
        }

        return null;
    }
    
    openLogViewerWindow(filePath) {
        // Open log viewer in a new window without browser controls
        const logUrl = `/log-viewer.html?path=${encodeURIComponent(filePath)}`;
        const windowName = `dendrite_log_${filePath.replace(/[^a-z0-9]/gi, '_')}`;
        
        const windowFeatures = [
            'width=1024',
            'height=768',
            'menubar=no',
            'toolbar=no',
            'location=no',
            'directories=no',
            'status=no',
            'scrollbars=yes',
            'resizable=yes',
            'copyhistory=no',
            'personalbar=no',
            'chrome=no',
            'titlebar=no',
            'addressbar=no'
        ].join(',');
        
        const logWindow = window.open(logUrl, windowName, windowFeatures);
        
        if (!logWindow) {
            showError('Failed to open log viewer. Please check if pop-ups are blocked.');
        }
    }
    
    openLogViewerModal(filePath) {
        // Open log viewer in a modal (iframe)
        const modal = document.getElementById('editor-modal');
        const iframe = document.getElementById('editor-modal-iframe');
        const filenameSpan = document.getElementById('editor-modal-filename');
        
        // Set the filename in the header
        const filename = filePath.split('/').pop() || filePath;
        filenameSpan.textContent = filename;
        
        // Set the iframe source to log viewer
        iframe.src = `/log-viewer.html?path=${encodeURIComponent(filePath)}&mode=modal`;
        
        // Show the modal
        modal.classList.remove('hidden');
        
        // Setup close button
        const closeBtn = modal.querySelector('.editor-modal-close');
        closeBtn.onclick = () => {
            iframe.src = '';
            modal.classList.add('hidden');
        };
    }
    
    openFileInViewer(filePath, viewerType = '') {
        const params = new URLSearchParams();
        params.set('path', filePath);
        if (viewerType) {
            params.set('type', viewerType);
        }

        const viewerUrl = `/file-viewer.html?${params.toString()}`;
        const windowName = `dendrite_viewer_${filePath.replace(/[^a-z0-9]/gi, '_')}`;

        const windowFeatures = [
            'width=1024',
            'height=768',
            'menubar=no',
            'toolbar=no',
            'location=no',
            'directories=no',
            'status=no',
            'scrollbars=yes',
            'resizable=yes',
            'copyhistory=no',
            'personalbar=no',
            'chrome=no',
            'titlebar=no',
            'addressbar=no'
        ].join(',');

        const viewerWindow = window.open(viewerUrl, windowName, windowFeatures);
        if (!viewerWindow) {
            showError('Failed to open file viewer. Please check if pop-ups are blocked.');
        }
    }

    openEditorWindow(filePath) {
        // Open editor in a new window without browser controls
        const editorUrl = `/editor.html?path=${encodeURIComponent(filePath)}`;
        const windowName = `dendrite_editor_${filePath.replace(/[^a-z0-9]/gi, '_')}`;
        
        // Use maximum restrictions to hide browser chrome
        // Note: Modern browsers may ignore some of these for security reasons
        const windowFeatures = [
            'width=1024',
            'height=768',
            'menubar=no',
            'toolbar=no',
            'location=no',
            'directories=no',
            'status=no',
            'scrollbars=yes',
            'resizable=yes',
            'copyhistory=no',
            'personalbar=no',
            'chrome=no',
            'titlebar=no',
            'addressbar=no'
        ].join(',');
        
        // Open the editor window
        const editorWindow = window.open(editorUrl, windowName, windowFeatures);
        
        if (!editorWindow) {
            showError('Failed to open editor. Please check if pop-ups are blocked.');
        }
    }
    
    openEditorModal(filePath) {
        // Open editor in a modal (iframe)
        const modal = document.getElementById('editor-modal');
        const iframe = document.getElementById('editor-modal-iframe');
        const filenameSpan = document.getElementById('editor-modal-filename');
        
        console.log('Opening editor for file:', filePath);
        
        // Set the filename in the header
        const filename = filePath.split('/').pop() || filePath;
        filenameSpan.textContent = filename;
        
        // Set the iframe source
        iframe.src = `/editor.html?path=${encodeURIComponent(filePath)}&mode=modal`;
        
        // Show the modal
        modal.classList.remove('hidden');
        
        // Setup close button
        const closeBtn = modal.querySelector('.editor-modal-close');
        closeBtn.onclick = () => {
            this.closeEditorModal();
        };
        
        // Close on escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                // Store the handler reference so closeEditorModal can remove it if needed
                this.currentEscapeHandler = escapeHandler;
                this.closeEditorModal();
                // Handler will be removed either after successful close or if user cancels
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }
    
    closeEditorModal() {
        const modal = document.getElementById('editor-modal');
        const iframe = document.getElementById('editor-modal-iframe');
        
        // Check for unsaved changes in the iframe
        if (iframe.src && iframe.contentWindow) {
            // Send message to check for unsaved changes
            iframe.contentWindow.postMessage({ action: 'checkUnsavedChanges' }, '*');
            
            // Set up one-time listener for the response
            const handleResponse = (e) => {
                if (e.data && e.data.action === 'unsavedChangesStatus') {
                    window.removeEventListener('message', handleResponse);
                    
                    if (e.data.hasUnsavedChanges) {
                        // Show custom confirmation dialog for modal
                        const message = `You have unsaved changes in "${e.data.filePath || 'the editor'}". Are you sure you want to close the editor without saving?`;
                        
                        if (confirm(message)) {
                            // User confirmed, send force close message and then close
                            iframe.contentWindow.postMessage({ action: 'forceClose' }, '*');
                            // Give it a moment to process the forceClose
                            setTimeout(() => {
                                iframe.src = '';
                                modal.classList.add('hidden');
                                // Remove escape handler if it exists
                                if (this.currentEscapeHandler) {
                                    document.removeEventListener('keydown', this.currentEscapeHandler);
                                    this.currentEscapeHandler = null;
                                }
                            }, 100);
                        }
                        // If user cancels, do nothing (modal stays open)
                    } else {
                        // No unsaved changes, close immediately
                        iframe.src = '';
                        modal.classList.add('hidden');
                        // Remove escape handler if it exists
                        if (this.currentEscapeHandler) {
                            document.removeEventListener('keydown', this.currentEscapeHandler);
                            this.currentEscapeHandler = null;
                        }
                    }
                }
            };
            
            window.addEventListener('message', handleResponse);
            
            // Fallback in case iframe doesn't respond (e.g., different origin or error)
            setTimeout(() => {
                window.removeEventListener('message', handleResponse);
                // If we haven't closed by now, just close without checking
                if (!modal.classList.contains('hidden')) {
                    iframe.src = '';
                    modal.classList.add('hidden');
                    // Remove escape handler if it exists
                    if (this.currentEscapeHandler) {
                        document.removeEventListener('keydown', this.currentEscapeHandler);
                        this.currentEscapeHandler = null;
                    }
                }
            }, 500);
        } else {
            // No iframe source, just close
            iframe.src = '';
            modal.classList.add('hidden');
            // Remove escape handler if it exists
            if (this.currentEscapeHandler) {
                document.removeEventListener('keydown', this.currentEscapeHandler);
                this.currentEscapeHandler = null;
            }
        }
    }
    
    openImageEditorWindow(filePath) {
        // Open image editor in a new window without browser controls
        const editorUrl = `/image-editor.html?path=${encodeURIComponent(filePath)}`;
        const windowName = `dendrite_image_editor_${filePath.replace(/[^a-z0-9]/gi, '_')}`;
        
        // Use maximum restrictions to hide browser chrome
        const windowFeatures = [
            'width=1200',
            'height=800',
            'menubar=no',
            'toolbar=no',
            'location=no',
            'directories=no',
            'status=no',
            'scrollbars=yes',
            'resizable=yes',
            'copyhistory=no',
            'personalbar=no',
            'chrome=no',
            'titlebar=no',
            'addressbar=no'
        ].join(',');
        
        // Open the image editor window
        const editorWindow = window.open(editorUrl, windowName, windowFeatures);
        
        if (!editorWindow) {
            showError('Failed to open image editor. Please check if pop-ups are blocked.');
        }
    }
    
    openImageEditorModal(filePath) {
        // Open image editor in a modal (iframe)
        const modal = document.getElementById('image-editor-modal');
        const iframe = document.getElementById('image-editor-modal-iframe');
        const filenameSpan = document.getElementById('image-editor-modal-filename');

        console.log('Opening image editor for file:', filePath);

        // Set the filename in the header if the element exists
        if (filenameSpan) {
            const filename = filePath.split('/').pop() || filePath;
            filenameSpan.textContent = filename;
        }
        
        // Set the iframe source
        iframe.src = `/image-editor.html?path=${encodeURIComponent(filePath)}&modal=true`;
        
        // Show the modal
        modal.classList.remove('hidden');
        
        // Setup close button
        const closeBtn = modal.querySelector('.image-editor-modal-close');
        closeBtn.onclick = () => {
            iframe.src = '';
            modal.classList.add('hidden');
        };
        
        // Listen for close message from iframe
        const messageHandler = (e) => {
            if (e.data && e.data.action === 'closeImageEditor') {
                iframe.src = '';
                modal.classList.add('hidden');
                window.removeEventListener('message', messageHandler);
            }
        };
        window.addEventListener('message', messageHandler);
    }
    
    hideContextMenu() {
        const menu = document.getElementById('context-menu');
        if (menu) {
            menu.classList.add('hidden');
        }
        // Clear context menu targeting state when hiding
        this.contextMenuTargetPath = null;
        this.contextMenuUseSelection = true;
    }
    
    async handleContextMenuAction(e) {
        const menuItem = e.target.closest('[data-action]');
        if (!menuItem) {
            return;
        }

        e.preventDefault();

        // Don't process if the menu item is disabled
        if (menuItem.classList.contains('disabled')) {
            this.hideContextMenu();
            return;
        }

        const action = menuItem.dataset.action;
        const contextTargetPath = this.contextMenuTargetPath;
        const contextUseSelection = this.contextMenuUseSelection;

        const selection = Array.from(this.selectedFiles);
        const usingSelection = contextUseSelection && selection.length > 0;

        // Use selected files if applicable, otherwise fall back to the context menu target
        let selectedPaths = usingSelection ? selection : [];
        if (!usingSelection && contextTargetPath) {
            selectedPaths = [contextTargetPath];
        }

        const targetRow = (!usingSelection && contextTargetPath)
            ? document.querySelector(`[data-path="${contextTargetPath}"]`)
            : null;
        const targetIsDir = !!targetRow && targetRow.dataset.isDir === 'true';

        this.hideContextMenu();

        if (selectedPaths.length === 0 && action !== 'paste') {
            return;
        }

        switch (action) {
            case 'open':
                if (selectedPaths.length === 1) {
                    const row = document.querySelector(`[data-path="${selectedPaths[0]}"]`);
                    if (!row) {
                        break;
                    }
                    if (row.dataset.isDir === 'true') {
                        break;
                    }
                    this.openFileByType(selectedPaths[0]);
                }
                break;
                
            case 'edit-modal':
                if (selectedPaths.length === 1) {
                    this.openEditorModal(selectedPaths[0]);
                }
                break;
                
            case 'edit-window':
                if (selectedPaths.length === 1) {
                    this.openEditorWindow(selectedPaths[0]);
                }
                break;
                
            case 'edit-image-modal':
                if (selectedPaths.length === 1) {
                    this.openImageEditorModal(selectedPaths[0]);
                }
                break;
                
            case 'edit-image-window':
                if (selectedPaths.length === 1) {
                    this.openImageEditorWindow(selectedPaths[0]);
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
                
            case 'paste': {
                let pasteTarget = this.currentPath;
                if (!usingSelection && contextTargetPath && targetIsDir) {
                    pasteTarget = contextTargetPath;
                }
                await this.pasteFiles(pasteTarget);
                break;
            }
                
            case 'delete':
                await this.deleteSelectedFiles(selectedPaths);
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

            case 'exif': {
                const targetPath = selectedPaths.length === 1 ? selectedPaths[0] : contextTargetPath;
                if (targetPath) {
                    await this.showExif(targetPath);
                }
                break;
            }

            case 'view-log-modal':
                if (selectedPaths.length === 1) {
                    this.openLogViewerModal(selectedPaths[0]);
                }
                break;
            
            case 'view-log-window':
                if (selectedPaths.length === 1) {
                    this.openLogViewerWindow(selectedPaths[0]);
                }
                break;
        }
    }
    
    // Placeholder methods for advanced features
    setupUploadModal() {
        const modal = document.getElementById('upload-modal');
        if (!modal) return;
        
        const closeBtn = modal.querySelector('.close');
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const uploadList = document.getElementById('upload-list');
        
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
        const uploadList = document.getElementById('upload-list');
        const dropZone = document.getElementById('drop-zone');
        
        if (fileInput) fileInput.value = '';
        if (uploadList) {
            uploadList.classList.add('hidden');
            uploadList.innerHTML = '';
        }
        if (dropZone) dropZone.classList.remove('dragover');
    }
    
    async uploadFiles(files) {
        const uploadList = document.getElementById('upload-list');
        const uploadBtn = document.getElementById('upload-btn');
        
        if (!uploadList) return;
        
        // Show upload list
        uploadList.classList.remove('hidden');
        uploadList.innerHTML = '';
        
        let uploadedCount = 0;
        const totalFiles = files.length;
        
        // Create progress items for each file
        for (const file of files) {
            const progressItem = document.createElement('div');
            progressItem.className = 'mb-2';
            progressItem.innerHTML = `
                <div class="flex justify-between text-sm text-gray-600 mb-1">
                    <span>${file.name}</span>
                    <span class="file-status">Waiting...</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2">
                    <div class="bg-indigo-600 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
            `;
            uploadList.appendChild(progressItem);
        }
        
        // Upload files
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const progressItem = uploadList.children[i];
            const statusSpan = progressItem.querySelector('.file-status');
            const progressBar = progressItem.querySelector('.bg-indigo-600');
            
            try {
                statusSpan.textContent = 'Uploading...';
                progressBar.style.width = '50%';
                
                const result = await this.api.uploadFile(this.currentPath, file);
                uploadedCount++;
                
                progressBar.style.width = '100%';
                statusSpan.textContent = 'Complete';
                statusSpan.className = 'file-status text-green-600';
                
                console.log('Uploaded file:', result);
                
            } catch (error) {
                progressBar.style.width = '100%';
                progressBar.className = 'bg-red-600 h-2 rounded-full';
                statusSpan.textContent = 'Failed';
                statusSpan.className = 'file-status text-red-600';
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
        if (!modal) return;
        
        const closeBtn = modal.querySelector('.close');
        if (!closeBtn) return;
        
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

    setupExifModal() {
        const modal = document.getElementById('exif-modal');
        if (!modal) {
            return;
        }

        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.add('hidden');
            });
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });

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
                // Close context menu if open
                this.hideContextMenu();
                // Close any open modals
                document.querySelectorAll('.modal').forEach(modal => {
                    modal.classList.add('hidden');
                });
                // Clear selection
                this.clearSelection();
                break;
        }
    }
    
    normalizeDirectoryPath(path) {
        if (!path || path === '' || path === '/') {
            return '/';
        }

        const trimmed = path.replace(/\/\/+/g, '/').replace(/\/+$/, '');
        if (trimmed === '') {
            return '/';
        }

        return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }

    async pasteFiles(targetDirectory = this.currentPath) {
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
            
            const baseDir = this.normalizeDirectoryPath(targetDirectory);

            for (const sourcePath of items) {
                try {
                    const fileName = getFileName(sourcePath);
                    const destPath = baseDir === '/' ? `/${fileName}` : `${baseDir}/${fileName}`;
                    
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
    
    async showDeleteConfirmation(paths) {
        const modal = document.getElementById('delete-modal');
        const descriptionEl = document.getElementById('delete-modal-description');
        const listEl = document.getElementById('delete-modal-list');
        const confirmBtn = document.getElementById('delete-confirm-btn');
        const cancelBtn = document.getElementById('delete-cancel-btn');

        if (!modal || !descriptionEl || !listEl || !confirmBtn || !cancelBtn) {
            const fallback = confirm(`Are you sure you want to delete ${paths.length} item(s)? This action cannot be undone.`);
            return fallback;
        }

        const fileCount = paths.length;
        const names = paths.map(path => getFileName(path) || path);

        if (fileCount === 1) {
            descriptionEl.textContent = `Are you sure you want to delete "${names[0]}"? This action cannot be undone.`;
        } else if (fileCount <= 10) {
            descriptionEl.textContent = `Are you sure you want to delete these ${fileCount} items? This action cannot be undone.`;
        } else {
            descriptionEl.textContent = `Are you sure you want to delete ${fileCount} items? This action cannot be undone.`;
        }

        listEl.innerHTML = '';
        if (fileCount <= 10) {
            listEl.classList.remove('hidden');
            names.forEach(name => {
                const item = document.createElement('li');
                item.className = 'px-4 py-2';
                item.textContent = name;
                listEl.appendChild(item);
            });
        } else {
            listEl.classList.add('hidden');
        }

        modal.classList.remove('hidden');

        return new Promise((resolve) => {
            let cleanup;

            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };

            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            const handleKey = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                }
            };

            cleanup = () => {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                document.removeEventListener('keydown', handleKey);
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            document.addEventListener('keydown', handleKey);

            setTimeout(() => confirmBtn.focus(), 100);
        });
    }

    async deleteSelectedFiles(paths = null) {
        const providedPaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
        const targets = providedPaths.length > 0 ? providedPaths : Array.from(this.selectedFiles);

        if (targets.length === 0) {
            showError('No files selected for deletion.');
            return;
        }

        const confirmed = await this.showDeleteConfirmation(targets);
        if (!confirmed) {
            return;
        }

        let deletedCount = 0;
        const errors = [];
        
        try {
            showLoading();
            
            for (const path of targets) {
                try {
                    await this.api.deleteFile(path);
                    deletedCount++;
                    this.selectedFiles.delete(path);
                } catch (error) {
                    errors.push(`${getFileName(path)}: ${error.message}`);
                }
            }
            
            if (deletedCount > 0) {
                showSuccess(`Successfully deleted ${deletedCount} item(s)`);
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
    
    async getRenameInput(defaultName) {
        const modal = document.getElementById('rename-modal');
        const nameInput = document.getElementById('rename-name');
        const errorText = document.getElementById('rename-error');
        const confirmBtn = document.getElementById('rename-confirm-btn');
        const cancelBtn = document.getElementById('rename-cancel-btn');

        if (!modal || !nameInput || !errorText || !confirmBtn || !cancelBtn) {
            const fallback = prompt('Enter new name:', defaultName);
            if (!fallback) {
                return null;
            }
            const trimmedFallback = fallback.trim();
            return trimmedFallback || null;
        }

        nameInput.value = defaultName;
        nameInput.select();
        errorText.textContent = '';
        errorText.classList.add('hidden');
        modal.classList.remove('hidden');

        setTimeout(() => nameInput.focus(), 100);

        return new Promise((resolve) => {
            const cleanup = () => {
                modal.classList.add('hidden');
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                document.removeEventListener('keydown', handleEscape);
                nameInput.removeEventListener('keydown', handleEnter);
            };

            const handleConfirm = () => {
                const value = nameInput.value.trim();

                if (!value) {
                    errorText.textContent = 'Please enter a name.';
                    errorText.classList.remove('hidden');
                    return;
                }

                if (value.includes('/') || value.includes('\\')) {
                    errorText.textContent = 'Name cannot contain / or \\ characters.';
                    errorText.classList.remove('hidden');
                    return;
                }

                cleanup();
                resolve(value);
            };

            const handleCancel = () => {
                cleanup();
                resolve(null);
            };

            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                }
            };

            const handleEnter = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleConfirm();
                }
            };

            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            document.addEventListener('keydown', handleEscape);
            nameInput.addEventListener('keydown', handleEnter);
        });
    }

    async renameFile(path) {
        const currentName = getFileName(path);
        const newName = await this.getRenameInput(currentName);

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

        const imageMeta = stat && stat.image ? stat.image : null;
        const hasImageData = Boolean(imageMeta && imageMeta.width && imageMeta.height);
        const dpiParts = [];
        if (imageMeta && imageMeta.dpiWidth) {
            dpiParts.push(`${imageMeta.dpiWidth.toFixed(2)} DPI (X)`);
        }
        if (imageMeta && imageMeta.dpiHeight) {
            dpiParts.push(`${imageMeta.dpiHeight.toFixed(2)} DPI (Y)`);
        }

        const ownerValue = stat.uid !== undefined ? stat.uid : (stat.UID !== undefined ? stat.UID : '');
        const groupValue = stat.gid !== undefined ? stat.gid : (stat.GID !== undefined ? stat.GID : '');

        const imageRows = imageMeta ? `
                ${hasImageData ? `<tr><td><strong>Dimensions:</strong></td><td>${imageMeta.width} × ${imageMeta.height} px</td></tr>` : ''}
                ${imageMeta.colorDepth ? `<tr><td><strong>Color depth:</strong></td><td>${imageMeta.colorDepth}-bit</td></tr>` : ''}
                ${imageMeta.colorType ? `<tr><td><strong>Color type:</strong></td><td>${escapeHtml(imageMeta.colorType)}</td></tr>` : ''}
                ${typeof imageMeta.hasAlpha === 'boolean' ? `<tr><td><strong>Alpha channel:</strong></td><td>${imageMeta.hasAlpha ? 'Yes' : 'No'}</td></tr>` : ''}
                ${imageMeta.colorSpace ? `<tr><td><strong>Color space:</strong></td><td>${escapeHtml(imageMeta.colorSpace)}</td></tr>` : ''}
                ${dpiParts.length ? `<tr><td><strong>Resolution:</strong></td><td>${dpiParts.join(', ')}</td></tr>` : ''}
            ` : '';

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
                <tr><td><strong>Owner (UID):</strong></td><td>${ownerValue}</td></tr>
                <tr><td><strong>Group (GID):</strong></td><td>${groupValue}</td></tr>
                <tr><td><strong>Links:</strong></td><td>${stat.nlink}</td></tr>
                ${stat.mimeType ? `<tr><td><strong>MIME Type:</strong></td><td>${stat.mimeType}</td></tr>` : ''}
                ${imageRows}
            </table>
        `;
        
        modal.classList.remove('hidden');
    }

    async showExif(path) {
        try {
            showLoading();
            const exifData = await this.api.getFileExif(path);
            this.renderExifModal(path, exifData);
        } catch (error) {
            showError('Failed to load EXIF data: ' + error.message);
        } finally {
            hideLoading();
        }
    }

    renderExifModal(path, exifData) {
        const modal = document.getElementById('exif-modal');
        const title = document.getElementById('exif-modal-title');
        const content = document.getElementById('exif-content');

        if (title) {
            title.textContent = `EXIF data for ${path.split('/').pop() || path}`;
        }

        const tags = (exifData && exifData.tags) ? exifData.tags : {};
        const keys = Object.keys(tags).sort((a, b) => a.localeCompare(b));

        if (keys.length === 0) {
            content.innerHTML = '<p class="text-sm text-gray-500">No EXIF metadata found.</p>';
        } else {
            const rows = keys.map(key => {
                const value = escapeHtml(String(tags[key]));
                return `<tr><td class="font-medium pr-4 align-top">${escapeHtml(key)}</td><td class="text-gray-700">${value}</td></tr>`;
            }).join('');

            content.innerHTML = `
                <div class="overflow-x-auto max-h-96">
                    <table class="min-w-full text-sm text-left text-gray-600">
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            `;
        }

        modal.classList.remove('hidden');
    }
    
    async createNewFolder() {
        const modal = document.getElementById('new-folder-modal');
        const nameInput = document.getElementById('new-folder-name');
        const errorText = document.getElementById('new-folder-error');
        const createBtn = document.getElementById('create-folder-btn');
        const cancelBtn = document.getElementById('cancel-folder-btn');
        
        // Reset and show modal
        nameInput.value = 'New Folder';
        nameInput.select();
        errorText.textContent = '';
        errorText.classList.add('hidden');
        modal.classList.remove('hidden');
        
        // Focus the input
        setTimeout(() => nameInput.focus(), 100);
        
        // Create folder handler
        const handleCreate = async () => {
            const folderName = nameInput.value.trim();
            
            if (!folderName) {
                errorText.textContent = 'Please enter a folder name.';
                errorText.classList.remove('hidden');
                return;
            }
            
            // Basic validation
            if (folderName.includes('/') || folderName.includes('\\')) {
                errorText.textContent = 'Folder name cannot contain / or \\ characters.';
                errorText.classList.remove('hidden');
                return;
            }
            
            try {
                showLoading();
                modal.classList.add('hidden');
                
                const folderPath = joinPath(this.currentPath, folderName);
                await this.api.createFolder(folderPath);
                
                showSuccess(`Folder "${folderName}" created successfully`);
                await this.refresh();
                
            } catch (error) {
                // Use the new error modal instead of alert
                showError(`Failed to create folder: ${error.message}`);
            } finally {
                hideLoading();
                cleanup();
            }
        };
        
        // Cancel handler
        const handleCancel = () => {
            modal.classList.add('hidden');
            cleanup();
        };
        
        // Escape key handler
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                handleCancel();
            }
        };
        
        // Enter key handler on input
        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
            }
        };
        
        // Cleanup function
        const cleanup = () => {
            createBtn.removeEventListener('click', handleCreate);
            cancelBtn.removeEventListener('click', handleCancel);
            document.removeEventListener('keydown', handleEscape);
            nameInput.removeEventListener('keydown', handleEnter);
        };
        
        // Attach event listeners
        createBtn.addEventListener('click', handleCreate);
        cancelBtn.addEventListener('click', handleCancel);
        document.addEventListener('keydown', handleEscape);
        nameInput.addEventListener('keydown', handleEnter);
    }
    
    showUploadModal() {
        const modal = document.getElementById('upload-modal');
        this.resetUploadModal();
        modal.classList.remove('hidden');
    }
}
