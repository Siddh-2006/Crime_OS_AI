/**
 * Toast Notifier for Offline Operations
 * 
 * Shows user-friendly notifications when operations are queued offline.
 */

let toastCallback: ((message: string, type: 'success' | 'info' | 'warning' | 'error') => void) | null = null;

export const OfflineToastNotifier = {
  /**
   * Register a toast callback function.
   * This should be called from a component with useToast.
   */
  setToastCallback(callback: (message: string, type: 'success' | 'info' | 'warning' | 'error') => void) {
    toastCallback = callback;
  },

  /**
   * Show a toast notification.
   */
  show(message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') {
    if (toastCallback) {
      toastCallback(message, type);
    } else {
      // Fallback to console if no callback registered
      console.log(`[Toast ${type}]:`, message);
    }
  },

  /**
   * Show notification for queued operation.
   */
  showQueued(operationType: string = 'Operation') {
    this.show(
      `${operationType} saved. Will sync when you're back online.`,
      'info'
    );
  },

  /**
   * Show notification for online operation success.
   */
  showSuccess(message: string = 'Operation completed successfully') {
    this.show(message, 'success');
  },

  /**
   * Show notification for operation failure.
   */
  showError(message: string = 'Operation failed') {
    this.show(message, 'error');
  },
};
