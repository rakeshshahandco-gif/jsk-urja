import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Input, BrandedLoader } from '@/components/ui';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { getSuppliers } from '@/services/purchaseApi';
import { tdsComplianceApi } from '@/services/tdsComplianceApi';
import { toast } from 'react-hot-toast';
import { TdsPayableLedgerModal } from '@/features/accounts/components/TdsPayableLedgerModal';
import { TdsChallanPanel } from '@/features/accounts/components/TdsChallanPanel';
import {
    TdsPageShell,
    TdsStatGrid,
    TdsStatCard,
    TdsPanel,
    TdsTableWrap,
    TdsSubTabs,
    TdsAlerts,
    TdsEmpty,
    TdsField,
    TdsSelect,
    formatInr,
} from '@/features/accounts/components/tds/TdsUi';
import styles from './TdsCompliancePage.module.scss';
import { PATHS } from '@/routes/paths';

const SECTIONS = ['194C', '194J', '194H', '194I', '194Q', '194A', '194D', '195', 'OTHER'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** FY "2026-2027" → AY "2027-2028" (aligned with backend `assessmentYearFromFinancialYear`). */
function assessmentYearFromIsoFY(fyStr) {
    const s = String(fyStr || '').trim();
    const m = s.match(/^(\d{4})-(\d{4})$/);
    if (!m) return '';
    const y1 = parseInt(m[1], 10);
    const y2 = parseInt(m[2], 10);
    if (y2 !== y1 + 1) return '';
    return `${y1 + 1}-${y2 + 1}`;
}

function supplierCell(row) {
    const sid = row.supplierId;
    const name = row.supplierName || (sid && typeof sid === 'object' ? sid.supplierName : '') || '—';
    const pan = (sid && typeof sid === 'object' && sid.panNumber) || row.panNumber || '';
    return (
        <span>
            {name}
            {pan ? <span style={{ color: '#64748b' }}> · {pan}</span> : null}
        </span>
    );
}

function TdsReportsTable({ reportType, rows, exceptionSummary }) {
    if (reportType === 'exceptions' && exceptionSummary) {
        return (
            <div style={{ marginBottom: 12, fontSize: 13, color: '#475569' }}>
                Total: {exceptionSummary.total} · Critical: {exceptionSummary.critical} · High: {exceptionSummary.high} · Medium: {exceptionSummary.medium}
            </div>
        );
    }
    if (!Array.isArray(rows) || rows.length === 0) {
        return <TdsEmpty>No rows for this report.</TdsEmpty>;
    }

    if (reportType === 'exceptions') {
        return (
            <TdsTableWrap>
                <thead>
                    <tr>
                        <th>Severity</th>
                        <th>Code</th>
                        <th>Message</th>
                        <th>Entity</th>
                        <th>Name</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: 8 }}>{r.severity}</td>
                            <td style={{ padding: 8 }}>{r.code}</td>
                            <td style={{ padding: 8 }}>{r.message}</td>
                            <td style={{ padding: 8 }}>{r.entity}</td>
                            <td style={{ padding: 8 }}>{r.supplierName || r.name || r.reference || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </TdsTableWrap>
        );
    }

    if (reportType === 'threshold' || reportType === 'near') {
        return (
            <TdsTableWrap>
                    <thead>
                        <tr>
                            <th>Section</th>
                            <th>Supplier</th>
                            <th>FY</th>
                            <th>Cumulative paid</th>
                            <th>TDS deducted</th>
                            <th>Txns</th>
                            <th>Threshold ₹</th>
                            <th>% of threshold</th>
                            <th>Near limit</th>
                            <th>Crossed</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, idx) => (
                            <tr key={r._id || `${r.section}-${idx}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '8px', fontWeight: 600 }}>{r.section || '—'}</td>
                                <td style={{ padding: '8px' }}>{supplierCell(r)}</td>
                                <td style={{ padding: '8px' }}>{r.financialYear || '—'}</td>
                                <td style={{ padding: '8px' }}>{formatInr(r.cumulativePaid)}</td>
                                <td style={{ padding: '8px' }}>{formatInr(r.cumulativeTdsDeducted)}</td>
                                <td style={{ padding: '8px' }}>{r.transactionCount ?? '—'}</td>
                                <td style={{ padding: '8px' }}>{formatInr(r.aggregateThreshold)}</td>
                                <td style={{ padding: '8px' }}>{r.percentOfThreshold != null ? `${formatInr(r.percentOfThreshold)}%` : '—'}</td>
                                <td style={{ padding: '8px' }}>{r.nearLimit ? 'Yes' : 'No'}</td>
                                <td style={{ padding: '8px' }}>{r.crossed ? 'Yes' : 'No'}</td>
                            </tr>
                        ))}
                    </tbody>
            </TdsTableWrap>
        );
    }

    const first = rows[0];
    const keys =
        first && typeof first === 'object'
            ? Object.keys(first).filter((k) => !['__v'].includes(k) && !k.startsWith('$'))
            : [];

    if (!keys.length) {
        return <p style={{ color: '#64748b' }}>No columns to display.</p>;
    }

    const fmt = (v) => {
        if (v == null) return '—';
        if (typeof v === 'object') {
            if (v.supplierName != null) return String(v.supplierName) + (v.panNumber ? ` (${v.panNumber})` : '');
            if (v instanceof Date || (typeof v.toISOString === 'function' && v.constructor?.name === 'Date'))
                return new Date(v).toLocaleString('en-IN');
            try {
                return JSON.stringify(v);
            } catch {
                return '—';
            }
        }
        if (typeof v === 'boolean') return v ? 'Yes' : 'No';
        if (typeof v === 'number') return formatInr(v);
        return String(v);
    };

    return (
        <TdsTableWrap>
                <thead>
                    <tr>
                        {keys.map((k) => (
                            <th key={k}>{k}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={r._id || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            {keys.map((k) => (
                                <td key={k} style={{ padding: '8px 6px', verticalAlign: 'top', maxWidth: 280 }}>
                                    {fmt(r[k])}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
        </TdsTableWrap>
    );
}

/** Path segment after /tds → in-page tab */
const SEGMENT_TO_TAB = {
    dashboard: 'dashboard',
    deductions: 'deductions',
    challans: 'challans',
    returns: 'returns',
    form16a: 'form16a',
    master: 'master',
    settings: 'settings',
    reports: 'reports',
    'ledger-mapping': 'master',
    'payable-register': 'reports',
};

const TAB_TO_SEGMENT = {
    dashboard: 'dashboard',
    deductions: 'deductions',
    challans: 'challans',
    returns: 'returns',
    form16a: 'form16a',
    master: 'master',
    settings: 'settings',
    reports: 'reports',
};

const tabBtn = (active) => ({
    padding: '7px 14px',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    background: active ? '#1d4ed8' : '#fff',
    color: active ? '#fff' : '#475569',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
});

const card = {
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    padding: 16,
    minWidth: 160,
    background: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
};

const TdsCompliancePage = () => {
    const { selectedFY } = useFinancialYear();
    const fy = selectedFY || '2025-2026';
    const location = useLocation();
    const navigate = useNavigate();
    const [tab, setTab] = useState('dashboard');
    const [loading, setLoading] = useState(false);
    const [dashboard, setDashboard] = useState(null);
    const [deductions, setDeductions] = useState([]);
    const [deductionRegister, setDeductionRegister] = useState([]);
    const [returns, setReturns] = useState([]);
    const [certs, setCerts] = useState([]);
    const [suppliers, setSuppliers] = useState([]);

    const [dedForm, setDedForm] = useState({
        supplierId: '',
        deducteePan: '',
        section: '194J',
        amountPaid: '',
        tdsAmount: '',
        paymentDate: new Date().toISOString().slice(0, 10),
        quarter: '',
        isNonResident: false,
    });

    const [retState, setRetState] = useState({
        returnType: '26Q',
        quarter: 'Q1',
    });

    const [f16, setF16] = useState({ supplierId: '', quarter: 'Q1' });

    const [fromPay, setFromPay] = useState({
        paymentEntryId: '',
        section: '194J',
        tdsAmount: '',
        amountPaid: '',
        deducteePan: '',
        quarter: '',
    });

    const [masterRows, setMasterRows] = useState([]);
    const [masterLoading, setMasterLoading] = useState(false);
    const [masterSaving, setMasterSaving] = useState(null);
    const [tdsSettings, setTdsSettings] = useState({ tdsCalculationBasis: 'CurrentBill', tdsPostingMode: 'AutoJV' });
    const [payableModalOpen, setPayableModalOpen] = useState(false);
    const [payableModalCtx, setPayableModalCtx] = useState({ code: '', name: '' });
    const [reportType, setReportType] = useState('threshold');
    const [exceptionSummary, setExceptionSummary] = useState(null);
    const [reportRows, setReportRows] = useState([]);

    useEffect(() => {
        const parts = location.pathname.split('/').filter(Boolean);
        if (parts[0] !== 'tds') return;
        const seg = parts[1] || 'dashboard';
        const next = SEGMENT_TO_TAB[seg] || 'dashboard';
        setTab(next);
        if (seg === 'payable-register') {
            setReportType('notpaid');
        }
    }, [location.pathname]);

    const goTab = (t) => {
        navigate(`/tds/${TAB_TO_SEGMENT[t] || 'dashboard'}`);
    };

    const loadDashboard = useCallback(async () => {
        setLoading(true);
        try {
            const d = await tdsComplianceApi.getDashboard(fy);
            setDashboard(d);
        } catch (e) {
            toast.error(e.response?.data?.message || e.message || 'Failed to load TDS dashboard');
        } finally {
            setLoading(false);
        }
    }, [fy]);

    const loadDeductions = useCallback(async () => {
        try {
            const [reg, raw] = await Promise.all([
                tdsComplianceApi.listDeductionRegister(fy),
                tdsComplianceApi.listDeductions({ financialYear: fy }),
            ]);
            setDeductionRegister(Array.isArray(reg) ? reg : []);
            setDeductions(Array.isArray(raw) ? raw : []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load deductions');
        }
    }, [fy]);

    const loadReturns = useCallback(async () => {
        try {
            const rows = await tdsComplianceApi.listReturns();
            setReturns(rows || []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load returns');
        }
    }, []);

    const loadCerts = useCallback(async () => {
        try {
            const rows = await tdsComplianceApi.listForm16a();
            setCerts(rows || []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load certificates');
        }
    }, []);

    const loadMasterSections = useCallback(async () => {
        setMasterLoading(true);
        try {
            const rows = await tdsComplianceApi.listMasterSections();
            setMasterRows(Array.isArray(rows) ? rows : []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load TDS master sections');
            setMasterRows([]);
        } finally {
            setMasterLoading(false);
        }
    }, []);

    useEffect(() => {
        getSuppliers({ limit: 2000 })
            .then((r) => setSuppliers(Array.isArray(r) ? r : r?.data || []))
            .catch(() => setSuppliers([]));
    }, []);

    useEffect(() => {
        if (tab === 'dashboard') loadDashboard();
        if (tab === 'deductions') loadDeductions();
        if (tab === 'challans') {
            loadMasterSections();
        }
        if (tab === 'returns') loadReturns();
        if (tab === 'form16a') {
            loadCerts();
            loadDeductions();
        }
        if (tab === 'master') loadMasterSections();
        if (tab === 'settings') {
            tdsComplianceApi.getSettings().then(setTdsSettings).catch(() => {});
        }
        if (tab === 'reports') {
            const loaders = {
                threshold: () => tdsComplianceApi.getThresholdTrackingReport(fy),
                near: () => tdsComplianceApi.getNearLimitReport(fy),
                pending: () => tdsComplianceApi.getPendingDeductionsReport(fy),
                notpaid: () => tdsComplianceApi.getDeductedNotPaidReport(fy),
                exceptions: () => tdsComplianceApi.getExceptionReport(fy),
                payable: () => tdsComplianceApi.getPayableReport(fy),
                section: () => tdsComplianceApi.getSectionSummaryReport(fy),
                deductee: () => tdsComplianceApi.getDeducteeSummaryReport(fy),
                pan: () => tdsComplianceApi.getPanMissingReport(fy),
                monthly: () => tdsComplianceApi.getMonthlyLiabilityReport(fy),
                quarter: () => tdsComplianceApi.getQuarterSummaryReport(fy),
                ldc: () => tdsComplianceApi.getLowerDeductionReport(),
                challanrecon: () => tdsComplianceApi.getChallanReconciliationReport(fy),
            };
            const run = loaders[reportType] || loaders.threshold;
            run()
                .then((data) => {
                    if (reportType === 'exceptions' && data && !Array.isArray(data)) {
                        setExceptionSummary(data.summary || null);
                        setReportRows(Array.isArray(data.exceptions) ? data.exceptions : []);
                    } else {
                        setExceptionSummary(null);
                        setReportRows(Array.isArray(data) ? data : []);
                    }
                })
                .catch(() => {
                    setExceptionSummary(null);
                    setReportRows([]);
                });
        }
    }, [tab, fy, reportType, loadDashboard, loadDeductions, loadReturns, loadCerts, loadMasterSections]);

    const onSupplierPick = (id) => {
        const s = suppliers.find((x) => x._id === id);
        setDedForm((p) => ({
            ...p,
            supplierId: id,
            deducteePan: (s?.panNumber || '').toUpperCase(),
        }));
    };

    const submitFromPayment = async (e) => {
        e.preventDefault();
        const id = (fromPay.paymentEntryId || '').trim();
        if (!id) {
            toast.error('Enter payment entry ID');
            return;
        }
        try {
            const payload = {
                paymentEntryId: id,
                section: fromPay.section || undefined,
                tdsAmount: fromPay.tdsAmount ? Number(fromPay.tdsAmount) : undefined,
                amountPaid: fromPay.amountPaid ? Number(fromPay.amountPaid) : undefined,
                deducteePan: fromPay.deducteePan || undefined,
                quarter: fromPay.quarter || undefined,
            };
            await tdsComplianceApi.createDeductionFromPayment(payload);
            toast.success('TDS row linked from payment');
            setFromPay((p) => ({ ...p, paymentEntryId: '' }));
            loadDeductions();
            loadDashboard();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        }
    };

    const submitDeduction = async (e) => {
        e.preventDefault();
        try {
            await tdsComplianceApi.createDeduction({
                ...dedForm,
                financialYear: fy,
                amountPaid: Number(dedForm.amountPaid),
                tdsAmount: Number(dedForm.tdsAmount),
                quarter: dedForm.quarter || undefined,
            });
            toast.success('TDS deduction saved');
            loadDeductions();
            loadDashboard();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        }
    };

    const previewReturn = async () => {
        try {
            const data = await tdsComplianceApi.previewReturn({
                returnType: retState.returnType,
                financialYear: fy,
                quarter: retState.quarter,
            });
            if (data.validationErrors?.length) {
                toast.error(data.validationErrors.slice(0, 3).join(' | '));
            } else {
                toast.success(`Preview OK — ${data.rows?.length || 0} row(s)`);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        }
    };

    const exportReturn = async () => {
        try {
            const data = await tdsComplianceApi.exportReturn({
                returnType: retState.returnType,
                financialYear: fy,
                quarter: retState.quarter,
            });
            if (data.exportCsv) {
                const blob = new Blob([data.exportCsv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `TDS-${retState.returnType}-${fy}-${retState.quarter}.csv`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success('CSV downloaded');
            } else {
                toast.error((data.validationErrors || []).join(' | ') || 'Export blocked — fix validation');
            }
            loadReturns();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        }
    };

    const issue16a = async (e) => {
        e.preventDefault();
        if (!f16.supplierId) {
            toast.error('Select supplier');
            return;
        }
        try {
            await tdsComplianceApi.issueForm16a({
                supplierId: f16.supplierId,
                financialYear: fy,
                quarter: f16.quarter,
            });
            toast.success('Form 16A issued');
            loadCerts();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        }
    };

    const downloadPdf = async (certId, name) => {
        try {
            const blob = await tdsComplianceApi.downloadForm16aPdf(certId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Form16A-${name || certId}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error(err.response?.data?.message || err.message || 'PDF download failed');
        }
    };

    const payableOptions = useMemo(() => {
        return (masterRows || [])
            .filter((m) => m.tdsPayableLedgerId)
            .map((m) => {
                const lid = m.tdsPayableLedgerId._id || m.tdsPayableLedgerId;
                const name = m.tdsPayableLedgerId.name || '';
                return { id: String(lid), label: `${m.sectionCode || ''} — ${name}` };
            });
    }, [masterRows]);

    if (loading && tab === 'dashboard' && !dashboard) {
        return <BrandedLoader />;
    }

    return (
        <TdsPageShell fy={fy} tab={tab} onTab={goTab}>
            {tab === 'dashboard' && dashboard && (
                <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                        <div style={card}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>TDS deducted (FY)</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{Number(dashboard.summary?.totalTdsDeducted || 0).toFixed(2)}</div>
                        </div>
                        <div style={card}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Base payments</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{Number(dashboard.summary?.totalBasePayments || 0).toFixed(2)}</div>
                        </div>
                        <div style={card}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Rows</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{dashboard.summary?.deductionRows ?? 0}</div>
                        </div>
                        <div style={card}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Pending challan map</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{dashboard.summary?.pendingChallanMappings ?? 0}</div>
                        </div>
                        <div style={card}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>TDS payable (balance)</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>
                                {Number(dashboard.summary?.tdsPayableBalance ?? 0).toFixed(2)}
                            </div>
                        </div>
                        <div style={card}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Challan TDS deposited (FY dates)</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>
                                {Number(dashboard.summary?.tdsDepositedViaChallansInFy ?? 0).toFixed(2)}
                            </div>
                        </div>
                        <div style={card}>
                            <div style={{ fontSize: 12, color: '#64748b' }}>Challan deposits recorded</div>
                            <div style={{ fontSize: 22, fontWeight: 700 }}>{Number(dashboard.summary?.totalChallanDeposits || 0).toFixed(2)}</div>
                        </div>
                    </div>
                    <TdsPanel title="Section-wise summary">
                    <TdsTableWrap>
                        <thead>
                            <tr>
                                <th>Section</th>
                                <th>TDS</th>
                                <th>Paid base</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(dashboard.sectionWise || []).map((s) => (
                                <tr key={s.section} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td>{s.section}</td>
                                    <td>{formatInr(s.tds)}</td>
                                    <td>{formatInr(s.paid)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </TdsTableWrap>
                    </TdsPanel>
                    <TdsPanel title="Alerts" padded>
                        <TdsAlerts alerts={dashboard.alerts} />
                    </TdsPanel>
                </div>
            )}

            {tab === 'deductions' && (
                <div>
                    <p className={styles.intro}>
                        Showing <strong>{deductionRegister.length}</strong> row(s) for <strong>{fy}</strong> — vouchers with TDS (or skipped popup) plus compliance register
                        rows. Challan linking still uses register rows only (see <strong>Manual TDS adjustment</strong>).
                    </p>

                    <TdsPanel title="Deduction register">
                        <TdsTableWrap>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                    <th style={{ padding: 6 }}>Date</th>
                                    <th style={{ padding: 6 }}>Ref / voucher</th>
                                    <th style={{ padding: 6 }}>Nature</th>
                                    <th style={{ padding: 6 }}>Party</th>
                                    <th style={{ padding: 6 }}>PAN</th>
                                    <th style={{ padding: 6 }}>Section</th>
                                    <th style={{ padding: 6 }}>Section name</th>
                                    <th style={{ padding: 6 }}>Expense / exp. led.</th>
                                    <th style={{ padding: 6 }}>Gross</th>
                                    <th style={{ padding: 6 }}>Taxable</th>
                                    <th style={{ padding: 6 }}>Rate%</th>
                                    <th style={{ padding: 6 }}>TDS</th>
                                    <th style={{ padding: 6 }}>Net</th>
                                    <th style={{ padding: 6 }}>TDS payable led.</th>
                                    <th style={{ padding: 6 }}>Status</th>
                                    <th style={{ padding: 6 }}>Challan</th>
                                    <th style={{ padding: 6 }}>Q</th>
                                    <th style={{ padding: 6 }}>FY</th>
                                    <th style={{ padding: 6 }}>Source</th>
                                </tr>
                            </thead>
                            <tbody>
                                {deductionRegister.length === 0 ? (
                                    <tr>
                                        <td colSpan={19} style={{ padding: 16, color: '#64748b' }}>
                                            No TDS rows for this financial year. Post expense or other vouchers with TDS, or add register rows under Manual adjustment.
                                        </td>
                                    </tr>
                                ) : (
                                    deductionRegister.map((r) => (
                                        <tr key={r.rowKey} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }}>
                                            <td style={{ padding: 6 }}>{r.voucherDate ? new Date(r.voucherDate).toLocaleDateString('en-IN') : '—'}</td>
                                            <td style={{ padding: 6 }}>{r.voucherNo || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.voucherNature || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.supplierName || r.partyName || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.deducteePan || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.sectionCode || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.sectionName || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.expenseLedgerName || '—'}</td>
                                            <td style={{ padding: 6 }}>{Number(r.grossAmount || 0).toFixed(2)}</td>
                                            <td style={{ padding: 6 }}>{Number(r.taxableAmount || 0).toFixed(2)}</td>
                                            <td style={{ padding: 6 }}>{r.tdsRate != null ? r.tdsRate : '—'}</td>
                                            <td style={{ padding: 6 }}>{Number(r.tdsAmount || 0).toFixed(2)}</td>
                                            <td style={{ padding: 6 }}>{Number(r.netPayable || 0).toFixed(2)}</td>
                                            <td style={{ padding: 6 }}>{r.tdsPayableLedgerName || '—'}</td>
                                            <td style={{ padding: 6 }}>
                                                {r.status}
                                                {r.skippedReason ? (
                                                    <span style={{ color: '#b45309', display: 'block', fontSize: 10 }}>{r.skippedReason}</span>
                                                ) : null}
                                            </td>
                                            <td style={{ padding: 6 }}>{r.challanStatus || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.quarter || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.financialYear || '—'}</td>
                                            <td style={{ padding: 6 }}>{r.source === 'voucher' ? 'Voucher' : 'Register'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </TdsTableWrap>
                    </TdsPanel>

                    <details className={styles.details}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600, userSelect: 'none' }}>
                            Manual TDS adjustment / link entry
                        </summary>
                        <p style={{ fontSize: 13, color: '#64748b', margin: '12px 0' }}>
                            Use only for corrections: link a purchase <strong>payment entry</strong> into the compliance register, or add a manual deduction row.
                        </p>

                        <h4 style={{ marginTop: 16 }}>From purchase payment entry</h4>
                        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>
                            Payment document id from purchase invoice payments. Overrides optional if TDS already on the payment.
                        </p>
                        <form onSubmit={submitFromPayment} style={{ display: 'grid', gap: 10, maxWidth: 560, marginBottom: 24, padding: 16, background: '#fff', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                            <Input
                                label="Payment entry ID"
                                value={fromPay.paymentEntryId}
                                onChange={(e) => setFromPay((p) => ({ ...p, paymentEntryId: e.target.value }))}
                                placeholder="e.g. 674a..."
                                required
                            />
                            <label>
                                Section (override)
                                <select
                                    value={fromPay.section}
                                    onChange={(e) => setFromPay((p) => ({ ...p, section: e.target.value }))}
                                    style={{ width: '100%', marginTop: 4 }}
                                >
                                    {SECTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <Input
                                label="TDS amount (override)"
                                type="number"
                                value={fromPay.tdsAmount}
                                onChange={(e) => setFromPay((p) => ({ ...p, tdsAmount: e.target.value }))}
                                placeholder="Leave blank if stored on payment"
                            />
                            <Input
                                label="Base / gross amount (override)"
                                type="number"
                                value={fromPay.amountPaid}
                                onChange={(e) => setFromPay((p) => ({ ...p, amountPaid: e.target.value }))}
                                placeholder="Defaults to payment amount / tdsBaseAmount"
                            />
                            <Input
                                label="PAN override"
                                value={fromPay.deducteePan}
                                onChange={(e) => setFromPay((p) => ({ ...p, deducteePan: e.target.value.toUpperCase() }))}
                                placeholder="If not on supplier / payment"
                            />
                            <label>
                                Quarter override
                                <select
                                    value={fromPay.quarter}
                                    onChange={(e) => setFromPay((p) => ({ ...p, quarter: e.target.value }))}
                                    style={{ width: '100%', marginTop: 4 }}
                                >
                                    <option value="">Auto from payment date</option>
                                    {QUARTERS.map((q) => (
                                        <option key={q} value={q}>
                                            {q}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <Button type="submit">Create / link TDS row</Button>
                        </form>

                        <h4>New manual deduction</h4>
                        <form onSubmit={submitDeduction} style={{ display: 'grid', gap: 10, maxWidth: 480, marginBottom: 16 }}>
                        <label>
                            Supplier
                            <select
                                required
                                value={dedForm.supplierId}
                                onChange={(e) => onSupplierPick(e.target.value)}
                                style={{ width: '100%', marginTop: 4 }}
                            >
                                <option value="">— Select —</option>
                                {suppliers.map((s) => (
                                    <option key={s._id} value={s._id}>
                                        {s.supplierName}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Input
                            label="Deductee PAN"
                            value={dedForm.deducteePan}
                            onChange={(e) => setDedForm((p) => ({ ...p, deducteePan: e.target.value.toUpperCase() }))}
                            required
                        />
                        <label>
                            Section
                            <select
                                value={dedForm.section}
                                onChange={(e) => setDedForm((p) => ({ ...p, section: e.target.value }))}
                                style={{ width: '100%', marginTop: 4 }}
                            >
                                {SECTIONS.map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Input
                            label="Amount paid"
                            type="number"
                            value={dedForm.amountPaid}
                            onChange={(e) => setDedForm((p) => ({ ...p, amountPaid: e.target.value }))}
                            required
                        />
                        <Input
                            label="TDS amount"
                            type="number"
                            value={dedForm.tdsAmount}
                            onChange={(e) => setDedForm((p) => ({ ...p, tdsAmount: e.target.value }))}
                            required
                        />
                        <Input
                            label="Payment date"
                            type="date"
                            value={dedForm.paymentDate}
                            onChange={(e) => setDedForm((p) => ({ ...p, paymentDate: e.target.value }))}
                            required
                        />
                        <label>
                            Quarter (optional — auto from date if empty)
                            <select
                                value={dedForm.quarter}
                                onChange={(e) => setDedForm((p) => ({ ...p, quarter: e.target.value }))}
                                style={{ width: '100%', marginTop: 4 }}
                            >
                                <option value="">Auto</option>
                                {QUARTERS.map((q) => (
                                    <option key={q} value={q}>
                                        {q}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="checkbox"
                                checked={dedForm.isNonResident}
                                onChange={(e) => setDedForm((p) => ({ ...p, isNonResident: e.target.checked }))}
                            />
                            Non-resident (27Q)
                        </label>
                        <Button type="submit">Save deduction</Button>
                        </form>
                    </details>
                </div>
            )}

            {tab === 'challans' && (
                <TdsChallanPanel fy={fy} suppliers={suppliers} payableOptions={payableOptions} />
            )}

            {tab === 'returns' && (
                <div>
                    <TdsPanel title="Export return" padded>
                    <div className={styles.formRow}>
                        <TdsField label="Return">
                            <TdsSelect
                                value={retState.returnType}
                                onChange={(e) => setRetState((p) => ({ ...p, returnType: e.target.value }))}
                            >
                                <option value="26Q">26Q (resident non-salary)</option>
                                <option value="27Q">27Q (non-resident)</option>
                                <option value="24Q">24Q (salary — preview only)</option>
                            </TdsSelect>
                        </TdsField>
                        <label>
                            Quarter
                            <select
                                value={retState.quarter}
                                onChange={(e) => setRetState((p) => ({ ...p, quarter: e.target.value }))}
                                style={{ display: 'block', marginTop: 4 }}
                            >
                                {QUARTERS.map((q) => (
                                    <option key={q} value={q}>
                                        {q}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Button type="button" variant="secondary" onClick={previewReturn}>
                            Validate / preview
                        </Button>
                        <Button type="button" onClick={exportReturn}>
                            Export CSV
                        </Button>
                    </div>
                    <p style={{ color: '#64748b', fontSize: 13 }}>
                        Export requires every included row to have a valid PAN and challan mapping. Output is a structured CSV for downstream
                        TRACES tooling (not a government file drop-in).
                    </p>
                    </TdsPanel>
                    <TdsPanel title="Recent exports">
                        <TdsTableWrap>
                            <thead>
                                <tr>
                                    <th>When</th>
                                    <th>Type</th>
                                    <th>FY</th>
                                    <th>AY</th>
                                    <th>Q</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {returns.length === 0 ? (
                                    <tr>
                                        <td colSpan={6}>
                                            <TdsEmpty>No exports yet.</TdsEmpty>
                                        </td>
                                    </tr>
                                ) : (
                                    returns.map((r) => (
                                        <tr key={r._id}>
                                            <td>{new Date(r.createdAt).toLocaleString('en-IN')}</td>
                                            <td>{r.returnType}</td>
                                            <td>{r.financialYear}</td>
                                            <td>{r.assessmentYear || assessmentYearFromIsoFY(r.financialYear) || '—'}</td>
                                            <td>{r.quarter}</td>
                                            <td>{r.status}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </TdsTableWrap>
                    </TdsPanel>
                </div>
            )}

            {tab === 'form16a' && (
                <div>
                    <form onSubmit={issue16a} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 24 }}>
                        <label>
                            Supplier
                            <select
                                required
                                value={f16.supplierId}
                                onChange={(e) => setF16((p) => ({ ...p, supplierId: e.target.value }))}
                                style={{ display: 'block', marginTop: 4, minWidth: 220 }}
                            >
                                <option value="">— Select —</option>
                                {suppliers.map((s) => (
                                    <option key={s._id} value={s._id}>
                                        {s.supplierName}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Quarter
                            <select
                                value={f16.quarter}
                                onChange={(e) => setF16((p) => ({ ...p, quarter: e.target.value }))}
                                style={{ display: 'block', marginTop: 4 }}
                            >
                                {QUARTERS.map((q) => (
                                    <option key={q} value={q}>
                                        {q}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <Button type="submit">Issue Form 16A</Button>
                    </form>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                                <th>Vendor</th>
                                <th>FY</th>
                                <th>AY</th>
                                <th>Q</th>
                                <th>TDS</th>
                                <th>PDF</th>
                            </tr>
                        </thead>
                        <tbody>
                            {certs.map((c) => (
                                <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td>{c.supplierName}</td>
                                    <td>{c.financialYear}</td>
                                    <td>{c.assessmentYear || assessmentYearFromIsoFY(c.financialYear) || '—'}</td>
                                    <td>{c.quarter}</td>
                                    <td>{Number(c.totalTdsDeducted).toFixed(2)}</td>
                                    <td>
                                        <Button type="button" variant="secondary" onClick={() => downloadPdf(c._id, c.supplierName)}>
                                            Download
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'settings' && (
                <TdsPanel title="TDS settings" padded>
                    <p className={styles.intro}>Admin options for threshold TDS calculation and GL posting.</p>
                    <label style={{ display: 'block', marginBottom: 12 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>TDS calculation basis</span>
                        <select
                            value={tdsSettings.tdsCalculationBasis || 'CurrentBill'}
                            onChange={(e) => setTdsSettings((s) => ({ ...s, tdsCalculationBasis: e.target.value }))}
                            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                        >
                            <option value="CurrentBill">Deduct TDS only on current bill</option>
                            <option value="Cumulative">Deduct TDS on cumulative taxable amount</option>
                        </select>
                    </label>
                    <label style={{ display: 'block', marginBottom: 16 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>Posting mode</span>
                        <select
                            value={tdsSettings.tdsPostingMode || 'AutoJV'}
                            onChange={(e) => setTdsSettings((s) => ({ ...s, tdsPostingMode: e.target.value }))}
                            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                        >
                            <option value="AutoJV">Auto journal voucher</option>
                            <option value="InlineAdjustment">Inline TDS adjustment on payment</option>
                        </select>
                    </label>
                    <Button
                        type="button"
                        onClick={async () => {
                            try {
                                await tdsComplianceApi.updateSettings(tdsSettings);
                                toast.success('TDS settings saved');
                            } catch (e) {
                                toast.error(e.response?.data?.message || 'Save failed');
                            }
                        }}
                    >
                        Save settings
                    </Button>
                </TdsPanel>
            )}

            {tab === 'reports' && (
                <div>
                    <TdsSubTabs
                        items={[
                            ['threshold', 'Threshold tracking'],
                            ['near', 'Near limit'],
                            ['pending', 'Pending deduction'],
                            ['notpaid', 'Deducted not paid'],
                            ['exceptions', 'Exceptions'],
                            ['payable', 'Payable'],
                            ['section', 'Section summary'],
                            ['deductee', 'Deductee summary'],
                            ['pan', 'PAN missing'],
                            ['monthly', 'Monthly liability'],
                            ['quarter', 'Quarter summary'],
                            ['ldc', 'Lower deduction cert.'],
                            ['challanrecon', 'Challan reconciliation'],
                        ]}
                        active={reportType}
                        onChange={(k) => {
                            setReportType(k);
                            goTab('reports');
                        }}
                    />
                    <TdsPanel title="Report data" padded>
                        <TdsReportsTable reportType={reportType} rows={reportRows} exceptionSummary={exceptionSummary} />
                    </TdsPanel>
                </div>
            )}

            {tab === 'master' && (
                <div>
                    <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
                        Section-wise rates and <strong>TDS Payable</strong> liability ledgers (posted by ID). Create or map ledgers under{' '}
                        <em>Duties &amp; Taxes → TDS Payable</em>.
                    </p>
                    {masterLoading ? (
                        <BrandedLoader size={100} />
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 1180 }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
                                        <th style={{ padding: '10px 8px' }}>Section</th>
                                        <th style={{ padding: '10px 8px' }}>Section name</th>
                                        <th style={{ padding: '10px 8px' }}>Indiv/HUF %</th>
                                        <th style={{ padding: '10px 8px' }}>Others %</th>
                                        <th style={{ padding: '10px 8px' }}>Threshold ₹</th>
                                        <th style={{ padding: '10px 8px' }}>Threshold type</th>
                                        <th style={{ padding: '10px 8px' }}>After cross</th>
                                        <th style={{ padding: '10px 8px' }}>FY calc</th>
                                        <th style={{ padding: '10px 8px' }}>TDS Payable</th>
                                        <th style={{ padding: '10px 8px' }}>Active</th>
                                        <th style={{ padding: '10px 8px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {masterRows.map((row) => {
                                        const payable = row.tdsPayableLedgerId;
                                        const payableLabel =
                                            payable && typeof payable === 'object'
                                                ? payable.name
                                                : payable
                                                  ? String(payable)
                                                  : '—';
                                        return (
                                        <tr key={row.sectionCode} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' }}>
                                            <td style={{ padding: '8px', fontWeight: 700 }}>{row.sectionCode}</td>
                                            <td style={{ padding: '8px' }}>
                                                <input
                                                    value={row.sectionName || ''}
                                                    onChange={(e) =>
                                                        setMasterRows((prev) =>
                                                            prev.map((r) =>
                                                                r.sectionCode === row.sectionCode ? { ...r, sectionName: e.target.value } : r,
                                                            ),
                                                        )
                                                    }
                                                    style={{ width: '100%', minWidth: 120, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={row.rateIndividualHuf ?? row.defaultRate ?? 0}
                                                    onChange={(e) =>
                                                        setMasterRows((prev) =>
                                                            prev.map((r) =>
                                                                r.sectionCode === row.sectionCode
                                                                    ? { ...r, rateIndividualHuf: e.target.value }
                                                                    : r,
                                                            ),
                                                        )
                                                    }
                                                    style={{ width: 72, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    value={row.rateOthers ?? 0}
                                                    onChange={(e) =>
                                                        setMasterRows((prev) =>
                                                            prev.map((r) =>
                                                                r.sectionCode === row.sectionCode ? { ...r, rateOthers: e.target.value } : r,
                                                            ),
                                                        )
                                                    }
                                                    style={{ width: 72, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <input
                                                    type="number"
                                                    step="1"
                                                    value={row.thresholdAmount ?? 0}
                                                    onChange={(e) =>
                                                        setMasterRows((prev) =>
                                                            prev.map((r) =>
                                                                r.sectionCode === row.sectionCode
                                                                    ? { ...r, thresholdAmount: e.target.value }
                                                                    : r,
                                                            ),
                                                        )
                                                    }
                                                    style={{ width: 96, padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
                                                />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <select
                                                    value={row.thresholdCalculationMethod || 'AggregateFY'}
                                                    onChange={(e) =>
                                                        setMasterRows((prev) =>
                                                            prev.map((r) =>
                                                                r.sectionCode === row.sectionCode
                                                                    ? { ...r, thresholdCalculationMethod: e.target.value }
                                                                    : r,
                                                            ),
                                                        )
                                                    }
                                                    style={{ padding: 6, borderRadius: 6, border: '1px solid #e5e7eb', maxWidth: 120 }}
                                                >
                                                    <option value="SingleBill">Single bill</option>
                                                    <option value="AggregateFY">FY aggregate</option>
                                                    <option value="Both">Both</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <select
                                                    value={row.thresholdDeductMode || 'FullAfterCrossing'}
                                                    onChange={(e) =>
                                                        setMasterRows((prev) =>
                                                            prev.map((r) =>
                                                                r.sectionCode === row.sectionCode
                                                                    ? { ...r, thresholdDeductMode: e.target.value }
                                                                    : r,
                                                            ),
                                                        )
                                                    }
                                                    style={{ padding: 6, borderRadius: 6, border: '1px solid #e5e7eb', maxWidth: 130 }}
                                                    title="Excess only vs full cumulative catch-up"
                                                >
                                                    <option value="ExcessOnly">Excess only</option>
                                                    <option value="FullAfterCrossing">Full catch-up</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <select
                                                    value={row.calculationType || 'YearlyCumulative'}
                                                    onChange={(e) =>
                                                        setMasterRows((prev) =>
                                                            prev.map((r) =>
                                                                r.sectionCode === row.sectionCode
                                                                    ? { ...r, calculationType: e.target.value }
                                                                    : r,
                                                            ),
                                                        )
                                                    }
                                                    style={{ padding: 6, borderRadius: 6, border: '1px solid #e5e7eb' }}
                                                >
                                                    <option value="YearlyCumulative">Yearly cumulative</option>
                                                    <option value="PerTransaction">Per transaction</option>
                                                </select>
                                            </td>
                                            <td style={{ padding: '8px', maxWidth: 140 }}>
                                                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: 6, wordBreak: 'break-word' }}>{payableLabel}</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setPayableModalCtx({
                                                                code: row.sectionCode,
                                                                name: row.sectionName || row.description || '',
                                                            });
                                                            setPayableModalOpen(true);
                                                        }}
                                                        style={{
                                                            fontSize: 11,
                                                            padding: '4px 8px',
                                                            borderRadius: 6,
                                                            border: '1px solid #2563eb',
                                                            background: '#eff6ff',
                                                            cursor: 'pointer',
                                                            fontWeight: 700,
                                                        }}
                                                    >
                                                        Create / Map
                                                    </button>
                                                    {payable && typeof payable === 'object' && payable._id && (
                                                        <Link
                                                            to={PATHS.ACCOUNTS.LEDGER_MASTER}
                                                            style={{
                                                                fontSize: 11,
                                                                padding: '4px 8px',
                                                                borderRadius: 6,
                                                                border: '1px solid #cbd5e1',
                                                                background: '#fff',
                                                                fontWeight: 600,
                                                                color: '#0f172a',
                                                                textDecoration: 'none',
                                                                display: 'inline-block',
                                                            }}
                                                        >
                                                            Ledger master
                                                        </Link>
                                                    )}
                                                </div>
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!row.isActive}
                                                    onChange={(e) =>
                                                        setMasterRows((prev) =>
                                                            prev.map((r) =>
                                                                r.sectionCode === row.sectionCode ? { ...r, isActive: e.target.checked } : r,
                                                            ),
                                                        )
                                                    }
                                                />
                                            </td>
                                            <td style={{ padding: '8px' }}>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    disabled={masterSaving === row.sectionCode}
                                                    onClick={async () => {
                                                        setMasterSaving(row.sectionCode);
                                                        try {
                                                            await tdsComplianceApi.updateMasterSection(row.sectionCode, {
                                                                sectionName: row.sectionName || '',
                                                                description: row.description || row.sectionName || '',
                                                                defaultRate: Number(row.defaultRate ?? row.rateIndividualHuf ?? 0),
                                                                rateIndividualHuf: Number(row.rateIndividualHuf ?? 0),
                                                                rateOthers: Number(row.rateOthers ?? 0),
                                                                thresholdAmount: Number(row.thresholdAmount ?? 0),
                                                                thresholdCalculationMethod: row.thresholdCalculationMethod,
                                                                thresholdDeductMode: row.thresholdDeductMode || 'FullAfterCrossing',
                                                                calculationType: row.calculationType,
                                                                isActive: Boolean(row.isActive),
                                                            });
                                                            toast.success(`Saved ${row.sectionCode}`);
                                                            await loadMasterSections();
                                                        } catch (e) {
                                                            toast.error(e.response?.data?.message || e.message || 'Save failed');
                                                        } finally {
                                                            setMasterSaving(null);
                                                        }
                                                    }}
                                                >
                                                    {masterSaving === row.sectionCode ? 'Saving…' : 'Save row'}
                                                </Button>
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {masterRows.length === 0 && !masterLoading && (
                                <p style={{ color: '#94a3b8', fontSize: 13 }}>No sections loaded.</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            <TdsPayableLedgerModal
                open={payableModalOpen}
                sectionCode={payableModalCtx.code}
                sectionName={payableModalCtx.name}
                onClose={() => setPayableModalOpen(false)}
                onSuccess={() => loadMasterSections()}
            />
        </TdsPageShell>
    );
};

export default TdsCompliancePage;
