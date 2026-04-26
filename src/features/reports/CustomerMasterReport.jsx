import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FilterPanel } from './components/FilterPanel';
import { ReportTable } from './components/ReportTable';
import { getCustomerReport, getReportOptions, exportCustomerReportBlob } from '@/services/reportApi';
import { ChevronLeft, ChevronRight, Loader2, FileSpreadsheet, FileText, Download } from 'lucide-react';
import { Button, BrandedLoader } from '@/components/ui';
import styles from './CustomerMasterReport.module.scss';

export const CustomerMasterReport = () => {
    // Refs
    const resultsRef = useRef(null);
    const searchTimeoutRef = useRef(null);

    // State
    const [data, setData] = useState([]);
    const [meta, setMeta] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(null); // 'excel', 'pdf', 'csv' or null
    const [options, setOptions] = useState({ statuses: [], cities: [], states: [], brands: [] });

    // Filters & Sorting state
    const [filters, setFilters] = useState({
        q: '',
        status: '',
        city: '',
        state: '',
        interestedProduct: '',
        customerType: ''
    });

    const [sortConfig, setSortConfig] = useState({
        sortBy: 'customerName',
        sortOrder: 'asc'
    });

    // Initial Load
    useEffect(() => {
        fetchOptions();
        fetchReport(1, filters, sortConfig, false); // Don't scroll on initial load
    }, []);

    const fetchOptions = async () => {
        try {
            const optData = await getReportOptions();
            setOptions({
                statuses: optData.statuses || [],
                cities: optData.cities || [],
                states: optData.states || [],
                products: optData.products || [],
                types: optData.types || []
            });
        } catch (error) {
            console.error('Failed to fetch filter options:', error);
        }
    };

    const fetchReport = async (page = 1, currentFilters = filters, currentSort = sortConfig, shouldScroll = true) => {
        setLoading(true);
        try {
            const params = {
                ...currentFilters,
                ...currentSort,
                page,
                limit: meta.limit
            };
            const response = await getCustomerReport(params);
            setData(response.data || []);
            setMeta(response.meta || { ...meta, page });

            // Scroll to results if data found and not initial load
            if (shouldScroll && response.data?.length > 0 && resultsRef.current) {
                setTimeout(() => {
                    resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        } catch (error) {
            console.error('Failed to fetch report data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Event Handlers
    const handleFilterChange = (name, value) => {
        const newFilters = { ...filters, [name]: value };
        setFilters(newFilters);

        // Auto-apply logic
        if (name === 'q') {
            // Debounce search
            if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
            searchTimeoutRef.current = setTimeout(() => {
                setMeta(prev => ({ ...prev, page: 1 }));
                fetchReport(1, newFilters);
            }, 500);
        } else {
            // Instant apply for dropdowns and dates
            setMeta(prev => ({ ...prev, page: 1 }));
            fetchReport(1, newFilters);
        }
    };

    const handleApplyFilters = () => {
        setMeta(prev => ({ ...prev, page: 1 }));
        fetchReport(1);
    };

    const handleReset = () => {
        const resetFilters = {
            q: '',
            status: '',
            city: '',
            state: '',
            interestedProduct: '',
            customerType: ''
        };
        setFilters(resetFilters);
        setMeta(prev => ({ ...prev, page: 1 }));
        fetchReport(1, resetFilters);
    };

    const handleSort = (key) => {
        let order = 'desc';
        if (sortConfig.sortBy === key && sortConfig.sortOrder === 'desc') {
            order = 'asc';
        }
        const newSort = { sortBy: key, sortOrder: order };
        setSortConfig(newSort);
        fetchReport(1, filters, newSort);
    };

    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > meta.totalPages) return;
        fetchReport(newPage);
    };

    const handleExport = async (type) => {
        setExporting(type);
        try {
            const blob = await exportCustomerReportBlob(type, { ...filters, ...sortConfig });

            // Create a link and trigger download
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            const extensions = { csv: 'csv', excel: 'xlsx', pdf: 'pdf' };
            const fileName = `Customer_Master_Report_${new Date().toISOString().split('T')[0]}.${extensions[type]}`;

            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.parentNode.removeChild(link);
        } catch (error) {
            console.error(`Failed to export ${type} report:`, error);
            alert(`Error generating ${type} report. Please try again.`);
        } finally {
            setExporting(null);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>
                    Customer Master Report
                    <span className={styles.subtitle}> — View and export comprehensive customer data with advanced filtering.</span>
                </h1>
            </div>

            <FilterPanel
                filters={filters}
                options={options}
                onFilterChange={handleFilterChange}
                onApply={handleApplyFilters}
                onReset={handleReset}
                onExport={() => handleExport('csv')}
                exporting={exporting}
            />

            <div className={styles.reportContent} ref={resultsRef}>
                <div className={styles.tableHeader}>
                    <div className={styles.resultsCount}>
                        Found <strong>{meta.total}</strong> customers
                    </div>
                    <div className={styles.exportActions}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('excel')}
                            disabled={exporting !== null || data.length === 0}
                            className={styles.excelBtn}
                        >
                            {exporting === 'excel' ? <Loader2 size={16} className={styles.spin} /> : <FileSpreadsheet size={16} />}
                            Export Excel
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('pdf')}
                            disabled={exporting !== null || data.length === 0}
                            className={styles.pdfBtn}
                        >
                            {exporting === 'pdf' ? <Loader2 size={16} className={styles.spin} /> : <FileText size={16} />}
                            Export PDF
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className={styles.loaderContainer}>
                        <BrandedLoader size={120} />
                    </div>
                ) : (
                    <>
                        <ReportTable
                            data={data}
                            sortConfig={sortConfig}
                            onSort={handleSort}
                        />

                        {/* Pagination */}
                        {meta.totalPages > 1 && (
                            <div className={styles.pagination}>
                                <div className={styles.paginationInfo}>
                                    Showing page {meta.page} of {meta.totalPages}
                                </div>
                                <div className={styles.paginationControls}>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(meta.page - 1)}
                                        disabled={meta.page === 1}
                                    >
                                        <ChevronLeft size={16} /> Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handlePageChange(meta.page + 1)}
                                        disabled={meta.page === meta.totalPages}
                                    >
                                        Next <ChevronRight size={16} />
                                    </Button>
                                </div>
                            </div>
                        )}

                        {data.length === 0 && (
                            <div className={styles.emptyState}>
                                <p>No customers match your criteria. Try adjusting the filters.</p>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
