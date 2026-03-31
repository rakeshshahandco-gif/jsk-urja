/**
 * Get Financial Year from a date string or Date object
 * Assumes Indian Financial Year (April 1st to March 31st)
 * @param {Date|string} date 
 * @returns {string} e.g. "2025-2026"
 */
export const getFYFromDate = (date) => {
    const d = new Date(date);
    const month = d.getMonth(); // 0-indexed (0 = Jan, 3 = April)
    const year = d.getFullYear();

    if (month >= 3) {
        // From April to December
        return `${year}-${year + 1}`;
    } else {
        // From January to March
        return `${year - 1}-${year}`;
    }
};

/**
 * Get the short version of the Financial Year string (e.g. "25-26")
 * @param {string} fy e.g. "2025-2026"
 * @returns {string} e.g. "25-26"
 */
export const getShortFY = (fy) => {
    if (!fy || !fy.includes('-')) return '';
    const parts = fy.split('-');
    return `${parts[0].slice(-2)}-${parts[1].slice(-2)}`;
};

/**
 * Check if a date belongs to a specific Financial Year
 * @param {Date|string} date 
 * @param {string} fyName e.g. "2025-2026"
 * @returns {boolean}
 */
export const isDateInFY = (date, fyName) => {
    return getFYFromDate(date) === fyName;
};
