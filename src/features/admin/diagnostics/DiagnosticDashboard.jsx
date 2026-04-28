import React, { useState, useEffect } from 'react';
import { diagnosticService } from '@/services/diagnostic.service';
import api from '@/services/api';
import { Button } from '@/components/ui';
import { ShieldCheck, Database, Zap, RefreshCw, AlertCircle, CheckCircle2, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import styles from './DiagnosticDashboard.module.scss';
import { toast } from 'react-hot-toast';

const CRITICAL_MODULES = [
    { id: 'customer', name: 'Customer Master', url: 'customers?limit=1' },
    { id: 'item', name: 'Item Master', url: 'items?limit=1' },
    { id: 'sales_order', name: 'Sales Order', url: 'sales-orders?limit=1' },
    { id: 'sales_invoice', name: 'Sales Invoice', url: 'sales-invoices?limit=1' },
    { id: 'gstr1', name: 'GSTR-1 Compliance', url: 'gst-reports/validate?startDate=2026-04-01&endDate=2026-04-30' },
    { id: 'po', name: 'Purchase Order', url: 'purchase-orders?limit=1' },
    { id: 'inventory', name: 'Inventory Reports', url: 'stock/summary?limit=1' },
    { id: 'task', name: 'Task Management', url: 'tasks?limit=1' },
    { id: 'sourcing', name: 'China Sourcing', url: 'wechat/groups?limit=1' }
];

const DiagnosticDashboard = () => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    
    // Test Engine State
    const [testResults, setTestResults] = useState({});
    const [isTesting, setIsTesting] = useState(false);
    const [finalStatus, setFinalStatus] = useState('Pending'); // Pending, Safe, Warning, Critical

    const fetchDataAndRunTests = async () => {
        try {
            setIsLoading(true);
            setIsTesting(true);
            setFinalStatus('Pending');
            setTestResults({});
            
            // Phase 1: DB & Discovery
            const response = await diagnosticService.getDiscovery();
            if (response.success) {
                setData(response.data);
            }

            // Phase 2: Orchestrated API Tests (Read-Only)
            let hasCriticalError = response.data?.system?.database !== 'Connected';
            let hasWarning = false;
            
            const results = {};
            
            for (const module of CRITICAL_MODULES) {
                results[module.id] = { status: 'testing' };
                setTestResults({ ...results });
                
                try {
                    const res = await api.get(module.url);
                    if (res.status === 200) {
                        results[module.id] = { status: 'safe', ms: res.headers['x-response-time'] || '<50' };
                    } else {
                        results[module.id] = { status: 'warning', error: `Status ${res.status}` };
                        hasWarning = true;
                    }
                } catch (err) {
                    results[module.id] = { status: 'critical', error: err.response?.status ? `HTTP ${err.response.status}` : 'Connection Refused' };
                    hasCriticalError = true;
                }
                setTestResults({ ...results });
            }

            // Phase 3: Final Report
            if (hasCriticalError) {
                setFinalStatus('Critical Error');
            } else if (hasWarning) {
                setFinalStatus('Warning');
            } else {
                setFinalStatus('Safe to Deploy');
            }

            setLastUpdated(new Date());

        } catch (error) {
            console.error('Failed to run diagnostics', error);
            toast.error('Failed to run pre-deployment diagnostics');
            setFinalStatus('Critical Error');
        } finally {
            setIsLoading(false);
            setIsTesting(false);
        }
    };

    useEffect(() => {
        fetchDataAndRunTests();
    }, []);

    const { system } = data || {};

    const getStatusColor = () => {
        if (finalStatus === 'Safe to Deploy') return '#10b981';
        if (finalStatus === 'Warning') return '#f59e0b';
        if (finalStatus === 'Critical Error') return '#ef4444';
        return '#64748b';
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div>
                    <h1 className={styles.title}>System Master Diagnostic</h1>
                    <p className={styles.subtitle}>Pre-Deployment Safety Tool & Read-Only API Checks</p>
                </div>
                <div className={styles.actions}>
                    <span className={styles.lastUpdate}>
                        Last Scan: {lastUpdated?.toLocaleTimeString() || 'Never'}
                    </span>
                    <Button 
                        variant="primary" 
                        onClick={fetchDataAndRunTests} 
                        isLoading={isLoading}
                        startIcon={<RefreshCw size={16} />}
                        style={{ background: '#0f172a' }}
                    >
                        {isTesting ? 'Running Deep Tests...' : 'Run Diagnostics'}
                    </Button>
                </div>
            </div>

            {/* PRE-DEPLOY WARNING BANNER */}
            <div style={{ background: '#fffbeb', borderLeft: '4px solid #f59e0b', padding: '16px', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <AlertTriangle size={24} color="#d97706" />
                <div>
                    <h3 style={{ margin: 0, color: '#92400e', fontSize: '15px' }}>Important Deployment Rule</h3>
                    <p style={{ margin: '4px 0 0 0', color: '#b45309', fontSize: '13px' }}>Please take a complete database backup before deploying any code to Render with live data. This diagnostic tests health but does not replace backups.</p>
                </div>
            </div>

            <div className={styles.grid}>
                {/* Final Report Card */}
                <div className={styles.card} style={{ borderTop: `4px solid ${getStatusColor()}` }}>
                    <div className={styles.cardHeader}>
                        <ShieldCheck className={styles.icon} color={getStatusColor()} />
                        <h3>Pre-Deploy Report</h3>
                    </div>
                    <div className={styles.statusValue} style={{ color: getStatusColor(), fontWeight: 800, fontSize: '24px', marginTop: '12px' }}>
                        {isTesting ? 'Analyzing...' : finalStatus}
                    </div>
                    <p className={styles.cardFooter} style={{ marginTop: '8px' }}>
                        {finalStatus === 'Safe to Deploy' && 'All critical APIs and DB connections verified.'}
                        {finalStatus === 'Critical Error' && 'Do NOT deploy. Critical routes or DB connection failed.'}
                        {finalStatus === 'Warning' && 'Proceed with caution. Some non-critical warnings detected.'}
                        {finalStatus === 'Pending' && 'Waiting for tests to finish...'}
                    </p>
                </div>

                {/* Database Safety Check Card */}
                <div className={styles.card} style={{ gridColumn: 'span 2' }}>
                    <div className={styles.cardHeader}>
                        <Database className={styles.icon} />
                        <h3>Database Safety Check</h3>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <div>
                                <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Connection</span>
                                <strong style={{ color: system?.database === 'Connected' ? '#10b981' : '#ef4444' }}>{system?.database || 'Pending'}</strong>
                            </div>
                            <div>
                                <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Environment</span>
                                <strong>{system?.environment || 'Checking...'}</strong>
                            </div>
                            <div>
                                <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Live Database</span>
                                <strong>{system?.databaseName || 'Unknown'}</strong>
                            </div>
                            <div>
                                <span style={{ fontSize: '12px', color: '#64748b', display: 'block' }}>Safety Status</span>
                                <strong style={{ color: system?.safetyStatus === 'Safe' ? '#10b981' : '#ef4444' }}>{system?.safetyStatus || 'Verifying...'}</strong>
                            </div>
                        </div>
                    </div>
                    
                    {/* Collection Counts Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px' }}>
                        {system?.databaseCounts ? Object.entries(system.databaseCounts).map(([col, count]) => (
                            <div key={col} style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{col.replace(/([A-Z])/g, ' $1').trim()}</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '4px' }}>{count.toLocaleString()}</div>
                            </div>
                        )) : (
                            <div style={{ gridColumn: 'span 4', textAlign: 'center', color: '#94a3b8', padding: '20px' }}>Loading Collection Data...</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Read-Only API Test Matrix */}
            <div className={styles.section} style={{ marginTop: '32px' }}>
                <h2 className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={20} /> Read-Only Critical API Tests
                </h2>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Module</th>
                                <th>Test Endpoint</th>
                                <th style={{ width: '150px' }}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {CRITICAL_MODULES.map((module) => {
                                const result = testResults[module.id];
                                return (
                                    <tr key={module.id} style={{ background: result?.status === 'critical' ? '#fef2f2' : 'transparent' }}>
                                        <td style={{ fontWeight: 600, color: '#1e293b' }}>{module.name}</td>
                                        <td style={{ color: '#64748b', fontFamily: 'monospace', fontSize: '13px' }}>GET {module.url}</td>
                                        <td>
                                            {!result ? (
                                                <span style={{ color: '#94a3b8' }}>Waiting...</span>
                                            ) : result.status === 'testing' ? (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#3b82f6', fontWeight: 600 }}>
                                                    <Loader2 size={16} className="animate-spin" /> Testing...
                                                </span>
                                            ) : result.status === 'safe' ? (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 600 }}>
                                                    <CheckCircle2 size={16} /> Safe ({result.ms}ms)
                                                </span>
                                            ) : (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontWeight: 600 }}>
                                                    <XCircle size={16} /> {result.error}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

        </div>
    );
};

export default DiagnosticDashboard;
