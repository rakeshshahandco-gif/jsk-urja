import React, { useState, useEffect } from 'react';
import { Search, Filter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from '../CustomerMasterReport.module.scss';
import useDebounce from '@/hooks/useDebounce';

export const FollowUpFilterPanel = ({ filters, onFilterChange }) => {
    const [searchTerm, setSearchTerm] = useState(filters.q);
    const debouncedSearchTerm = useDebounce(searchTerm, 500);

    useEffect(() => {
        if (debouncedSearchTerm !== filters.q) {
            onFilterChange({ q: debouncedSearchTerm });
        }
    }, [debouncedSearchTerm, onFilterChange, filters.q]);

    const handleReset = () => {
        setSearchTerm('');
        onFilterChange({
            q: '',
            status: '',
            followUpType: '',
            priority: '',
            city: '',
            dateFrom: '',
            dateTo: ''
        });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        onFilterChange({ [name]: value });
    };

    return (
        <div className={styles.filterPanel}>
            <div className={styles.filterHeader}>
                <div className={styles.filterTitle}>
                    <Filter size={18} />
                    <span>Report Filters</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleReset}
                    className={styles.resetBtn}
                >
                    <RotateCcw size={14} style={{ marginRight: '6px' }} />
                    Reset Filters
                </Button>
            </div>

            <div className={styles.filterGrid}>
                {/* Search */}
                <div className={styles.filterGroup}>
                    <label>Search Follow-up / Customer</label>
                    <div className={styles.searchInputWrapper}>
                        <Search className={styles.searchIcon} size={18} />
                        <input
                            type="text"
                            placeholder="Name, Company, Mobile or Note..."
                            className={`${styles.select} ${styles.searchInput}`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Follow-up Type */}
                <div className={styles.filterGroup}>
                    <label>Follow-up Type</label>
                    <select
                        name="followUpType"
                        className={styles.select}
                        value={filters.followUpType}
                        onChange={handleChange}
                    >
                        <option value="">All Types</option>
                        <option value="CALL">📞 CALL</option>
                        <option value="WHATSAPP">💬 WHATSAPP</option>
                    </select>
                </div>

                {/* Reminder Status */}
                <div className={styles.filterGroup}>
                    <label>Reminder Status</label>
                    <select
                        name="status"
                        className={styles.select}
                        value={filters.status}
                        onChange={handleChange}
                    >
                        <option value="">All Statuses</option>
                        <option value="Pending">🔵 Pending</option>
                        <option value="Overdue">🔴 Overdue</option>
                        <option value="Closed">⚪ Closed</option>
                    </select>
                </div>

                {/* Priority */}
                <div className={styles.filterGroup}>
                    <label>Priority</label>
                    <select
                        name="priority"
                        className={styles.select}
                        value={filters.priority}
                        onChange={handleChange}
                    >
                        <option value="">All Priorities</option>
                        <option value="high">🔴 High</option>
                        <option value="medium">🟡 Medium</option>
                        <option value="low">🟢 Low</option>
                    </select>
                </div>

                {/* City */}
                <div className={styles.filterGroup}>
                    <label>Customer City</label>
                    <input
                        type="text"
                        name="city"
                        placeholder="Filter by city..."
                        className={styles.select}
                        value={filters.city}
                        onChange={handleChange}
                    />
                </div>

                {/* Date From */}
                <div className={styles.filterGroup}>
                    <label>Follow-up From</label>
                    <input
                        type="date"
                        name="dateFrom"
                        className={styles.select}
                        value={filters.dateFrom}
                        onChange={handleChange}
                    />
                </div>

                {/* Date To */}
                <div className={styles.filterGroup}>
                    <label>Follow-up To</label>
                    <input
                        type="date"
                        name="dateTo"
                        className={styles.select}
                        value={filters.dateTo}
                        onChange={handleChange}
                    />
                </div>
            </div>
        </div>
    );
};
