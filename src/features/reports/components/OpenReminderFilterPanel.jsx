import React from 'react';
import { Search, X } from 'lucide-react';
import { Input, Select, Button } from '@/components/ui';
import styles from '../CustomerMasterReport.module.scss'; // Reusing styles

export const OpenReminderFilterPanel = ({ filters, onFilterChange }) => {
    const handleInputChange = (field, value) => {
        onFilterChange({ ...filters, [field]: value });
    };

    const handleClearFilters = () => {
        onFilterChange({
            search: '',
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
                        placeholder="Search name, mobile, company, note..."
                        className={styles.searchInput}
                        value={filters.search || ''}
                        onChange={(e) => handleInputChange('search', e.target.value)}
                    />
                </div>

                <Select
                    value={filters.priority}
                    onChange={(value) => handleInputChange('priority', value)}
                    options={[
                        { value: 'high', label: 'High Priority' },
                        { value: 'medium', label: 'Medium Priority' },
                        { value: 'low', label: 'Low Priority' }
                    ]}
                    placeholder="All Priorities"
                    className="w-40"
                />

                <Select
                    value={filters.followUpType}
                    onChange={(value) => handleInputChange('followUpType', value)}
                    options={[
                        { value: 'CALL', label: 'Call' },
                        { value: 'WHATSAPP', label: 'WhatsApp' }
                    ]}
                    placeholder="All Types"
                    className="w-36"
                />

                <div className="flex items-center gap-2">
                    <Input
                        type="date"
                        value={filters.dateFrom || ''}
                        onChange={(e) => handleInputChange('dateFrom', e.target.value)}
                        className="w-36"
                        placeholder="From Date"
                    />
                    <span className="text-gray-400">-</span>
                    <Input
                        type="date"
                        value={filters.dateTo || ''}
                        onChange={(e) => handleInputChange('dateTo', e.target.value)}
                        className="w-36"
                        placeholder="To Date"
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <Button variant="outline" onClick={handleClearFilters} title="Clear Filters">
                        <X size={16} /> Clear
                    </Button>
                </div>
            </div>
        </div>
    );
};
