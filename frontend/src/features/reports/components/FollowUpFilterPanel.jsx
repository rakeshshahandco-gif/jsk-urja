import React, { useState, useEffect } from 'react';
import { Search, RotateCcw } from 'lucide-react';
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
        onFilterChange({ q: '', status: '', followUpType: '', priority: '', city: '', dateFrom: '', dateTo: '' });
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        onFilterChange({ [name]: value });
    };

    return (
        <div className={styles.filterBar}>
            {/* Search */}
            <div className={styles.searchWrap}>
                <Search size={13} className={styles.searchIcon} />
                <input
                    type="text"
                    placeholder="Search name, company, mobile..."
                    className={styles.searchInput}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Follow-up Type */}
            <select name="followUpType" className={styles.select} value={filters.followUpType} onChange={handleChange}>
                <option value="">All Types</option>
                <option value="CALL">📞 CALL</option>
                <option value="WHATSAPP">💬 WHATSAPP</option>
            </select>

            {/* Reminder Status */}
            <select name="status" className={styles.select} value={filters.status} onChange={handleChange}>
                <option value="">All Statuses</option>
                <option value="Pending">🔵 Pending</option>
                <option value="Overdue">🔴 Overdue</option>
                <option value="Closed">⚪ Closed</option>
            </select>

            {/* Priority */}
            <select name="priority" className={styles.select} value={filters.priority} onChange={handleChange}>
                <option value="">All Priorities</option>
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🟢 Low</option>
            </select>

            {/* City */}
            <input
                type="text"
                name="city"
                placeholder="Filter by city..."
                className={styles.select}
                style={{ minWidth: 110, height: 32 }}
                value={filters.city}
                onChange={handleChange}
            />

            {/* From Date */}
            <input
                type="date"
                name="dateFrom"
                className={styles.select}
                style={{ minWidth: 120, height: 32 }}
                value={filters.dateFrom}
                onChange={handleChange}
            />

            {/* To Date */}
            <input
                type="date"
                name="dateTo"
                className={styles.select}
                style={{ minWidth: 120, height: 32 }}
                value={filters.dateTo}
                onChange={handleChange}
            />

            {/* Reset */}
            <Button variant="outline" size="sm" onClick={handleReset} className={styles.resetBtn}>
                <RotateCcw size={13} /> Reset
            </Button>
        </div>
    );
};
