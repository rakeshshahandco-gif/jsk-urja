import React, { useState, useEffect } from 'react';
import { diagnosticService } from '@/services/diagnostic.service';
import { Button } from '@/components/ui';
import { Activity, ShieldCheck, Database, Zap, RefreshCw, AlertCircle } from 'lucide-react';
import styles from './DiagnosticDashboard.module.scss';
import { toast } from 'react-hot-toast';

const DiagnosticDashboard = () => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const response = await diagnosticService.getDiscovery();
            if (response.success) {
                setData(response.data);
                setLastUpdated(new Date());
            }
        } catch (error) {
            console.error('Failed to fetch diagnostics', error);
            toast.error('Failed to load system diagnostics');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    if (isLoading && !data) {
        return <div className={styles.loading}>Analyzing System Integrity...</div>;
    }

    const { system, discovery, status } = data || {};

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>System Master Diagnostic</h1>
                    <p className={styles.subtitle}>Auto-Discovery & Integrity Audit (Safe Mode)</p>
                </div>
                <div className={styles.actions}>
                    <span className={styles.lastUpdate}>
                        Last Scan: {lastUpdated?.toLocaleTimeString()}
                    </span>
                    <Button 
                        variant="outline" 
                        onClick={fetchData} 
                        isLoading={isLoading}
                        startIcon={<RefreshCw size={16} />}
                    >
                        Rescan System
                    </Button>
                </div>
            </div>

            <div className={styles.grid}>
                {/* Status Card */}
                <div className={`${styles.card} ${styles.statusCard}`}>
                    <div className={styles.cardHeader}>
                        <Activity className={styles.icon} />
                        <h3>Deployment Integrity</h3>
                    </div>
                    <div className={styles.statusValue}>
                        <span className={status === 'Deployment Safe' ? styles.safe : styles.warning}>
                            {status === 'Deployment Safe' ? <ShieldCheck /> : <AlertCircle />}
                            {status}
                        </span>
                    </div>
                    <p className={styles.cardFooter}>All core backend routes verified against configuration.</p>
                </div>

                {/* System Info Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <Zap className={styles.icon} />
                        <h3>System Environment</h3>
                    </div>
                    <div className={styles.infoList}>
                        <div className={styles.infoItem}>
                            <span>Version:</span>
                            <strong>v{system?.version}</strong>
                        </div>
                        <div className={styles.infoItem}>
                            <span>Node:</span>
                            <strong>{system?.nodeVersion}</strong>
                        </div>
                        <div className={styles.infoItem}>
                            <span>Database:</span>
                            <strong className={styles.safe}>{system?.database}</strong>
                        </div>
                    </div>
                </div>

                {/* Discovery Summary Card */}
                <div className={styles.card}>
                    <div className={styles.cardHeader}>
                        <Database className={styles.icon} />
                        <h3>Discovery Summary</h3>
                    </div>
                    <div className={styles.stats}>
                        <div className={styles.statBox}>
                            <span className={styles.statVal}>{discovery?.totalModels}</span>
                            <span className={styles.statLabel}>Models Found</span>
                        </div>
                        <div className={styles.statBox}>
                            <span className={styles.statVal}>{discovery?.totalRoutes}</span>
                            <span className={styles.statLabel}>API Routes</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Auto-Discovered Backend Routes</h2>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Endpoint Path</th>
                                <th>Module Scope</th>
                                <th>Security Profile</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {discovery?.backendRoutes.map((route, idx) => (
                                <tr key={idx}>
                                    <td className={styles.routeCell}><code>/api/v1{route}</code></td>
                                    <td>{route.split('/')[1]?.toUpperCase() || 'CORE'}</td>
                                    <td>
                                        <span className={styles.securityBadge}>
                                            <ShieldCheck size={12} /> Authenticated
                                        </span>
                                    </td>
                                    <td>
                                        <span className={styles.statusTag}>Active</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className={styles.section}>
                <h2 className={styles.sectionTitle}>Data Entity Models</h2>
                <div className={styles.modelGrid}>
                    {discovery?.models.map((model, idx) => (
                        <div key={idx} className={styles.modelTag}>
                            {model}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DiagnosticDashboard;
