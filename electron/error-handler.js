class ErrorHandler {
    constructor() {
        this.errorListeners = new Set();
    }

    initialize(showNotification) {
        this.showNotification = showNotification;

        // Set up global error handlers
        process.on('uncaughtException', (error) => {
            this.handleError(error, 'Uncaught Exception');
        });

        process.on('unhandledRejection', (error) => {
            this.handleError(error, 'Unhandled Rejection');
        });
    }

    handleError(error, source = 'Application') {
        console.error(`[${source}] Error:`, error);

        // Log additional details for specific error types
        if (error.code === 'ECONNREFUSED') {
            console.error('Connection refused. This might indicate that a required server is not running.');
            if (error.address === 'localhost' && error.port === 8788) {
                console.error('OAuth server appears to be unavailable. Attempting to restart...');
                this.notifyListeners('oauth-server-error', error);
            }
        }

        // Show notification if available
        if (this.showNotification) {
            this.showNotification(
                `${source} Error`,
                error.message || 'An unexpected error occurred',
                'error'
            );
        }

        // Notify all error listeners
        this.notifyListeners('error', { error, source });
    }

    addListener(listener) {
        this.errorListeners.add(listener);
    }

    removeListener(listener) {
        this.errorListeners.delete(listener);
    }

    notifyListeners(type, data) {
        this.errorListeners.forEach(listener => {
            try {
                listener(type, data);
            } catch (error) {
                console.error('Error in error listener:', error);
            }
        });
    }

    // Helper method to wrap async functions with error handling
    async wrapAsync(fn, source) {
        try {
            return await fn();
        } catch (error) {
            this.handleError(error, source);
            throw error; // Re-throw to allow caller to handle if needed
        }
    }

    // Helper method to wrap event handlers
    wrapHandler(fn, source) {
        return (...args) => {
            try {
                return fn(...args);
            } catch (error) {
                this.handleError(error, source);
                throw error;
            }
        };
    }
}

module.exports = new ErrorHandler();
