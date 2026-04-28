import React, { useState, useEffect } from 'react';
import { 
    Database, 
    Download, 
    History, 
    RefreshCw, 
    AlertTriangle, 
    ShieldCheck, 
    CheckCircle2, 
    XCircle, 
    Loader2, 
    FileArchive,
    UploadCloud,
    ArrowLeftRight
} from 'lucide-react';
import { Button } from '@/components/ui';
import { toast } from 'react-hot-toast';
import * as backupApi from '@/services/backupApi';
import moment from 'moment';
import styles from './BackupRestorePage.module.scss';
import { diagnosticService } from '@/services/diagnostic.service';

const BackupRestorePage = () => {
    const [backups, setBackups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [isRestoring, setIsRestoring] = useState(false);
    const [systemInfo, setSystemInfo] = useState(null);
    const [backupReason, setBackupReason] = useState('Manual Backup before deployment');

    const fetchBackups = async () => {
        try {
            setIsLoading(true);
            // Add a small delay to ensure token is picked up if redirecting
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const [backupData, diagnosticData] = await Promise.all([
                backupApi.getBackups().catch(err => {
                    console.error('getBackups error:', err);
                    return { data: [] };
                }),
                diagnosticService.getDiscovery().catch(err => {
                    console.error('getDiscovery error:', err);
                    return { data: null };
                })
            ]);
            
            if (backupData?.data) setBackups(backupData.data);
            if (diagnosticData?.data) setSystemInfo(diagnosticData.data);
            
        } catch (error) {
            console.error('Fetch backups error:', error);
            toast.error('Failed to load system data. Please check your connection.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchBackups();
    }, []);

    const handleTakeBackup = async () => {
        try {
            setIsBackingUp(true);
            const response = await backupApi.triggerBackup(backupReason);
            toast.success('Backup generated successfully!');
            fetchBackups();
        } catch (error) {
            toast.error('Backup failed: ' + (error.response?.data?.message || error.message));
        } finally {
            setIsBackingUp(false);
        }
    };

    const handleDownload = async (id) => {
        try {
            toast.loading('Preparing download...', { id: 'download' });
            await backupApi.downloadBackup(id);
            toast.success('Download started', { id: 'download' });
        } catch (error) {
            toast.error('Download failed', { id: 'download' });
        }
    };

    const handleRestore = async (id) => {
        const confirm = window.confirm(
            "⚠️ CRITICAL WARNING: You are about to restore the database from a backup. " +
            "This will OVERWRITE all current live data. " +
            "A safety backup of the current state will be taken automatically. " +
            "Are you absolutely sure you want to proceed?"
        );

        if (!confirm) return;

        const finalConfirm = window.prompt("To confirm restoration, please type 'RESTORE' below:");
        if (finalConfirm !== 'RESTORE') {
            toast.error('Restoration cancelled. Confirmation text mismatch.');
            return;
        }

        try {
            setIsRestoring(true);
            toast.loading('System restoration in progress. Please do not close the browser...', { id: 'restore' });
            await backupApi.restoreBackup(id);
            toast.success('System restored successfully!', { id: 'restore' });
            fetchBackups();
        } catch (error) {
            toast.error('Restoration failed: ' + (error.response?.data?.message || error.message), { id: 'restore' });
        } finally {
            setIsRestoring(false);
        }
    };

    const formatSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const dbCounts = systemInfo?.system?.databaseCounts || {};

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>Backup & Restore System</h1>
                    <p className={styles.subtitle}>Secure your live CRM data before Render deployments</p>
                </div>
                <div className={styles.actions}>
                    <Button 
                        variant="outline" 
                        onClick={fetchBackups} 
                        disabled={isLoading}
                        startIcon={<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />}
                    >
                        Refresh
                    </Button>
                </div>
            </div>

            <div className={styles.grid}>
                {/* PRE-DEPLOY CHECKLIST */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <ShieldCheck size={20} color="#10b981" />
                        <h3>Pre-Deploy Data Snapshot</h3>
                    </div>
                    <div className={styles.snapshotGrid}>
                        <div className={styles.snapshotItem}>
                            <span>Customers</span>
                            <strong>{dbCounts.Customer || 0}</strong>
                        </div>
                        <div className={styles.snapshotItem}>
                            <span>Items</span>
                            <strong>{dbCounts.Item || 0}</strong>
                        </div>
                        <div className={styles.snapshotItem}>
                            <span>Sales Invoices</span>
                            <strong>{dbCounts.SalesInvoice || 0}</strong>
                        </div>
                        <div className={styles.snapshotItem}>
                            <span>Sales Orders</span>
                            <strong>{dbCounts.SalesOrder || 0}</strong>
                        </div>
                        <div className={styles.snapshotItem}>
                            <span>Tasks</span>
                            <strong>{dbCounts.Task || 0}</strong>
                        </div>
                        <div className={styles.snapshotItem}>
                            <span>China Sourcing</span>
                            <strong>{dbCounts.ChinaSourcingGroup || 0}</strong>
                        </div>
                    </div>
                    <div className={styles.dbStatus}>
                        <CheckCircle2 size={14} color="#10b981" />
                        <span>Database: <strong>{systemInfo?.system?.databaseName}</strong> (Connected)</span>
                    </div>
                </div>

                {/* TAKE BACKUP ACTION */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <UploadCloud size={20} color="#3b82f6" />
                        <h3>Take Manual Backup</h3>
                    </div>
                    <p className={styles.description}>
                        This will create a full snapshot of the database (all collections) and the uploads folder.
                    </p>
                    <div className={styles.formGroup}>
                        <label>Backup Reason / Note</label>
                        <input 
                            type="text" 
                            value={backupReason} 
                            onChange={(e) => setBackupReason(e.target.value)}
                            placeholder="e.g. Before Render deploy v1.2"
                        />
                    </div>
                    <Button 
                        variant="primary" 
                        onClick={handleTakeBackup} 
                        isLoading={isBackingUp}
                        fullWidth
                        startIcon={<Database size={18} />}
                        style={{ marginTop: '16px', background: '#0f172a' }}
                    >
                        {isBackingUp ? 'Generating ZIP...' : 'Take Full Database Backup'}
                    </Button>
                </div>
            </div>

            {/* RESTORE WARNING */}
            <div className={styles.warningBanner}>
                <AlertTriangle size={24} />
                <div>
                    <h4>Safety Warning</h4>
                    <p>Backups are stored on the server. Always download critical backups to your local machine for permanent storage, as Render's local disk is cleared during deployment.</p>
                </div>
            </div>

            {/* BACKUP HISTORY */}
            <div className={styles.historySection}>
                <div className={styles.sectionHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <History size={20} />
                        <h2>Backup History</h2>
                    </div>
                    <span className={styles.countBadge}>{backups.length} Backups Found</span>
                </div>

                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Date & Time</th>
                                <th>Reason / Note</th>
                                <th>Size</th>
                                <th>Items Count</th>
                                <th style={{ width: '200px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {backups.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className={styles.empty}>No backup history found.</td>
                                </tr>
                            ) : backups.map((b) => (
                                <tr key={b.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{moment(b.date).format('DD MMM YYYY')}</div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>{moment(b.date).format('hh:mm A')}</div>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '13px' }}>{b.reason}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{b.id}</div>
                                    </td>
                                    <td style={{ color: '#1e293b', fontWeight: 500 }}>{formatSize(b.size)}</td>
                                    <td>
                                        <span className={styles.countInfo}>
                                            {b.counts?.SalesInvoice || 0} Invoices | {b.counts?.Customer || 0} Cust.
                                        </span>
                                    </td>
                                    <td>
                                        <div className={styles.btnGroup}>
                                            <button 
                                                className={styles.iconBtn} 
                                                title="Download ZIP"
                                                onClick={() => handleDownload(b.id)}
                                            >
                                                <Download size={18} />
                                            </button>
                                            <button 
                                                className={`${styles.iconBtn} ${styles.restoreBtn}`} 
                                                title="Restore this backup"
                                                onClick={() => handleRestore(b.id)}
                                                disabled={isRestoring}
                                            >
                                                <ArrowLeftRight size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default BackupRestorePage;
