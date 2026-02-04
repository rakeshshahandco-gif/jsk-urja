import React, { useState } from 'react';
import { Search, Calendar, Filter, X } from 'lucide-react';
import { Input, Select, Button } from '@/components/ui';
import styles from '../CustomerMasterReport.module.scss'; // Reusing styles

export const ReminderFilterPanel = ({ filters, onFilterChange }) => {
    const handleInputChange = (field, value) => {
        onFilterChange({ ...filters, [field]: value });
    };

    const handleClearFilters = () => {
        onFilterChange({
            search: '',
            status: 'All', // Default handled by parent usually, or 'All'
            priority: '',
            followUpType: '',
            dateFrom: '',
            dateTo: ''
        });
    };

    return (
        <div className={styles.filterSection}>
            <div className={styles.filterRow}>
                <div className={styles.searchWrapper}>
                    <Search className={styles.searchIcon} size={20} />
                    <input
                        type="text"
                        placeholder="Search customer, company, mobile, note..."
                        className={styles.searchInput}
                        value={filters.search || ''}
                        onChange={(e) => handleInputChange('search', e.target.value)}
                    />
                </div>

                {/* Tabs are handled in parent, this is Top Panel filters */}
            </div>

            <div className={styles.filterRow}>
                <Select
                    label="Priority"
                    options={[
                        { value: '', label: 'All Priorities' },
                        { value: 'high', label: 'High' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'low', label: 'Low' },
                    ]}
                    value={filters.priority || ''}
                    onChange={(e) => handleInputChange('priority', e.target.value)}
                    className={styles.filterSelect}
                />

                <Select
                    label="Type"
                    options={[
                        { value: '', label: 'All Types' },
                        { value: 'CALL', label: 'Call' },
                        { value: 'WHATSAPP', label: 'WhatsApp' },
                    ]}
                    value={filters.followUpType || ''}
                    onChange={(e) => handleInputChange('followUpType', e.target.value)}
                    className={styles.filterSelect}
                />

                {/* Date Range */}
                <Input
                    label="From"
                    type="date"
                    value={filters.dateFrom || ''}
                    onChange={(e) => handleInputChange('dateFrom', e.target.value)}
                    className={styles.filterInput}
                />
                <Input
                    label="To"
                    type="date"
                    value={filters.dateTo || ''}
                    onChange={(e) => handleInputChange('dateTo', e.target.value)}
                    className={styles.filterInput}
                />

                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <Button variant="outline" onClick={handleClearFilters} title="Clear Filters">
                        <X size={16} /> Clear
                    </Button>
                </div>
            </div>
        </div>
    );
};
