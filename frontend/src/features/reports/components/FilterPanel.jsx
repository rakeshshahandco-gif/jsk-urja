import { Search, RotateCcw, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import styles from '../CustomerMasterReport.module.scss';

export const FilterPanel = ({ filters, options, onFilterChange, onApply, onReset, onExport, exporting }) => {
    const handleChange = (e) => {
        const { name, value } = e.target;
        onFilterChange(name, value);
    };

    return (
        <div className={styles.filterBar}>
            {/* Search */}
            <div className={styles.searchWrap}>
                <Search size={13} className={styles.searchIcon} />
                <input
                    name="q"
                    placeholder="Search name, company, mobile, email..."
                    value={filters.q || ''}
                    onChange={handleChange}
                    className={styles.searchInput}
                />
            </div>

            {/* Customer Status */}
            <select name="status" value={filters.status || ''} onChange={handleChange} className={styles.select}>
                <option value="">All Statuses</option>
                {options.statuses?.map(s => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
            </select>

            {/* City */}
            <select name="city" value={filters.city || ''} onChange={handleChange} className={styles.select}>
                <option value="">All Cities</option>
                {options.cities?.map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {/* State */}
            <select name="state" value={filters.state || ''} onChange={handleChange} className={styles.select}>
                <option value="">All States</option>
                {options.states?.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            {/* Product Interest */}
            <select name="interestedProduct" value={filters.interestedProduct || ''} onChange={handleChange} className={styles.select}>
                <option value="">All Products</option>
                {options.products?.map(p => <option key={p} value={p}>{p}</option>)}
            </select>

            {/* Business Type */}
            <select name="customerType" value={filters.customerType || ''} onChange={handleChange} className={styles.select}>
                <option value="">All Types</option>
                {options.types?.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            {/* Reset */}
            <Button variant="outline" size="sm" onClick={onReset} className={styles.resetBtn}>
                <RotateCcw size={13} /> Reset
            </Button>

            {/* Export CSV */}
            <Button variant="secondary" size="sm" onClick={onExport} className={styles.exportBtn} disabled={exporting !== null}>
                {exporting === 'csv' ? <Loader2 size={13} className={styles.spin} /> : <Download size={13} />}
                CSV
            </Button>
        </div>
    );
};
