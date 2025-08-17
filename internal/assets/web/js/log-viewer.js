class LogViewer {
    constructor() {
        this.filePath = null;
        this.jwt = null;
        this.ws = null;
        this.isFollowing = false;
        this.settings = {
            lines: 150,
            search: '',
            caseSensitive: false,
            regex: false,
            softWrap: false
        };
        
        this.init();
    }
    
    init() {
        // Get parameters from URL
        const params = new URLSearchParams(window.location.search);
        this.filePath = params.get('path');
        this.jwt = params.get('jwt') || localStorage.getItem('dendrite_jwt');
        
        if (!this.filePath) {
            this.showError('No file path specified');
            return;
        }
        
        // Set window title
        const fileName = this.filePath.split('/').pop() || 'log';
        document.title = `${fileName} - Log Viewer`;
        
        // Display file path
        document.getElementById('file-path').textContent = this.filePath;
        
        // Setup event handlers
        this.setupEventHandlers();
        
        // Load initial content
        this.loadLogContent();
    }
    
    setupEventHandlers() {
        // Search input
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.settings.search = searchInput.value;
                this.loadLogContent();
            }
        });
        
        // Case sensitive toggle
        document.getElementById('case-btn').addEventListener('click', (e) => {
            this.settings.caseSensitive = !this.settings.caseSensitive;
            e.currentTarget.classList.toggle('active');
        });
        
        // Regex toggle
        document.getElementById('regex-btn').addEventListener('click', (e) => {
            this.settings.regex = !this.settings.regex;
            e.currentTarget.classList.toggle('active');
        });
        
        // Lines input
        const linesInput = document.getElementById('lines-input');
        linesInput.addEventListener('change', () => {
            const value = parseInt(linesInput.value);
            if (value > 0) {
                this.settings.lines = value;
            } else {
                linesInput.value = this.settings.lines;
            }
        });
        
        // Reload button
        document.getElementById('reload-logs').addEventListener('click', () => {
            this.settings.search = document.getElementById('search-input').value;
            this.loadLogContent();
        });
        
        // Soft wrap checkbox
        document.getElementById('soft-wrap').addEventListener('change', (e) => {
            this.settings.softWrap = e.target.checked;
            const logContent = document.getElementById('log-content');
            if (this.settings.softWrap) {
                logContent.classList.add('soft-wrap');
            } else {
                logContent.classList.remove('soft-wrap');
            }
        });
        
        // Follow checkbox
        document.getElementById('follow').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.startFollowing();
            } else {
                this.stopFollowing();
            }
        });
        
        
        // Handle escape key to stop following
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isFollowing) {
                document.getElementById('follow').checked = false;
                this.stopFollowing();
            }
        });
    }
    
    async loadLogContent() {
        try {
            this.setStatus('Loading...', true);
            
            const params = new URLSearchParams({
                lines: this.settings.lines,
                search: this.settings.search,
                caseSensitive: this.settings.caseSensitive,
                regex: this.settings.regex
            });
            
            const headers = {};
            if (this.jwt) {
                headers['Authorization'] = `Bearer ${this.jwt}`;
            }
            
            const cleanPath = this.filePath.startsWith('/') ? this.filePath.substring(1) : this.filePath;
            const response = await fetch(`/api/logs/${encodeURIComponent(cleanPath)}/view?${params}`, {
                headers: headers
            });
            
            if (!response.ok) {
                throw new Error(`Failed to load log: ${response.statusText}`);
            }
            
            const data = await response.json();
            this.displayLogContent(data.content);
            this.setStatus('Ready');
            
        } catch (error) {
            this.showError(error.message);
            this.setStatus('Error');
        }
    }
    
    displayLogContent(content) {
        const logContent = document.getElementById('log-content');
        logContent.textContent = content || '(No matching log entries)';
        
        // Update line count
        const lines = content ? content.split('\n').filter(l => l).length : 0;
        document.getElementById('line-count').textContent = `${lines} lines`;
        
        // Scroll to bottom if in follow mode
        if (this.isFollowing) {
            this.scrollToBottom();
        }
    }
    
    appendLogLine(line) {
        const logContent = document.getElementById('log-content');
        if (logContent.textContent === '(No matching log entries)') {
            logContent.textContent = line;
        } else {
            logContent.textContent += '\n' + line;
        }
        
        // Update line count
        const lines = logContent.textContent.split('\n').length;
        document.getElementById('line-count').textContent = `${lines} lines`;
        
        // Auto scroll to bottom
        this.scrollToBottom();
    }
    
    scrollToBottom() {
        const container = document.getElementById('log-container');
        container.scrollTop = container.scrollHeight;
    }
    
    startFollowing() {
        if (this.isFollowing) return;
        
        this.isFollowing = true;
        this.setStatus('Connecting...', true);
        this.setConnectionStatus('connecting');
        
        // Update search setting from current input value
        const searchInput = document.getElementById('search-input');
        this.settings.search = searchInput.value;
        
        // Disable search controls while following
        this.setControlsEnabled(false);
        
        // Clear current content
        document.getElementById('log-content').textContent = '';
        
        // Build WebSocket URL
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const params = new URLSearchParams({
            search: this.settings.search,
            caseSensitive: this.settings.caseSensitive,
            regex: this.settings.regex
        });
        
        const cleanPath = this.filePath.startsWith('/') ? this.filePath.substring(1) : this.filePath;
        const wsUrl = `${protocol}//${window.location.host}/api/logs/${encodeURIComponent(cleanPath)}/follow?${params}`;
        
        console.log('WebSocket URL:', wsUrl);
        console.log('Search params:', {
            search: this.settings.search,
            caseSensitive: this.settings.caseSensitive,
            regex: this.settings.regex
        });
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            // Send authentication if JWT is present
            if (this.jwt) {
                this.ws.send(JSON.stringify({
                    type: 'auth',
                    token: this.jwt
                }));
            }
            this.setStatus('Following log...', true);
            this.setConnectionStatus('connected');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                if (msg.type === 'authenticated') {
                    // Authentication successful
                    console.log('WebSocket authenticated');
                } else if (msg.type === 'log') {
                    // New log line
                    this.appendLogLine(msg.data);
                } else if (msg.type === 'error') {
                    this.showError(msg.data);
                    this.stopFollowing();
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showError('WebSocket connection error');
            this.setConnectionStatus('disconnected');
            this.stopFollowing();
        };
        
        this.ws.onclose = () => {
            this.setConnectionStatus('disconnected');
            if (this.isFollowing) {
                this.setStatus('Connection closed');
                this.stopFollowing();
            }
        };
    }
    
    stopFollowing() {
        if (!this.isFollowing) return;
        
        this.isFollowing = false;
        document.getElementById('follow').checked = false;
        
        // Close WebSocket
        if (this.ws) {
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'stop' }));
            }
            this.ws.close();
            this.ws = null;
        }
        
        // Re-enable search controls
        this.setControlsEnabled(true);
        this.setStatus('Ready');
        this.setConnectionStatus('disconnected');
        
        // Reload content with current filters
        this.loadLogContent();
    }
    
    setControlsEnabled(enabled) {
        const controls = [
            'search-input',
            'case-btn',
            'regex-btn',
            'lines-input',
            'reload-logs'
        ];
        
        controls.forEach(id => {
            const element = document.getElementById(id);
            if (enabled) {
                element.classList.remove('disabled');
            } else {
                element.classList.add('disabled');
            }
        });
    }
    
    setStatus(text, showSpinner = false) {
        document.getElementById('status-text').textContent = text;
        document.getElementById('status-spinner').style.display = showSpinner ? 'inline-block' : 'none';
    }
    
    setConnectionStatus(status) {
        const indicator = document.getElementById('connection-status');
        if (!indicator) return;
        
        // Remove all status classes
        indicator.classList.remove('connected', 'disconnected', 'connecting');
        
        // Add the appropriate class
        indicator.classList.add(status);
        
        // Update tooltip
        const tooltips = {
            connected: 'WebSocket connected',
            disconnected: 'WebSocket disconnected',
            connecting: 'Connecting...'
        };
        indicator.title = tooltips[status] || '';
    }
    
    showError(message) {
        console.error(message);
        this.setStatus(`Error: ${message}`);
        
        // Show error in content area if empty
        const logContent = document.getElementById('log-content');
        if (!logContent.textContent || logContent.textContent === '(No matching log entries)') {
            logContent.textContent = `Error: ${message}`;
        }
    }
    
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.logViewer = new LogViewer();
});