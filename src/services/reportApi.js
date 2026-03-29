import api from '../config/api';
import { env } from '@/config/env';

/**
 * Report API Service
 */

/**
 * Fetch customer master report data
 * @param {Object} params - Filter and pagination params
 * @returns {Promise<Object>}
 */
export const getCustomerReport = async (params = {}) => {
    try {
        const response = await api.get('/reports/customers', params);
        return response.data;
    } catch (error) {
        console.error('Error fetching customer report:', error);
        throw error;
    }
};

/**
 * Fetch filter options for the report
 * @returns {Promise<Object>}
 */
export const getReportOptions = async () => {
    try {
        const response = await api.get('/reports/options');
        return response.data;
    } catch (error) {
        console.error('Error fetching report options:', error);
        throw error;
    }
};

/**
 * Export report to CSV
 * @param {Object} params - Filters
 */
export const exportCustomerReport = (params = {}) => {
    const queryParams = new URLSearchParams();
    Object.keys(params).forEach(key => {
        if (params[key]) {
            queryParams.append(key, params[key]);
        }
    });

    const url = `${env.API_URL}/reports/customers/export?${queryParams.toString()}`;
    window.open(url, '_blank');
};

/**
 * Export report to file as blob
 * @param {string} type - 'csv', 'excel', 'pdf'
 * @param {Object} params - Filters
 * @returns {Promise<Blob>}
 */
export const exportCustomerReportBlob = async (type = 'csv', params = {}) => {
    try {
        let endpoint = '/reports/customers/export';
        if (type === 'excel') endpoint += '/excel';
        if (type === 'pdf') endpoint += '/pdf';

        const response = await api.get(endpoint, params, {
            responseType: 'blob'
        });

        return response;
    } catch (error) {
        console.error(`Error exporting ${type} report:`, error);
        throw error;
    }
};

// Follow-up Tracker Report
export const getFollowUpReport = async (params) => {
    try {
        const response = await api.get('/reports/followups', params);
        return response.data;
    } catch (error) {
        console.error('Error fetching follow-up report:', error);
        throw error;
    }
};

export const exportFollowUpExcelBlob = async (params) => {
    try {
        const response = await api.get('/reports/followups/export/excel', params, {
            responseType: 'blob'
        });
        return response;
    } catch (error) {
        console.error('Error exporting follow-up excel:', error);
        throw error;
    }
};

export const exportFollowUpPDFBlob = async (params) => {
    try {
        const response = await api.get('/reports/followups/export/pdf', params, {
            responseType: 'blob'
        });
        return response;
    } catch (error) {
        console.error('Error exporting follow-up pdf:', error);
        throw error;
    }
};

// Reminder Report
export const getReminderReport = async (params) => {
    try {
        const response = await api.get('/reports/reminders', params);
        return response.data;
    } catch (error) {
        console.error('Error fetching reminder report:', error);
        throw error;
    }
};

export const exportReminderExcelBlob = async (params) => {
    try {
        const response = await api.get('/reports/reminders/export/excel', params, {
            responseType: 'blob'
        });
        return response;
    } catch (error) {
        console.error('Error exporting reminder excel:', error);
        throw error;
    }
};

export const exportReminderPDFBlob = async (params) => {
    try {
        const response = await api.get('/reports/reminders/export/pdf', params, {
            responseType: 'blob'
        });
        return response;
    } catch (error) {
        console.error('Error exporting reminder pdf:', error);
        throw error;
    }
};

// Open Reminders Report
export const getOpenRemindersReport = async (params) => {
    try {
        const response = await api.get('/reports/open-reminders', params);
        return response;
    } catch (error) {
        console.error('Error fetching open reminders report:', error);
        throw error;
    }
};

export const exportOpenRemindersExcelBlob = async (params) => {
    try {
        const response = await api.get('/reports/open-reminders/export/excel', params, {
            responseType: 'blob'
        });
        return response;
    } catch (error) {
        console.error('Error exporting open reminders excel:', error);
        throw error;
    }
};

export const exportOpenRemindersPDFBlob = async (params) => {
    try {
        const response = await api.get('/reports/open-reminders/export/pdf', params, {
            responseType: 'blob'
        });
        return response;
    } catch (error) {
        console.error('Error exporting open reminders pdf:', error);
        throw error;
    }
};

export default {
    getCustomerReport,
    getReportOptions,
    exportCustomerReport,
    exportCustomerReportBlob,
    getFollowUpReport,
    exportFollowUpExcelBlob,
    exportFollowUpPDFBlob,
    getReminderReport,
    exportReminderExcelBlob,
    exportReminderPDFBlob,
    getOpenRemindersReport,
    exportOpenRemindersExcelBlob,
    exportOpenRemindersPDFBlob
};
