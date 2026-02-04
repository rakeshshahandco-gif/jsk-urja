import { Search, RotateCcw, Download, Filter, Loader2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import styles from '../CustomerMasterReport.module.scss';

export const FilterPanel = ({ filters, options, onFilterChange, onApply, onReset, onExport, exporting }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onFilterChange(name, value);
    };

    return (
        <div className={styles.filterPanel}>
            <div className={styles.filterHeader}>
                <div className={styles.filterTitle}>
                    <Filter size={20} />
                    <span>Report Filters</span>
                </div>
                <div className={styles.actionButtons}>
                    <Button variant="outline" size="sm" onClick={onReset} className={styles.resetBtn}>
                        <RotateCcw size={16} /> Reset
                    </Button>
                    <Button variant="secondary" size="sm" onClick={onExport} className={styles.exportBtn} disabled={exporting !== null}>
                        {exporting === 'csv' ? <Loader2 size={16} className={styles.spin} /> : <Download size={16} />}
                        Export CSV
                    </Button>
                </div>
            </div>

            <div className={styles.filterGrid}>
                {/* Global Search */}
                <div className={styles.filterGroup}>
                    <label>Search</label>
                    <div className={styles.searchInputWrapper}>
                        <Search size={18} className={styles.searchIcon} />
                        <Input
                            name="q"
                            placeholder="Search name, company, mobile, email..."
                            value={filters.q || ''}
                            onChange={handleChange}
                            className={styles.searchInput}
                        />
                    </div>
                </div>

                {/* Status Dropdown */}
                <div className={styles.filterGroup}>
                    <label>Customer Status</label>
                    <select name="status" value={filters.status || ''} onChange={handleChange} className={styles.select}>
                        <option value="">All Statuses</option>
                        {options.statuses?.map(status => (
                            <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>
                        ))}
                    </select>
                </div>

                {/* City Dropdown */}
                <div className={styles.filterGroup}>
                    <label>City</label>
                    <select name="city" value={filters.city || ''} onChange={handleChange} className={styles.select}>
                        <option value="">All Cities</option>
                        {options.cities?.map(city => (
                            <option key={city} value={city}>{city}</option>
                        ))}
                    </select>
                </div>

                {/* State Dropdown */}
                <div className={styles.filterGroup}>
                    <label>State</label>
                    <select name="state" value={filters.state || ''} onChange={handleChange} className={styles.select}>
                        <option value="">All States</option>
                        {options.states?.map(state => (
                            <option key={state} value={state}>{state}</option>
                        ))}
                    </select>
                </div>

                {/* Product Interest Dropdown */}
                <div className={styles.filterGroup}>
                    <label>Product Interest</label>
                    <select name="interestedProduct" value={filters.interestedProduct || ''} onChange={handleChange} className={styles.select}>
                        <option value="">All Products</option>
                        {options.products?.map(product => (
                            <option key={product} value={product}>{product}</option>
                        ))}
                    </select>
                </div>

                {/* Business Type Dropdown */}
                <div className={styles.filterGroup}>
                    <label>Business Type</label>
                    <select name="customerType" value={filters.customerType || ''} onChange={handleChange} className={styles.select}>
                        <option value="">All Types</option>
                        {options.types?.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};
