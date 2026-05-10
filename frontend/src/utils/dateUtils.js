/**
 * Safe date formatter to prevent "Invalid Date" displays
 * @param {string|Date|null} value - The date value to format
 * @param {Object} options - Standard Intl.DateTimeFormat options
 * @returns {string} - Formatted date or fallback
 */
export const formatDateSafe = (value, options = {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
}) => {
    if (!value) return '—';

    const d = new Date(value);
    if (isNaN(d.getTime())) {
        console.warn('Invalid date value received:', value);
        return '—';
    }

    try {
        return d.toLocaleDateString('en-IN', options);
    } catch (e) {
        console.error('Date formatting error:', e);
        return '—';
    }
};

/**
 * Full date and time formatter
 */
export const formatDateTimeSafe = (value) => {
    return formatDateSafe(value, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};
