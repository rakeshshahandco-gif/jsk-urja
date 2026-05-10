import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Search, FileText, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { getFollowUpReport, exportFollowUpExcelBlob, exportFollowUpPDFBlob } from '@/services/reportApi';
import { FollowUpFilterPanel } from './components/FollowUpFilterPanel';
import { FollowUpReportTable } from './components/FollowUpReportTable';
import styles from './CustomerMasterReport.module.scss';
import { useToast } from '@/components/ui/Toast';

/**
 * Follow-up Tracker Report Component
 * Provides a comprehensive view of all follow-ups with filtering and export options.
 */
export const FollowUpTrackerReport = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { addToast } = useToast();

    // State
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState(null);
    const [reportData, setReportData] = useState({ results: [], totalResults: 0, totalPages: 0 });

    // Initial filters from search params
    const [filters, setFilters] = useState({
        q: searchParams.get('q') || '',
        status: searchParams.get('status') || '',
        followUpType: searchParams.get('followUpType') || '',
        priority: searchParams.get('priority') || '',
        city: searchParams.get('city') || '',
        dateFrom: searchParams.get('dateFrom') || '',
        dateTo: searchParams.get('dateTo') || ''
    });

    const [pagination, setPagination] = useState({
        page: parseInt(searchParams.get('page') || '1', 10),
        limit: 25,
        sortBy: searchParams.get('sortBy') || 'reminderDate',
        sortOrder: searchParams.get('sortOrder') || 'desc'
    });

    /**
     * Fetch report data from API
     */
    const fetchReport = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                ...filters,
                ...pagination
            };
            const data = await getFollowUpReport(params);
            if (data && data.results) {
                setReportData(data);
            } else {
                setReportData({ results: [], totalResults: 0, totalPages: 0 });
            }
        } catch (error) {
            console.error('Error fetching report:', error);
            if (addToast) addToast('Failed to load report data', 'error');
        } finally {
            setLoading(false);
        }
    }, [filters, pagination, addToast]);

    // Update URL when filters or pagination change
    useEffect(() => {
        const newParams = new URLSearchParams();
        Object.entries({ ...filters, page: pagination.page, sortBy: pagination.sortBy, sortOrder: pagination.sortOrder }).forEach(([key, value]) => {
            if (value) newParams.set(key, value);
        });

        // Only update if different to avoid potential loops
        if (newParams.toString() !== searchParams.toString()) {
            setSearchParams(newParams, { replace: true });
        }
    }, [filters, pagination, searchParams, setSearchParams]);

    // Initial and dependency-based fetch
    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    const handleFilterChange = (newFilters) => {
        setFilters(prev => ({ ...prev, ...newFilters }));
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const handleSort = (key) => {
        setPagination(prev => {
            const isSameField = prev.sortBy === key;
            const newOrder = isSameField && prev.sortOrder === 'asc' ? 'desc' : 'asc';
            return {
                ...prev,
                sortBy: key,
                sortOrder: newOrder,
                page: 1
            };
        });
    };

    const handleExport = async (type) => {
        setExporting(type);
        try {
            const params = { ...filters };
            let blob;
            let filename = `FollowUp_Report_${new Date().toISOString().split('T')[0]}`;

            if (type === 'excel') {
                blob = await exportFollowUpExcelBlob(params);
                filename += '.xlsx';
            } else {
                blob = await exportFollowUpPDFBlob(params);
                filename += '.pdf';
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            if (addToast) addToast(`Exported report to ${type.toUpperCase()}`, 'success');
        } catch (error) {
            console.error('Export failed:', error);
            if (addToast) addToast('Export failed. Please try again.', 'error');
        } finally {
            setExporting(null);
        }
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>
                    Follow-up Tracker Report
                    <span className={styles.subtitle}> — Track all pending, overdue and completed follow-up tasks</span>
                </h1>
            </header>

            <FollowUpFilterPanel
                filters={filters}
                onFilterChange={handleFilterChange}
            />

            <div className={styles.reportContent}>
                <div className={styles.tableHeader}>
                    <div className={styles.resultsCount}>
                        {loading ? 'Searching...' : (
                            <>Found <strong>{reportData.totalResults || 0}</strong> follow-ups</>
                        )}
                    </div>
                    <div className={styles.exportActions}>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('excel')}
                            disabled={exporting || loading}
                            className={styles.excelBtn}
                        >
                            {exporting === 'excel' ? <Loader2 size={16} className={styles.spin} /> : <Download size={16} />}
                            Export Excel
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExport('pdf')}
                            disabled={exporting || loading}
                            className={styles.pdfBtn}
                        >
                            {exporting === 'pdf' ? <Loader2 size={16} className={styles.spin} /> : <FileText size={16} />}
                            Export PDF
                        </Button>
                    </div>
                </div>

                <FollowUpReportTable
                    data={reportData.results || []}
                    loading={loading}
                    onSort={handleSort}
                    sortBy={pagination.sortBy}
                    sortOrder={pagination.sortOrder}
                />

                {!loading && reportData.totalPages > 1 && (
                    <div className={styles.pagination}>
                        <div className={styles.paginationInfo}>
                            Showing page {pagination.page} of {reportData.totalPages}
                        </div>
                        <div className={styles.paginationControls}>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={pagination.page === 1}
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                            >
                                Previous
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={pagination.page === reportData.totalPages}
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
