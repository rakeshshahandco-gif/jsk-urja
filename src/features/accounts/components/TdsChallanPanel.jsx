import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { tdsComplianceApi } from '@/services/tdsComplianceApi';
import { toast } from 'react-hot-toast';
import { TdsSubTabs, TdsPanel, TdsTableWrap, TdsEmpty } from '@/features/accounts/components/tds/TdsUi';
import { TdsItns281PreviewModal } from '@/features/accounts/components/tds/TdsItns281PreviewModal';
import styles from '@/features/accounts/TdsCompliancePage.module.scss';

const SECTIONS = ['194C', '194J', '194H', '194I', '194Q', '194A', '194D', '195', 'OTHER'];
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
const IT_EPAY_URL = 'https://www.incometax.gov.in/iec/foportal/help/e-pay-tax';

function assessmentYearFromIsoFY(fyStr) {
    const s = String(fyStr || '').trim();
    const m = s.match(/^(\d{4})-(\d{4})$/);
    if (!m) return '';
    const y1 = parseInt(m[1], 10);
    const y2 = parseInt(m[2], 10);
    if (y2 !== y1 + 1) return '';
    return `${y1 + 1}-${y2 + 1}`;
}

export function TdsChallanPanel({ fy, suppliers, masterRows, payableOptions }) {
    const [challanView, setChallanView] = useState('create');
    const [challans, setChallans] = useState([]);
    const [chPull, setChPull] = useState({
        quarter: '',
        fromDate: '',
        toDate: '',
        section: '',
        payableLedgerId: '',
        supplierId: '',
        status: 'UnpaidOrPart',
    });
    const [unpaidRows, setUnpaidRows] = useState([]);
    const [chPullLoading, setChPullLoading] = useState(false);
    const [selUnpaid, setSelUnpaid] = useState({});
    const [regFilters, setRegFilters] = useState({ status: '', challanNo: '', section: '' });
    const [showPayOnline, setShowPayOnline] = useState(false);
    const [markPaidId, setMarkPaidId] = useState(null);
    const [sendModal, setSendModal] = useState(null);
    const [itns281Open, setItns281Open] = useState(false);
    const [itns281Payload, setItns281Payload] = useState(null);
    const [itns281ChallanId, setItns281ChallanId] = useState(null);
    const [sendMsg, setSendMsg] = useState(
        'Dear Sir/Madam, Please find attached TDS challan/payment details for your reference. Kindly check and confirm.',
    );

    const [chForm, setChForm] = useState({
        bsrCode: '',
        challanSerial: '',
        bankName: '',
        challanDate: new Date().toISOString().slice(0, 10),
        amountDeposited: '',
        interest: '0',
        lateFee: '0',
        penalty: '0',
        totalPaidAmount: '',
        assessmentYear: '',
        assessmentYearOverrideReason: '',
        cinNumber: '',
        remarks: '',
        paymentMode: '',
        bankLedgerId: '',
    });

    const [markPaidForm, setMarkPaidForm] = useState({
        bsrCode: '',
        challanSerial: '',
        cinNumber: '',
        bankName: '',
        challanDate: new Date().toISOString().slice(0, 10),
        amountDeposited: '',
        paymentMode: '',
        bankLedgerId: '',
        remarks: '',
    });

    useEffect(() => {
        const ay = assessmentYearFromIsoFY(fy);
        if (ay) setChForm((p) => ({ ...p, assessmentYear: ay }));
    }, [fy]);

    useEffect(() => {
        const keys = Object.keys(selUnpaid);
        if (!keys.length) return;
        const t = keys.reduce((a, k) => a + (Number(selUnpaid[k].applyAmount) || 0), 0);
        setChForm((p) => ({ ...p, amountDeposited: String(Math.round(t * 100) / 100) }));
    }, [selUnpaid]);

    const loadChallans = useCallback(async () => {
        try {
            const params = { financialYear: fy, ...regFilters };
            const rows = await tdsComplianceApi.listChallanRegister(params);
            setChallans(Array.isArray(rows) ? rows : []);
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load challan register');
        }
    }, [fy, regFilters]);

    useEffect(() => {
        if (challanView === 'register') loadChallans();
    }, [challanView, loadChallans]);

    const loadUnpaidForChallan = useCallback(async () => {
        setChPullLoading(true);
        try {
            const params = { financialYear: fy, status: chPull.status || 'UnpaidOrPart' };
            if (chPull.quarter) params.quarter = chPull.quarter;
            if (chPull.fromDate) params.fromDate = chPull.fromDate;
            if (chPull.toDate) params.toDate = chPull.toDate;
            if (chPull.section) params.section = chPull.section;
            if (chPull.payableLedgerId) params.payableLedgerId = chPull.payableLedgerId;
            if (chPull.supplierId) params.supplierId = chPull.supplierId;
            const rows = await tdsComplianceApi.listUnpaidTdsForChallan(params);
            setUnpaidRows(Array.isArray(rows) ? rows : []);
            setSelUnpaid({});
        } catch (e) {
            toast.error(e.response?.data?.message || 'Failed to load unpaid TDS');
        } finally {
            setChPullLoading(false);
        }
    }, [fy, chPull]);

    const toggleUnpaidRow = (row) => {
        setSelUnpaid((prev) => {
            const next = { ...prev };
            if (next[row.rowKey]) delete next[row.rowKey];
            else next[row.rowKey] = { applyAmount: Number(row.balancePayable) || 0 };
            return next;
        });
    };

    const setUnpaidApplyAmount = (rowKey, val) => {
        setSelUnpaid((prev) => ({ ...prev, [rowKey]: { applyAmount: Math.round((Number(val) || 0) * 100) / 100 } }));
    };

    const selectAllUnpaid = () => {
        const next = {};
        unpaidRows.forEach((r) => {
            next[r.rowKey] = { applyAmount: Number(r.balancePayable) || 0 };
        });
        setSelUnpaid(next);
    };

    const buildAllocations = () => {
        const allocations = [];
        for (const r of unpaidRows) {
            const entry = selUnpaid[r.rowKey];
            if (!entry) continue;
            const amt = Math.round((Number(entry.applyAmount) || 0) * 100) / 100;
            if (amt <= 0 || !r.sourceId) continue;
            allocations.push({ source: r.source, id: r.sourceId, amount: amt });
        }
        return allocations;
    };

    const saveChallan = async (saveMode) => {
        const allocations = buildAllocations();
        if (!allocations.length) {
            toast.error('Select at least one row with a positive pay amount');
            return;
        }
        const sumAlloc = allocations.reduce((a, x) => a + x.amount, 0);
        try {
            await tdsComplianceApi.createChallan({
                bsrCode: chForm.bsrCode,
                challanSerial: chForm.challanSerial,
                bankName: chForm.bankName,
                challanDate: chForm.challanDate,
                financialYear: fy,
                primaryQuarter: chPull.quarter || '',
                amountDeposited: sumAlloc,
                interest: Number(chForm.interest) || 0,
                lateFee: Number(chForm.lateFee) || 0,
                penalty: Number(chForm.penalty) || 0,
                totalPaidAmount:
                    chForm.totalPaidAmount !== '' && chForm.totalPaidAmount != null
                        ? Number(chForm.totalPaidAmount)
                        : undefined,
                assessmentYear: chForm.assessmentYear,
                assessmentYearOverrideReason: chForm.assessmentYearOverrideReason,
                cinNumber: chForm.cinNumber,
                remarks: chForm.remarks,
                paymentMode: chForm.paymentMode,
                bankLedgerId: chForm.bankLedgerId || undefined,
                status: saveMode,
                postAccounting: saveMode === 'Paid' && !!chForm.bankLedgerId,
                allocations,
            });
            toast.success(`Challan ${saveMode === 'Draft' ? 'saved as draft' : saveMode === 'Generated' ? 'generated' : 'saved'}`);
            loadChallans();
            loadUnpaidForChallan();
            if (saveMode !== 'Draft') setChallanView('register');
        } catch (e) {
            toast.error(e.response?.data?.message || e.message);
        }
    };

    const fetchPdfBlob = async (id, variant = 'official') => {
        return tdsComplianceApi.downloadChallanPdf(id, variant);
    };

    const downloadPdf = async (id, variant = 'official') => {
        try {
            const blob = await fetchPdfBlob(id, variant);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `TDS-Challan-${variant}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(e.response?.data?.message || 'PDF download failed');
        }
    };

    const openItns281FromCreate = () => {
        const allocations = buildAllocations();
        if (!allocations.length) {
            toast.error('Select at least one row with a positive pay amount');
            return;
        }
        setItns281ChallanId(null);
        setItns281Payload({
            financialYear: fy,
            assessmentYear: chForm.assessmentYear,
            allocations,
            interest: Number(chForm.interest) || 0,
            penalty: Number(chForm.penalty) || 0,
            lateFee: Number(chForm.lateFee) || 0,
            payment: {
                typeOfPayment: '200',
                paymentDate: chForm.challanDate,
                drawnOnBank: chForm.bankName,
                paidMode: chForm.paymentMode,
            },
        });
        setItns281Open(true);
    };

    const openItns281FromRegister = (c) => {
        if (String(c.status || '').toLowerCase() === 'cancelled') {
            toast.error('Cancelled challan cannot be used for bank challan');
            return;
        }
        setItns281ChallanId(c._id);
        setItns281Payload({
            financialYear: fy,
            challanId: c._id,
            payment: {
                typeOfPayment: '200',
                interest: Number(c.interest) || 0,
                penalty: (Number(c.penalty) || 0) + (Number(c.lateFee) || 0),
            },
        });
        setItns281Open(true);
    };

    const previewPdf = async (id, variant = 'official') => {
        try {
            const blob = await fetchPdfBlob(id, variant);
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) {
            toast.error(e.response?.data?.message || 'PDF preview failed');
        }
    };

    const printPdf = async (id, variant = 'official') => {
        try {
            const blob = await fetchPdfBlob(id, variant);
            const url = URL.createObjectURL(blob);
            const w = window.open(url, '_blank', 'noopener,noreferrer');
            if (w) w.addEventListener('load', () => w.print());
        } catch (e) {
            toast.error(e.response?.data?.message || 'Print failed');
        }
    };

    const clearUnpaidSelection = () => {
        setSelUnpaid({});
        setChForm((p) => ({ ...p, amountDeposited: '' }));
    };

    const openMarkPaid = (c) => {
        setMarkPaidId(c._id);
        setMarkPaidForm({
            bsrCode: c.bsrCode || '',
            challanSerial: c.challanSerial || '',
            cinNumber: c.cinNumber || '',
            bankName: c.bankName || '',
            challanDate: c.challanDate ? new Date(c.challanDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
            amountDeposited: String(c.amountDeposited || ''),
            paymentMode: c.paymentMode || '',
            bankLedgerId: c.bankLedgerId || '',
            remarks: c.remarks || '',
        });
    };

    const submitMarkPaid = async (e) => {
        e.preventDefault();
        try {
            await tdsComplianceApi.markChallanPaid(markPaidId, {
                ...markPaidForm,
                amountDeposited: Number(markPaidForm.amountDeposited),
                postAccounting: !!markPaidForm.bankLedgerId,
            });
            toast.success('Challan marked paid');
            setMarkPaidId(null);
            loadChallans();
            loadUnpaidForChallan();
        } catch (err) {
            toast.error(err.response?.data?.message || err.message);
        }
    };

    const openSend = (c, channel) => {
        setSendModal({ challan: c, channel });
    };

    const doSend = () => {
        const c = sendModal?.challan;
        if (!c) return;
        const pdfVariant = sendModal.channel === 'email' ? 'official' : 'client';
        downloadPdf(c._id, pdfVariant);
        const subject = encodeURIComponent(`TDS Challan ${c.challanNo || ''}`);
        const body = encodeURIComponent(sendMsg);
        if (sendModal.channel === 'email') {
            window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
        } else {
            window.open(`https://wa.me/?text=${body}`, '_blank');
        }
        toast.success('Download PDF and attach in your email/WhatsApp app');
        setSendModal(null);
    };

    const selectedSummary = useMemo(() => {
        let tds = 0;
        let taxable = 0;
        Object.keys(selUnpaid).forEach((k) => {
            const row = unpaidRows.find((r) => r.rowKey === k);
            if (!row) return;
            tds += Number(selUnpaid[k].applyAmount) || 0;
            taxable += Number(row.taxableAmount) || 0;
        });
        return { tds, taxable, count: Object.keys(selUnpaid).length };
    }, [selUnpaid, unpaidRows]);

    return (
        <div className={styles.challanRoot}>
            <TdsSubTabs
                items={[
                    ['create', 'Create challan'],
                    ['register', 'Challan register'],
                ]}
                active={challanView}
                onChange={setChallanView}
            />
            {challanView === 'register' && (
                <div style={{ marginBottom: 12 }}>
                    <Button type="button" variant="secondary" onClick={() => setShowPayOnline(true)}>
                        Pay TDS Online
                    </Button>
                </div>
            )}

            {showPayOnline && (
                <div
                    role="dialog"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                    }}
                    onClick={() => setShowPayOnline(false)}
                >
                    <div
                        style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 480, margin: 16 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ marginTop: 0 }}>Pay TDS on Income Tax portal</h3>
                        <p style={{ fontSize: 14, color: '#475569' }}>
                            Complete payment on the official <strong>Income Tax e-Pay Tax</strong> portal using TAN login. CRM does not
                            submit payment or OTP on your behalf.
                        </p>
                        <p style={{ fontSize: 13, color: '#64748b' }}>
                            After payment, return here and enter <strong>BSR code</strong>, <strong>challan serial / CIN</strong>,{' '}
                            <strong>bank name</strong>, and <strong>challan date</strong>, then use <strong>Mark Paid</strong> in the register.
                        </p>
                        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                            <Button
                                type="button"
                                onClick={() => window.open(IT_EPAY_URL, '_blank', 'noopener,noreferrer')}
                            >
                                Open e-Pay Tax portal
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => setShowPayOnline(false)}>
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {challanView === 'create' && (
                <>
                    <p style={{ color: '#64748b', fontSize: 13, marginBottom: 12 }}>
                        FY <strong>{fy}</strong> · AY <strong>{chForm.assessmentYear || assessmentYearFromIsoFY(fy)}</strong>. Auto Pull → select rows →
                        Save Draft / Generate, then pay online and Mark Paid.
                    </p>
                    {/* filters + unpaid table - abbreviated: same as page */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12, padding: 12, background: '#f8fafc', borderRadius: 8 }}>
                        <label>
                            Quarter
                            <select value={chPull.quarter} onChange={(e) => setChPull((p) => ({ ...p, quarter: e.target.value }))} style={{ display: 'block', marginTop: 4 }}>
                                <option value="">All</option>
                                {QUARTERS.map((q) => (
                                    <option key={q} value={q}>{q}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            From
                            <input type="date" value={chPull.fromDate} onChange={(e) => setChPull((p) => ({ ...p, fromDate: e.target.value }))} style={{ display: 'block', marginTop: 4 }} />
                        </label>
                        <label>
                            To
                            <input type="date" value={chPull.toDate} onChange={(e) => setChPull((p) => ({ ...p, toDate: e.target.value }))} style={{ display: 'block', marginTop: 4 }} />
                        </label>
                        <label>
                            Section
                            <select value={chPull.section} onChange={(e) => setChPull((p) => ({ ...p, section: e.target.value }))} style={{ display: 'block', marginTop: 4 }}>
                                <option value="">All</option>
                                {SECTIONS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            TDS payable ledger
                            <select
                                value={chPull.payableLedgerId}
                                onChange={(e) => setChPull((p) => ({ ...p, payableLedgerId: e.target.value }))}
                                style={{ display: 'block', marginTop: 4, minWidth: 200 }}
                            >
                                <option value="">All</option>
                                {(payableOptions || []).map((o) => (
                                    <option key={o.id} value={o.id}>{o.label}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Supplier / deductee
                            <select
                                value={chPull.supplierId}
                                onChange={(e) => setChPull((p) => ({ ...p, supplierId: e.target.value }))}
                                style={{ display: 'block', marginTop: 4, minWidth: 200 }}
                            >
                                <option value="">All</option>
                                {(suppliers || []).map((s) => (
                                    <option key={s._id} value={s._id}>{s.supplierName}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Status
                            <select value={chPull.status} onChange={(e) => setChPull((p) => ({ ...p, status: e.target.value }))} style={{ display: 'block', marginTop: 4, minWidth: 140 }}>
                                <option value="UnpaidOrPart">Unpaid / Part paid</option>
                                <option value="Unpaid">Unpaid only</option>
                                <option value="Part Paid">Part paid only</option>
                            </select>
                        </label>
                        <Button type="button" onClick={loadUnpaidForChallan} disabled={chPullLoading}>
                            {chPullLoading ? 'Loading…' : 'Auto Pull Unpaid TDS'}
                        </Button>
                        <Button type="button" variant="secondary" onClick={selectAllUnpaid} disabled={!unpaidRows.length}>
                            Select all
                        </Button>
                        <Button type="button" variant="secondary" onClick={clearUnpaidSelection}>
                            Clear selection
                        </Button>
                    </div>

                    {!!unpaidRows.length && (
                        <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                        <th style={{ padding: 6 }} />
                                        <th style={{ padding: 6 }}>Deduction date</th>
                                        <th style={{ padding: 6 }}>Voucher no</th>
                                        <th style={{ padding: 6 }}>Supplier</th>
                                        <th style={{ padding: 6 }}>PAN</th>
                                        <th style={{ padding: 6 }}>Section</th>
                                        <th style={{ padding: 6 }}>Payable ledger</th>
                                        <th style={{ padding: 6 }}>Taxable</th>
                                        <th style={{ padding: 6 }}>TDS</th>
                                        <th style={{ padding: 6 }}>Paid</th>
                                        <th style={{ padding: 6 }}>Balance</th>
                                        <th style={{ padding: 6 }}>Pay now</th>
                                        <th style={{ padding: 6 }}>Qtr</th>
                                        <th style={{ padding: 6 }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unpaidRows.map((r) => {
                                        const sel = selUnpaid[r.rowKey];
                                        return (
                                            <tr key={r.rowKey} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: 6 }}>
                                                    <input type="checkbox" checked={!!sel} onChange={() => toggleUnpaidRow(r)} />
                                                </td>
                                                <td style={{ padding: 6 }}>{r.deductionDate ? new Date(r.deductionDate).toLocaleDateString('en-IN') : '—'}</td>
                                                <td style={{ padding: 6 }}>
                                                    {r.voucherNo}
                                                    <span style={{ color: '#94a3b8', fontSize: 11 }}> ({r.source})</span>
                                                </td>
                                                <td style={{ padding: 6 }}>{r.supplierName}</td>
                                                <td style={{ padding: 6 }}>{r.deducteePan}</td>
                                                <td style={{ padding: 6 }}>{r.section}</td>
                                                <td style={{ padding: 6 }}>{r.tdsPayableLedgerName || '—'}</td>
                                                <td style={{ padding: 6 }}>{Number(r.taxableAmount || 0).toFixed(2)}</td>
                                                <td style={{ padding: 6 }}>{Number(r.tdsAmount || 0).toFixed(2)}</td>
                                                <td style={{ padding: 6 }}>{Number(r.alreadyPaidAmount || 0).toFixed(2)}</td>
                                                <td style={{ padding: 6 }}>{Number(r.balancePayable || 0).toFixed(2)}</td>
                                                <td style={{ padding: 6 }}>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        disabled={!sel}
                                                        value={sel ? sel.applyAmount : ''}
                                                        onChange={(e) => setUnpaidApplyAmount(r.rowKey, e.target.value)}
                                                        style={{ width: 88 }}
                                                    />
                                                </td>
                                                <td style={{ padding: 6 }}>{r.quarter}</td>
                                                <td style={{ padding: 6 }}>{r.status}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {selectedSummary.count > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                            <p style={{ fontSize: 13, margin: 0 }}>
                                Selected {selectedSummary.count} row(s) · Pay total ₹{selectedSummary.tds.toFixed(2)}
                            </p>
                            <Button type="button" variant="secondary" onClick={openItns281FromCreate}>
                                Bank Challan ITNS 281
                            </Button>
                        </div>
                    )}

                    <h3>New challan</h3>
                    <div style={{ display: 'grid', gap: 10, maxWidth: 520, marginBottom: 20 }}>
                        <Input label="Challan date" type="date" value={chForm.challanDate} onChange={(e) => setChForm((p) => ({ ...p, challanDate: e.target.value }))} required />
                        <Input label="Assessment year" value={chForm.assessmentYear} onChange={(e) => setChForm((p) => ({ ...p, assessmentYear: e.target.value }))} />
                        <Input label="Amount (TDS) — from selection" type="number" value={chForm.amountDeposited} onChange={(e) => setChForm((p) => ({ ...p, amountDeposited: e.target.value }))} />
                        <Input label="Interest" type="number" value={chForm.interest} onChange={(e) => setChForm((p) => ({ ...p, interest: e.target.value }))} />
                        <Input label="Late fee" type="number" value={chForm.lateFee} onChange={(e) => setChForm((p) => ({ ...p, lateFee: e.target.value }))} />
                        <Input label="Penalty" type="number" value={chForm.penalty} onChange={(e) => setChForm((p) => ({ ...p, penalty: e.target.value }))} />
                        <Input
                            label="AY override reason (if AY ≠ expected)"
                            value={chForm.assessmentYearOverrideReason}
                            onChange={(e) => setChForm((p) => ({ ...p, assessmentYearOverrideReason: e.target.value }))}
                        />
                        <Input label="BSR code" value={chForm.bsrCode} onChange={(e) => setChForm((p) => ({ ...p, bsrCode: e.target.value }))} />
                        <Input label="Challan serial / CIN" value={chForm.challanSerial} onChange={(e) => setChForm((p) => ({ ...p, challanSerial: e.target.value }))} />
                        <Input label="CIN" value={chForm.cinNumber} onChange={(e) => setChForm((p) => ({ ...p, cinNumber: e.target.value }))} />
                        <Input label="Bank name" value={chForm.bankName} onChange={(e) => setChForm((p) => ({ ...p, bankName: e.target.value }))} />
                        <label>
                            Payment mode
                            <select value={chForm.paymentMode} onChange={(e) => setChForm((p) => ({ ...p, paymentMode: e.target.value }))} style={{ width: '100%', marginTop: 4, padding: 8 }}>
                                <option value="">—</option>
                                <option value="Net Banking">Net Banking</option>
                                <option value="UPI">UPI</option>
                                <option value="Debit Card">Debit Card</option>
                                <option value="Credit Card">Credit Card</option>
                                <option value="Other">Other</option>
                            </select>
                        </label>
                        <Input label="Bank ledger ID (for JV when marking Paid)" value={chForm.bankLedgerId} onChange={(e) => setChForm((p) => ({ ...p, bankLedgerId: e.target.value }))} />
                        <Input label="Remarks" value={chForm.remarks} onChange={(e) => setChForm((p) => ({ ...p, remarks: e.target.value }))} />
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            <Button type="button" variant="secondary" onClick={() => saveChallan('Draft')}>
                                Save as Draft
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => saveChallan('Generated')}>
                                Generate challan
                            </Button>
                            <Button type="button" onClick={() => saveChallan('Paid')}>
                                Save &amp; mark Paid
                            </Button>
                        </div>
                    </div>
                </>
            )}

            {challanView === 'register' && (
                <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                        <Input label="Challan no." value={regFilters.challanNo} onChange={(e) => setRegFilters((p) => ({ ...p, challanNo: e.target.value }))} />
                        <label>
                            Status
                            <select value={regFilters.status} onChange={(e) => setRegFilters((p) => ({ ...p, status: e.target.value }))} style={{ display: 'block', marginTop: 4 }}>
                                <option value="">All</option>
                                <option value="Draft">Draft</option>
                                <option value="Generated">Generated</option>
                                <option value="Paid">Paid</option>
                                <option value="Part Paid">Part Paid</option>
                            </select>
                        </label>
                        <Button type="button" onClick={loadChallans}>Refresh</Button>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                                    <th style={{ padding: 8 }}>CRM No.</th>
                                    <th style={{ padding: 8 }}>Date</th>
                                    <th style={{ padding: 8 }}>FY</th>
                                    <th style={{ padding: 8 }}>AY</th>
                                    <th style={{ padding: 8 }}>Qtr</th>
                                    <th style={{ padding: 8 }}>TDS</th>
                                    <th style={{ padding: 8 }}>Paid</th>
                                    <th style={{ padding: 8 }}>BSR</th>
                                    <th style={{ padding: 8 }}>Serial</th>
                                    <th style={{ padding: 8 }}>Status</th>
                                    <th style={{ padding: 8 }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {challans.map((c) => (
                                    <tr key={c._id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: 8, fontWeight: 600 }}>{c.challanNo}</td>
                                        <td style={{ padding: 8 }}>{c.challanDate ? new Date(c.challanDate).toLocaleDateString('en-IN') : '—'}</td>
                                        <td style={{ padding: 8 }}>{c.displayFinancialYear || c.financialYear}</td>
                                        <td style={{ padding: 8 }}>{c.displayAssessmentYear || c.assessmentYear}</td>
                                        <td style={{ padding: 8 }}>{c.primaryQuarter || '—'}</td>
                                        <td style={{ padding: 8 }}>{Number(c.totalTdsAmount || c.amountDeposited || 0).toFixed(2)}</td>
                                        <td style={{ padding: 8 }}>{Number(c.amountDeposited || 0).toFixed(2)}</td>
                                        <td style={{ padding: 8 }}>{c.bsrCode || '—'}</td>
                                        <td style={{ padding: 8 }}>{c.challanSerial || c.cinNumber || '—'}</td>
                                        <td style={{ padding: 8 }}>{c.status}</td>
                                        <td style={{ padding: 8, whiteSpace: 'nowrap' }}>
                                            <Button type="button" variant="secondary" onClick={() => openItns281FromRegister(c)}>
                                                Bank Challan ITNS 281
                                            </Button>{' '}
                                            <Button type="button" variant="secondary" onClick={() => previewPdf(c._id, 'official')}>Preview</Button>{' '}
                                            <Button type="button" variant="secondary" onClick={() => downloadPdf(c._id, 'official')}>PDF</Button>{' '}
                                            <Button type="button" variant="secondary" onClick={() => downloadPdf(c._id, 'client')}>Client</Button>{' '}
                                            <Button type="button" variant="secondary" onClick={() => printPdf(c._id, 'official')}>Print</Button>{' '}
                                            {(c.status === 'Draft' || c.status === 'Generated') && (
                                                <Button type="button" onClick={() => openMarkPaid(c)}>Mark Paid</Button>
                                            )}{' '}
                                            <Button type="button" variant="secondary" onClick={() => openSend(c, 'email')}>Email</Button>{' '}
                                            <Button type="button" variant="secondary" onClick={() => openSend(c, 'whatsapp')}>WhatsApp</Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {markPaidId && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                    }}
                >
                    <form
                        onSubmit={submitMarkPaid}
                        style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 440, width: '100%', margin: 16 }}
                    >
                        <h3 style={{ marginTop: 0 }}>Mark challan paid</h3>
                        <Input label="BSR code" value={markPaidForm.bsrCode} onChange={(e) => setMarkPaidForm((p) => ({ ...p, bsrCode: e.target.value }))} required />
                        <Input label="Challan serial" value={markPaidForm.challanSerial} onChange={(e) => setMarkPaidForm((p) => ({ ...p, challanSerial: e.target.value }))} />
                        <Input label="CIN" value={markPaidForm.cinNumber} onChange={(e) => setMarkPaidForm((p) => ({ ...p, cinNumber: e.target.value }))} />
                        <Input label="Bank name" value={markPaidForm.bankName} onChange={(e) => setMarkPaidForm((p) => ({ ...p, bankName: e.target.value }))} required />
                        <Input label="Challan date" type="date" value={markPaidForm.challanDate} onChange={(e) => setMarkPaidForm((p) => ({ ...p, challanDate: e.target.value }))} required />
                        <Input label="Paid amount" type="number" value={markPaidForm.amountDeposited} onChange={(e) => setMarkPaidForm((p) => ({ ...p, amountDeposited: e.target.value }))} required />
                        <Input label="Bank ledger ID (JV credit)" value={markPaidForm.bankLedgerId} onChange={(e) => setMarkPaidForm((p) => ({ ...p, bankLedgerId: e.target.value }))} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <Button type="submit">Save &amp; link TDS rows</Button>
                            <Button type="button" variant="secondary" onClick={() => setMarkPaidId(null)}>Cancel</Button>
                        </div>
                    </form>
                </div>
            )}

            {sendModal && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                    }}
                >
                    <div style={{ background: '#fff', padding: 24, borderRadius: 8, maxWidth: 480, margin: 16 }}>
                        <h3 style={{ marginTop: 0 }}>Send {sendModal.channel === 'email' ? 'Email' : 'WhatsApp'}</h3>
                        <textarea
                            value={sendMsg}
                            onChange={(e) => setSendMsg(e.target.value)}
                            rows={4}
                            style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                            <Button type="button" onClick={doSend}>Download PDF &amp; open {sendModal.channel}</Button>
                            <Button type="button" variant="secondary" onClick={() => setSendModal(null)}>Cancel</Button>
                        </div>
                    </div>
                </div>
            )}

            <TdsItns281PreviewModal
                open={itns281Open}
                onClose={() => setItns281Open(false)}
                requestPayload={itns281Payload}
                challanId={itns281ChallanId}
            />
        </div>
    );
}
