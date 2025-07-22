// Main application entry point
class DendriteApp {
    constructor() {
        this.api = new DendriteAPI();
        this.ui = null;
        
        this.init();
    }
    
    async init() {
        try {
            // Initialize UI
            this.ui = new UI(this.api);
            
            // Load initial data - use path from URL if available
            const initialPath = this.ui.getPathFromURL();
            await this.ui.loadFiles(initialPath);
            
            // Update quota information on initial load
            await this.ui.updateQuotaInfo();
            
            console.log('Dendrite File Manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Dendrite:', error);
            showError('Failed to initialize application: ' + error.message);
        }
    }
}

// Start the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dendriteApp = new DendriteApp();
});