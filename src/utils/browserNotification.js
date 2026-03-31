/**
 * Utility for Browser Desktop Notifications.
 * Works on localhost and production (Render).
 */

const DEFAULT_ICON = '/vite.svg';

export const isNotificationSupported = () => {
    return 'Notification' in window;
};

export const getNotificationPermission = () => {
    return isNotificationSupported() ? Notification.permission : 'denied';
};

export const requestNotificationPermission = async () => {
    if (!isNotificationSupported()) return 'denied';
    
    // Some browsers return a promise, others use a callback
    const permission = await Notification.requestPermission();
    return permission;
};

/**
 * Show a desktop notification
 * @param {Object} options 
 * @param {string} options.title Notification title
 * @param {string} options.body Notification body message
 * @param {string} options.icon Optional icon URL
 * @param {string} options.url URL to navigate to on click (relative or absolute)
 * @param {string} options.tag Optional tag to group notifications
 */
export const showBrowserNotification = ({ title, body, icon, url, tag }) => {
    if (!isNotificationSupported() || Notification.permission !== 'granted') {
        return null;
    }

    const origin = window.location.origin;
    const fullIconPath = icon ? (icon.startsWith('http') ? icon : `${origin}${icon}`) : `${origin}${DEFAULT_ICON}`;
    
    const notification = new Notification(title, {
        body,
        icon: fullIconPath,
        tag: tag || 'crm-notification',
        requireInteraction: false, // Auto-close based on OS settings
    });

    notification.onclick = (event) => {
        event.preventDefault();
        
        // Focus the existing window/tab
        window.focus();
        
        if (url) {
            // Handle navigation
            const targetUrl = url.startsWith('/') ? `${origin}${url}` : url;
            
            // If it's a SPA, we might want to use the router, 
            // but window.location.href is reliable from a notification click.
            // Using a relative path for the SPA router is preferred if possible,
            // but for simplicity and robustness across domains, absolute works.
            window.location.href = targetUrl;
        }
        
        notification.close();
    };

    return notification;
};
