import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
    ArrowLeftRight,
    Lock,
    Trash2
} from 'lucide-react';
import { Button, Modal } from '@/components/ui';
import { toast } from 'react-hot-toast';
import * as backupApi from '@/services/backupApi';
import moment from 'moment';
import styles from './BackupRestorePage.module.scss';
import { diagnosticService } from '@/services/diagnostic.service';

/** Read counts from backup index (Mongo uses lowercase collection names). */
const backupDisplayStats = (backup) => {
    const ui = backup?.uiCounts || {};
    const raw = backup?.counts || {};
    const pick = (...keys) => {
        for (const key of keys) {
            if (ui[key] != null) return ui[key];
            if (raw[key] != null) return raw[key];
            const lower = key.toLowerCase();
            const hit = Object.entries(raw).find(([k]) => k.toLowerCase() === lower);
            if (hit) return hit[1];
        }
        return 0;
    };
    const totalDocs =
        backup?.totalDocs ??
        Object.values(raw).reduce((sum, n) => sum + (Number(n) || 0), 0);
    return {
        customers: pick('Customer', 'customers'),
        invoices: pick('SalesInvoice', 'salesinvoices'),
        totalDocs,
        collections: backup?.collectionCount ?? Object.keys(raw).length,
        dbName: backup?.dbName,
    };
};

const BackupRestorePage = () => {
    const [backups, setBackups] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [activeJobId, setActiveJobId] = useState(null);
    const [backupStatusMessage, setBackupStatusMessage] = useState('');
    const [isRestoring, setIsRestoring] = useState(false);
    const [systemInfo, setSystemInfo] = useState(null);
    const [backupReason, setBackupReason] = useState('Manual Backup before deployment');
    const [restoreTargetId, setRestoreTargetId] = useState(null);
    const [restoreConfirmation, setRestoreConfirmation] = useState('');
    const [deleteTargetId, setDeleteTargetId] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const backupStatusOf = (backup) => backup?.status || 'Completed';
    const isBackupReady = (backup) => backupStatusOf(backup) === 'Completed';
    const canDeleteBackup = (backup) => {
        const status = backupStatusOf(backup);
        return status === 'Completed' || status === 'Failed';
    };

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

    useEffect(() => {
        const active = backups.find((b) => b.status === 'Queued' || b.status === 'Running');
        if (active) {
            setIsBackingUp(true);
            setActiveJobId(active.id);
            setBackupStatusMessage('Backup is running in background. You can continue using CRM.');
        }
        if (!active && isBackingUp && activeJobId) {
            const done = backups.find((b) => b.id === activeJobId);
            if (done?.status === 'Completed') {
                toast.success('Backup completed.');
                setBackupStatusMessage('');
                setIsBackingUp(false);
                setActiveJobId(null);
            } else if (done?.status === 'Failed') {
                toast.error(`Backup failed: ${done.error || 'Unknown error'}`);
                setBackupStatusMessage('');
                setIsBackingUp(false);
                setActiveJobId(null);
            }
        }
    }, [backups, isBackingUp, activeJobId]);

    useEffect(() => {
        if (!isBackingUp) return undefined;
        const timer = setInterval(() => {
            backupApi.getBackups()
                .then((backupData) => {
                    if (backupData?.data) setBackups(backupData.data);
                })
                .catch(() => {});
        }, 2000);
        return () => clearInterval(timer);
    }, [isBackingUp]);

    const handleTakeBackup = async () => {
        if (isBackingUp || backups.some((b) => b.status === 'Queued' || b.status === 'Running')) {
            toast.error('A full backup is already in progress.');
            setIsBackingUp(true);
            return;
        }
        try {
            setIsBackingUp(true);
            setBackupStatusMessage('Backup is running in background. You can continue using CRM.');
            const response = await backupApi.triggerBackup(backupReason);
            const job = response?.data;
            if (job?.id) setActiveJobId(job.id);
            toast.success(response?.message || 'Backup is running in background. You can continue using CRM.');
            fetchBackups();
        } catch (error) {
            const status = error.response?.status;
            const msg = error.response?.data?.message || error.message;
            if (status === 409) {
                toast.error('A full backup is already in progress.');
                fetchBackups();
                return;
            }
            setIsBackingUp(false);
            setBackupStatusMessage('');
            toast.error('Backup failed: ' + msg);
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

    const handleRestoreExecute = async () => {
        if (restoreConfirmation !== 'RESTORE') {
            toast.error('Please type RESTORE to confirm');
            return;
        }

        try {
            setIsRestoring(true);
            toast.loading('System restoration in progress. Please do not close the browser...', { id: 'restore' });
            const result = await backupApi.restoreBackup(restoreTargetId);
            if (!result || result.success === false) {
                throw new Error(result?.message || 'Restore did not confirm success');
            }
            const target = result.targetDatabase || result.data?.targetDatabase || 'jskurja-dev';
            toast.success(
                result.message || `System restored successfully into ${target}`,
                { id: 'restore' }
            );
            setRestoreTargetId(null);
            setRestoreConfirmation('');
            fetchBackups();
        } catch (error) {
            const data = error.response?.data;
            let msg =
                (data && typeof data === 'object' && (data.message || data.error)) ||
                (typeof data === 'string' && data.trim() && !data.trim().startsWith('<')
                    ? data.trim().slice(0, 300)
                    : null) ||
                error.message ||
                'Restore failed';
            if (/Unexpected token|JSON\.parse|is not valid JSON/i.test(String(msg))) {
                msg = 'Restore request failed due to an invalid JSON body/response. Please retry.';
            }
            if (error.code === 'ECONNABORTED') {
                msg = 'Restore timed out. Check backend logs before retrying.';
            }
            toast.error('Restoration failed: ' + msg, { id: 'restore' });
        } finally {
            setIsRestoring(false);
        }
    };

    const handleRestoreInitiate = (id) => {
        setRestoreTargetId(id);
        setRestoreConfirmation('');
    };

    const handleDeleteInitiate = (event, backup) => {
        event.preventDefault();
        event.stopPropagation();
        if (isDeleting || !canDeleteBackup(backup)) return;
        setDeleteTargetId(backup.id);
    };

    const handleDeleteExecute = async () => {
        if (!deleteTargetId || isDeleting) return;
        try {
            setIsDeleting(true);
            const result = await backupApi.deleteBackup(deleteTargetId);
            const msg = result?.data?.archiveMissing
                ? 'Backup archive was already missing. History entry removed.'
                : (result?.message || 'Backup archive deleted. CRM data was not changed.');
            toast.success(msg);
            setDeleteTargetId(null);
            await fetchBackups();
        } catch (error) {
            const msg = error.response?.data?.message || error.message || 'Delete failed';
            toast.error('Delete failed: ' + msg);
        } finally {
            setIsDeleting(false);
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
                        <div className={styles.iconWrapper} style={{ backgroundColor: '#ecfdf5' }}>
                            <ShieldCheck size={22} color="#10b981" />
                        </div>
                        <h3>Live Data Snapshot</h3>
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
                            <span>Invoices</span>
                            <strong>{dbCounts.SalesInvoice || 0}</strong>
                        </div>
                        <div className={styles.snapshotItem}>
                            <span>Orders</span>
                            <strong>{dbCounts.SalesOrder || 0}</strong>
                        </div>
                        <div className={styles.snapshotItem}>
                            <span>Tasks</span>
                            <strong>{dbCounts.Task || 0}</strong>
                        </div>
                        <div className={styles.snapshotItem}>
                            <span>Sourcing</span>
                            <strong>{dbCounts.WeChatGroup || 0}</strong>
                        </div>
                    </div>
                    <div className={styles.dbStatus}>
                        <CheckCircle2 size={16} color="#10b981" />
                        <span>Connected to: <strong>{systemInfo?.system?.databaseName}</strong></span>
                    </div>
                </div>

                {/* TAKE BACKUP ACTION */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <div className={styles.iconWrapper} style={{ backgroundColor: '#eff6ff' }}>
                            <UploadCloud size={22} color="#3b82f6" />
                        </div>
                        <h3>Manual Backup</h3>
                    </div>
                    <p className={styles.description}>
                        Create a complete ZIP archive containing the database collections and all uploaded attachments.
                    </p>
                    {backupStatusMessage ? (
                        <p className={styles.statusMessage}>{backupStatusMessage}</p>
                    ) : null}
                    <div className={styles.formGroup}>
                        <label>Reason for backup</label>
                        <input 
                            type="text" 
                            value={backupReason} 
                            onChange={(e) => setBackupReason(e.target.value)}
                            placeholder="e.g. Pre-deployment check"
                        />
                    </div>
                    <Button 
                        variant="primary" 
                        onClick={handleTakeBackup} 
                        isLoading={isBackingUp}
                        disabled={isBackingUp}
                        fullWidth
                        startIcon={<Database size={18} />}
                        style={{ marginTop: 'auto', background: '#0f172a' }}
                    >
                        {isBackingUp ? 'Backup running…' : 'Take Full Backup Now'}
                    </Button>
                </div>

                {/* UPLOAD BACKUP ACTION */}
                <div className={`${styles.card} ${styles.uploadCard}`}>
                    <div className={styles.cardHeader}>
                        <div className={styles.iconWrapper} style={{ backgroundColor: '#f5f3ff' }}>
                            <FileArchive size={22} color="#8b5cf6" />
                        </div>
                        <h3>Upload Backup</h3>
                    </div>
                    <p className={styles.description}>
                        Restore data from an external ZIP file. The file will be indexed and available for restoration below.
                    </p>
                    <div className={styles.uploadZone}>
                        <input 
                            type="file" 
                            id="backupUpload" 
                            accept=".zip" 
                            style={{ display: 'none' }} 
                            onChange={async (e) => {
                                const file = e.target.files[0];
                                if (!file) return;
                                
                                try {
                                    setIsLoading(true);
                                    toast.loading('Uploading archive...', { id: 'upload' });
                                    await backupApi.uploadBackup(file);
                                    toast.success('Archive uploaded successfully!', { id: 'upload' });
                                    fetchBackups();
                                } catch (error) {
                                    toast.error('Upload failed: ' + (error.response?.data?.message || error.message), { id: 'upload' });
                                } finally {
                                    setIsLoading(false);
                                    e.target.value = ''; // Reset input
                                }
                            }}
                        />
                        <Button 
                            variant="outline" 
                            onClick={() => document.getElementById('backupUpload').click()}
                            isLoading={isLoading}
                            fullWidth
                            startIcon={<UploadCloud size={18} />}
                            style={{ marginTop: 'auto' }}
                        >
                            Select ZIP Archive
                        </Button>
                    </div>
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
                                <th>Status</th>
                                <th>Reason / Note</th>
                                <th>Size</th>
                                <th>Items Count</th>
                                <th style={{ width: '220px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {backups.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className={styles.empty}>No backup history found.</td>
                                </tr>
                            ) : backups.map((b) => {
                                const stats = backupDisplayStats(b);
                                const status = backupStatusOf(b);
                                const ready = isBackupReady(b);
                                const looksEmpty = ready && stats.totalDocs < 50 && (b.size || 0) < 100_000;
                                return (
                                <tr key={b.id}>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{moment(b.date).format('DD MMM YYYY')}</div>
                                        <div style={{ fontSize: '11px', color: '#64748b' }}>{moment(b.date).format('hh:mm A')}</div>
                                    </td>
                                    <td>
                                        <span className={`${styles.statusBadge} ${styles[`status${status}`] || ''}`}>
                                            {status}
                                        </span>
                                        {status === 'Failed' && b.error ? (
                                            <div className={styles.statusError}>{b.error}</div>
                                        ) : null}
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '13px' }}>{b.reason}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{b.id}</div>
                                        {stats.dbName && (
                                            <div style={{ fontSize: '10px', color: '#64748b' }}>DB: {stats.dbName}</div>
                                        )}
                                    </td>
                                    <td style={{ color: '#1e293b', fontWeight: 500 }}>{formatSize(b.size)}</td>
                                    <td>
                                        <span className={styles.countInfo}>
                                            {stats.invoices} invoices · {stats.customers} customers
                                        </span>
                                        <div style={{ fontSize: '11px', color: looksEmpty ? '#dc2626' : '#64748b', marginTop: 2 }}>
                                            {stats.totalDocs.toLocaleString()} docs · {stats.collections} collections
                                            {looksEmpty ? ' — may be empty; download & check ZIP' : ''}
                                        </div>
                                    </td>
                                    <td>
                                        <div className={styles.btnGroup}>
                                            {ready ? (
                                                <>
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
                                                        onClick={() => handleRestoreInitiate(b.id)}
                                                        disabled={isRestoring}
                                                    >
                                                        <ArrowLeftRight size={18} />
                                                    </button>
                                                </>
                                            ) : null}
                                            <button 
                                                type="button"
                                                className={`${styles.iconBtn} ${styles.deleteBtn}`} 
                                                data-jsk-action="delete-backup"
                                                data-backup-id={b.id}
                                                title={canDeleteBackup(b) ? 'Delete this backup archive' : `Cannot delete while ${status}`}
                                                onClick={(event) => handleDeleteInitiate(event, b)}
                                                disabled={!canDeleteBackup(b) || isDeleting}
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );})}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* RESTORE CONFIRMATION MODAL */}
            {restoreTargetId && (
                <Modal 
                    title="Confirm System Restoration"
                    onClose={() => !isRestoring && setRestoreTargetId(null)}
                    size="md"
                    footer={
                        <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                            <Button 
                                variant="outline" 
                                onClick={() => setRestoreTargetId(null)}
                                disabled={isRestoring}
                                style={{ flex: 1 }}
                            >
                                Cancel
                            </Button>
                            <Button 
                                variant="primary" 
                                onClick={handleRestoreExecute}
                                isLoading={isRestoring}
                                style={{ flex: 1, backgroundColor: '#ef4444' }}
                                startIcon={<RefreshCw size={18} />}
                            >
                                Start Restoration
                            </Button>
                        </div>
                    }
                >
                    <div style={{ textAlign: 'center', padding: '10px 0' }}>
                        <div style={{ 
                            width: '64px', 
                            height: '64px', 
                            borderRadius: '50%', 
                            backgroundColor: '#fee2e2', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            margin: '0 auto 20px'
                        }}>
                            <AlertTriangle size={32} color="#ef4444" />
                        </div>
                        <h3 style={{ color: '#991b1b', marginBottom: '12px', fontWeight: 700 }}>Critical Action Warning</h3>
                        <p style={{ color: '#4b5563', fontSize: '14px', lineHeight: 1.6, marginBottom: '24px' }}>
                            You are about to restore the system to backup: <br />
                            <strong style={{ fontFamily: 'monospace', color: '#111827' }}>{restoreTargetId}</strong>
                            <br /><br />
                            This will <strong>OVERWRITE</strong> all current live data. 
                            A safety backup of the current state will be taken automatically before we proceed.
                        </p>
                        
                        <div style={{ 
                            backgroundColor: '#f9fafb', 
                            padding: '16px', 
                            borderRadius: '12px', 
                            border: '1px solid #e5e7eb',
                            textAlign: 'left'
                        }}>
                            <label style={{ 
                                display: 'block', 
                                fontSize: '12px', 
                                fontWeight: 600, 
                                color: '#374151', 
                                marginBottom: '8px' 
                            }}>
                                Type <span style={{ color: '#ef4444' }}>RESTORE</span> to confirm:
                            </label>
                            <div style={{ position: 'relative' }}>
                                <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }} />
                                <input 
                                    type="text"
                                    value={restoreConfirmation}
                                    onChange={(e) => setRestoreConfirmation(e.target.value)}
                                    placeholder="Type RESTORE here..."
                                    style={{ 
                                        width: '100%', 
                                        padding: '10px 12px 10px 36px', 
                                        border: '1px solid #d1d5db', 
                                        borderRadius: '8px',
                                        fontSize: '14px'
                                    }}
                                    autoFocus
                                />
                            </div>
                        </div>
                    </div>
                </Modal>
            )}

            {deleteTargetId && createPortal(
                <div
                    data-jsk-ui="backup-delete-modal"
                    style={{ position: 'fixed', inset: 0, zIndex: 11000 }}
                >
                    <Modal 
                        title="Delete Backup Archive"
                        onClose={() => !isDeleting && setDeleteTargetId(null)}
                        size="md"
                        zIndex={11001}
                        footer={
                            <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
                                <Button 
                                    variant="outline" 
                                    onClick={() => !isDeleting && setDeleteTargetId(null)}
                                    disabled={isDeleting}
                                    style={{ flex: 1 }}
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    variant="primary" 
                                    onClick={handleDeleteExecute}
                                    isLoading={isDeleting}
                                    disabled={isDeleting}
                                    data-jsk-action="confirm-delete-backup"
                                    style={{ flex: 1, backgroundColor: '#ef4444' }}
                                    startIcon={<Trash2 size={18} />}
                                >
                                    {isDeleting ? 'Deleting...' : 'Delete Backup'}
                                </Button>
                            </div>
                        }
                    >
                        <div style={{ textAlign: 'center', padding: '10px 0' }}>
                            <p style={{ color: '#4b5563', fontSize: '14px', lineHeight: 1.6, marginBottom: '8px' }}>
                                Delete this backup archive permanently? This does not delete CRM data.
                            </p>
                            <p style={{ fontFamily: 'monospace', color: '#111827', fontSize: '13px', fontWeight: 600 }}>
                                {deleteTargetId}
                            </p>
                        </div>
                    </Modal>
                </div>,
                document.body
            )}
        </div>
    );
};

export default BackupRestorePage;
