import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCompany } from '@/contexts/CompanyContext';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import FYBadge from '@/components/ui/FYBadge';
import { getLedgers } from '@/services/accountApi';
import {
    getBillWiseWorkspace,
    postBillWiseFifoPreview,
    applyBillWiseAdjustments,
    getBillWiseHistory,
    reverseBillWiseAdjustment,
} from '@/services/billWiseAdjustmentApi';
import {
    getAvailableCustomerCreditNotes,
    applyCreditNoteAllocations,
    reverseCreditNoteAllocation,
} from '@/services/creditDebitNoteApi';
import { toast } from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';

const fmt = (n) =>
    (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

export default function BillWiseAdjustmentPage() {
    const [searchParams] = useSearchParams();
    const { selectedCompany } = useCompany();
    const { selectedFY } = useFinancialYear();
    const { hasRole, hasPermission } = useAuth();
    const isAdmin = hasRole('admin') || hasRole('superadmin');
    const canUseCreditNote = isAdmin || hasPermission('accounts.bill_adjustment.use_credit_note');
    const canViewNoteBalance = isAdmin || hasPermission('accounts.bill_adjustment.view_note_balance');
    const canReverseNote = isAdmin || hasPermission('accounts.bill_adjustment.reverse_note_allocation');

    const [ledgerType, setLedgerType] = useState('Customer');
    const [ledgers, setLedgers] = useState([]);
    const [ledgerId, setLedgerId] = useState(searchParams.get('ledgerId') || '');
    const financialYear = selectedFY || '';
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [show, setShow] = useState('all');

    const [workspace, setWorkspace] = useState({ bills: [], payments: [], ledger: null });
    const [loading, setLoading] = useState(false);
    const [remarks, setRemarks] = useState('');
    const [allowCrossFy, setAllowCrossFy] = useState(false);

    const [selectedBillId, setSelectedBillId] = useState('');
    const [selectedPayId, setSelectedPayId] = useState('');
    const [allocAmount, setAllocAmount] = useState('');
    const [lines, setLines] = useState([]);

    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Phase 4A — Customer Credit Notes
    const [availableCNs, setAvailableCNs] = useState([]);
    const [cnLoading, setCnLoading] = useState(false);
    const [selectedCnId, setSelectedCnId] = useState('');
    const [cnBillId, setCnBillId] = useState('');
    const [cnAmount, setCnAmount] = useState('');
    const [cnBusy, setCnBusy] = useState(false);

    const paymentIdParam = searchParams.get('paymentVoucherId');

    useEffect(() => {
        getLedgers()
            .then((list) => setLedgers(Array.isArray(list) ? list : []))
            .catch(() => toast.error('Could not load ledgers'));
    }, []);

    const filteredLedgers = useMemo(
        () => ledgers.filter((l) => (ledgerType === 'Customer' ? l.type === 'Customer' : l.type === 'Supplier')),
        [ledgers, ledgerType],
    );

    const loadWorkspace = useCallback(async () => {
        if (!ledgerId) return;
        setLoading(true);
        try {
            const data = await getBillWiseWorkspace({
                ledgerId,
                financialYear: financialYear || undefined,
                from: fromDate || undefined,
                to: toDate || undefined,
                show,
            });
            setWorkspace(data);
        } catch (e) {
            toast.error(e.response?.data?.message || e.message || 'Failed to load workspace');
        } finally {
            setLoading(false);
        }
    }, [ledgerId, financialYear, fromDate, toDate, show]);

    useEffect(() => {
        loadWorkspace();
    }, [loadWorkspace]);

    const loadHistory = useCallback(async () => {
        if (!ledgerId) return;
        setHistoryLoading(true);
        try {
            const rows = await getBillWiseHistory({ ledgerId, includeReversed: 'true' });
            setHistory(rows || []);
        } catch {
            toast.error('Failed to load adjustment history');
        } finally {
            setHistoryLoading(false);
        }
    }, [ledgerId]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory]);

    const loadAvailableCNs = useCallback(async () => {
        if (ledgerType !== 'Customer' || !workspace.ledger?.referenceId) {
            setAvailableCNs([]);
            return;
        }
        if (!canViewNoteBalance && !canUseCreditNote) {
            setAvailableCNs([]);
            return;
        }
        setCnLoading(true);
        try {
            const rows = await getAvailableCustomerCreditNotes({
                customerId: workspace.ledger.referenceId,
                financialYear: financialYear || undefined,
            });
            setAvailableCNs(Array.isArray(rows) ? rows : []);
        } catch (e) {
            setAvailableCNs([]);
            if (e.response?.status !== 403) {
                toast.error(e.response?.data?.message || 'Could not load Credit Notes');
            }
        } finally {
            setCnLoading(false);
        }
    }, [ledgerType, workspace.ledger, financialYear, canViewNoteBalance, canUseCreditNote]);

    useEffect(() => {
        loadAvailableCNs();
    }, [loadAvailableCNs]);

    const applyCnAllocation = async () => {
        if (!canUseCreditNote) return toast.error('Permission denied: accounts.bill_adjustment.use_credit_note');
        const amt = Number(cnAmount);
        if (!selectedCnId || !cnBillId || !(amt > 0)) {
            toast.error('Select Credit Note, Sales Invoice, and amount');
            return;
        }
        setCnBusy(true);
        try {
            await applyCreditNoteAllocations({
                sourceMode: 'BillWisePage',
                remarks,
                lines: [{ creditNoteId: selectedCnId, salesInvoiceId: cnBillId, amount: amt }],
            });
            toast.success('Credit Note allocated to Sales Invoice (no bank receipt created)');
            setCnAmount('');
            loadWorkspace();
            loadHistory();
            loadAvailableCNs();
        } catch (e) {
            toast.error(e.response?.data?.message || 'Credit Note allocation failed');
        } finally {
            setCnBusy(false);
        }
    };

    const fifoPreview = async () => {
        if (!ledgerId) return;
        try {
            const data = await postBillWiseFifoPreview({
                ledgerId,
                financialYear: financialYear || undefined,
                from: fromDate || undefined,
                to: toDate || undefined,
                show,
            });
            setLines(
                (data.proposed || []).map((l) => ({
                    ...l,
                    key: `${l.billDocumentId}-${l.paymentVoucherId}-${l.adjustedAmount}`,
                })),
            );
            toast.success(`FIFO preview: ${data.proposed?.length || 0} allocation(s). Review and Save.`);
        } catch (e) {
            toast.error(e.response?.data?.message || 'FIFO preview failed');
        }
    };

    const addLineFromSelection = () => {
        const amt = Number(allocAmount);
        if (!selectedBillId || !selectedPayId || !(amt > 0)) {
            toast.error('Select one bill, one payment, and enter amount > 0');
            return;
        }
        const bill = workspace.bills.find((b) => String(b._id) === String(selectedBillId));
        const pay = workspace.payments.find((p) => String(p._id) === String(selectedPayId));
        if (!bill || !pay) return;
        const docType = bill.billDocumentType || (ledgerType === 'Customer' ? 'SalesInvoice' : 'PurchaseInvoice');
        if (amt > bill.pendingAmount + 0.01) {
            toast.error('Amount exceeds bill pending');
            return;
        }
        if (amt > pay.availableBalance + 0.01) {
            toast.error('Amount exceeds payment available balance');
            return;
        }
        setLines((prev) => [
            ...prev,
            {
                key: `${selectedBillId}-${selectedPayId}-${Date.now()}`,
                billDocumentId: selectedBillId,
                billDocumentType: docType,
                paymentVoucherId: selectedPayId,
                adjustedAmount: amt,
            },
        ]);
        setAllocAmount('');
    };

    const saveLines = async () => {
        if (!ledgerId || lines.length === 0) {
            toast.error('No allocation lines');
            return;
        }
        try {
            const payload = {
                ledgerId,
                remarks,
                allowCrossFy,
                lines: lines.map(({ billDocumentId, billDocumentType, paymentVoucherId, adjustedAmount }) => ({
                    billDocumentId,
                    billDocumentType,
                    paymentVoucherId,
                    adjustedAmount,
                })),
            };
            await applyBillWiseAdjustments(payload);
            toast.success('Bill-wise adjustments saved');
            setLines([]);
            loadWorkspace();
            loadHistory();
        } catch (e) {
            toast.error(e.response?.data?.message || e.message || 'Save failed');
        }
    };

    const totalBill = lines.reduce((s, l) => s + Number(l.adjustedAmount || 0), 0);

    useEffect(() => {
        if (paymentIdParam) {
            setSelectedPayId(paymentIdParam);
        }
    }, [paymentIdParam]);

    return (
        <div style={{ padding: '20px 24px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
            <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Bill-wise Adjustment</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                    Bill-wise Settlement — Company: <strong>{selectedCompany?.companyName || '—'}</strong>
                    {' · '}F.Y.: <strong>{financialYear || '—'}</strong>
                </p>
                <FYBadge />
            </div>

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 10,
                    alignItems: 'flex-end',
                    marginBottom: 16,
                    padding: 12,
                    background: '#fff',
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                }}
            >
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Ledger Type</label>
                    <select
                        value={ledgerType}
                        onChange={(e) => {
                            setLedgerType(e.target.value);
                            setLedgerId('');
                            setWorkspace({ bills: [], payments: [], ledger: null });
                        }}
                        style={{ display: 'block', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                        <option value="Customer">Customer</option>
                        <option value="Supplier">Supplier</option>
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Ledger</label>
                    <select
                        value={ledgerId}
                        onChange={(e) => setLedgerId(e.target.value)}
                        style={{ display: 'block', marginTop: 4, minWidth: 240, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                    >
                        <option value="">— Select ledger —</option>
                        {filteredLedgers.map((l) => (
                            <option key={l._id} value={l._id}>
                                {l.name}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>From</label>
                    <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ display: 'block', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>To</label>
                    <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ display: 'block', marginTop: 4, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                </div>
                <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Show</label>
                    <select value={show} onChange={(e) => setShow(e.target.value)} style={{ display: 'block', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
                        <option value="all">All</option>
                        <option value="pending">Pending bills</option>
                        <option value="part paid">Part paid bills</option>
                        <option value="paid">Fully paid bills</option>
                        <option value="advance only">Advance only (payments)</option>
                    </select>
                </div>
                <button
                    type="button"
                    onClick={loadWorkspace}
                    style={{ padding: '8px 16px', background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                >
                    Refresh
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <input type="checkbox" checked={allowCrossFy} onChange={(e) => setAllowCrossFy(e.target.checked)} />
                    Allow cross-F.Y. (admin use)
                </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <Panel title={ledgerType === 'Customer' ? 'Open sales invoices' : 'Open purchase bills'} loading={loading}>
                    <table style={tbl}>
                        <thead>
                            <tr>
                                <th style={th}>Pick</th>
                                <th style={th}>Date</th>
                                <th style={th}>No.</th>
                                <th style={th}>Type</th>
                                <th style={th}>Original</th>
                                <th style={th}>Adjusted</th>
                                <th style={th}>Pending</th>
                                <th style={th}>Due</th>
                                <th style={th}>Overdue</th>
                                <th style={th}>Ageing</th>
                            </tr>
                        </thead>
                        <tbody>
                            {workspace.bills.map((b) => (
                                <tr key={b._id} style={{ background: String(selectedBillId) === String(b._id) ? '#e0f2fe' : 'transparent' }}>
                                    <td style={td}>
                                        <input type="radio" name="billPick" checked={String(selectedBillId) === String(b._id)} onChange={() => setSelectedBillId(String(b._id))} />
                                    </td>
                                    <td style={td}>{fmtDate(b.billDate)}</td>
                                    <td style={td}>{b.billNo}</td>
                                    <td style={td}>{b.voucherType}</td>
                                    <td style={td}>₹{fmt(b.originalAmount)}</td>
                                    <td style={td}>₹{fmt(b.adjustedAmount)}</td>
                                    <td style={td}>₹{fmt(b.pendingAmount)}</td>
                                    <td style={td}>{fmtDate(b.dueDate)}</td>
                                    <td style={td}>{b.overdueDays || '—'}</td>
                                    <td style={td}>{b.ageingBucket || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
                <Panel title={ledgerType === 'Customer' ? 'Receipts / advances' : 'Payments / advances'} loading={loading}>
                    <table style={tbl}>
                        <thead>
                            <tr>
                                <th style={th}>Pick</th>
                                <th style={th}>Date</th>
                                <th style={th}>No.</th>
                                <th style={th}>Type</th>
                                <th style={th}>Amount</th>
                                <th style={th}>On bill</th>
                                <th style={th}>Available</th>
                                <th style={th}>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {workspace.payments.map((p) => (
                                <tr key={p._id} style={{ background: String(selectedPayId) === String(p._id) ? '#fef9c3' : 'transparent' }}>
                                    <td style={td}>
                                        <input
                                            type="radio"
                                            name="payPick"
                                            checked={String(selectedPayId) === String(p._id)}
                                            onChange={() => setSelectedPayId(String(p._id))}
                                        />
                                    </td>
                                    <td style={td}>{fmtDate(p.voucherDate)}</td>
                                    <td style={td}>{p.voucherNo}</td>
                                    <td style={td}>{p.voucherType}</td>
                                    <td style={td}>₹{fmt(p.amount)}</td>
                                    <td style={td}>₹{fmt(p.adjustedAmount)}</td>
                                    <td style={td}>₹{fmt(p.availableBalance)}</td>
                                    <td style={td}>{p.adjustmentStatus}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Panel>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                    <button type="button" onClick={fifoPreview} style={{ padding: '8px 14px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                        Auto adjust FIFO (preview)
                    </button>
                    <span style={{ fontSize: 13, color: '#64748b' }}>Allocation amount (₹)</span>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={allocAmount}
                        onChange={(e) => setAllocAmount(e.target.value)}
                        style={{ width: 120, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                    />
                    <button type="button" onClick={addLineFromSelection} style={{ padding: '8px 14px', background: '#14b8a6', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                        Add allocation line
                    </button>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Staged allocations</h3>
                {lines.length === 0 ? (
                    <p style={{ color: '#94a3b8' }}>No lines — use FIFO or add manually.</p>
                ) : (
                    <table style={tbl}>
                        <thead>
                            <tr>
                                <th style={th}>Bill ID</th>
                                <th style={th}>Bill type</th>
                                <th style={th}>Payment voucher</th>
                                <th style={th}>Amount (₹)</th>
                                <th style={th} />
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((l) => (
                                <tr key={l.key}>
                                    <td style={td}>{String(l.billDocumentId)}</td>
                                    <td style={td}>{l.billDocumentType}</td>
                                    <td style={td}>{String(l.paymentVoucherId)}</td>
                                    <td style={td}>{fmt(l.adjustedAmount)}</td>
                                    <td style={td}>
                                        <button type="button" onClick={() => setLines((p) => p.filter((x) => x.key !== l.key))} style={{ color: '#dc2626', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontWeight: 700 }}>Total allocation: ₹{fmt(totalBill)}</span>
                </div>
                <div style={{ marginTop: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Remarks</label>
                    <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} style={{ width: '100%', maxWidth: 480, padding: 8, borderRadius: 6, border: '1px solid #cbd5e1' }} />
                </div>
                <button type="button" onClick={saveLines} style={{ marginTop: 12, padding: '10px 22px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 800, cursor: 'pointer' }}>
                    Save adjustments
                </button>
            </div>

            {ledgerType === 'Customer' && (canViewNoteBalance || canUseCreditNote) && (
                <div style={{ background: '#fff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                    <h3 style={{ margin: '0 0 8px', fontSize: 14, color: '#5b21b6' }}>AVAILABLE CUSTOMER CREDIT NOTES</h3>
                    <p style={{ margin: '0 0 10px', fontSize: 12, color: '#64748b' }}>
                        Apply Final Credit Notes to pending Sales Invoices without creating a bank receipt. Bank allocations remain separate above.
                    </p>
                    {cnLoading ? (
                        <p style={{ color: '#94a3b8' }}>Loading Credit Notes…</p>
                    ) : (
                        <table style={tbl}>
                            <thead>
                                <tr>
                                    <th style={th}>Select</th>
                                    <th style={th}>CN No</th>
                                    <th style={th}>Date</th>
                                    <th style={th}>Original</th>
                                    <th style={th}>Applied</th>
                                    <th style={th}>Available</th>
                                    <th style={th}>Linked Invoice</th>
                                </tr>
                            </thead>
                            <tbody>
                                {availableCNs.length === 0 ? (
                                    <tr><td style={td} colSpan={7}>No Final Credit Notes with available balance (and linked accounting) for this customer.</td></tr>
                                ) : availableCNs.map((n) => (
                                    <tr key={n._id} style={{ background: String(selectedCnId) === String(n._id) ? '#f5f3ff' : undefined }}>
                                        <td style={td}>
                                            <input
                                                type="radio"
                                                name="cnSelect"
                                                checked={String(selectedCnId) === String(n._id)}
                                                onChange={() => setSelectedCnId(n._id)}
                                                disabled={!canUseCreditNote}
                                            />
                                        </td>
                                        <td style={td}>{n.noteNumber}</td>
                                        <td style={td}>{fmtDate(n.noteDate)}</td>
                                        <td style={td}>₹{fmt(n.originalAmount)}</td>
                                        <td style={td}>₹{fmt(n.appliedAmount)}</td>
                                        <td style={{ ...td, fontWeight: 700, color: '#5b21b6' }}>₹{fmt(n.availableBalance)}</td>
                                        <td style={td}>{n.linkedOriginalInvoice?.invoiceNumber || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    {canUseCreditNote && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, alignItems: 'flex-end' }}>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Sales Invoice</label>
                                <select
                                    value={cnBillId}
                                    onChange={(e) => setCnBillId(e.target.value)}
                                    style={{ display: 'block', marginTop: 4, minWidth: 200, padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
                                >
                                    <option value="">— Select invoice —</option>
                                    {(workspace.bills || [])
                                        .filter((b) => (b.billDocumentType || 'SalesInvoice') === 'SalesInvoice' && Number(b.pendingAmount) > 0)
                                        .map((b) => (
                                            <option key={b._id} value={b._id}>
                                                {b.billNo || b.invoiceNumber} (₹{fmt(b.pendingAmount)} pending)
                                            </option>
                                        ))}
                                </select>
                            </div>
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Amount to use</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={cnAmount}
                                    onChange={(e) => setCnAmount(e.target.value)}
                                    style={{ display: 'block', marginTop: 4, width: 140, padding: 6, borderRadius: 6, border: '1px solid #cbd5e1' }}
                                />
                            </div>
                            <button
                                type="button"
                                disabled={cnBusy}
                                onClick={applyCnAllocation}
                                style={{ padding: '8px 16px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}
                            >
                                {cnBusy ? 'Applying…' : 'Apply Credit Note'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Adjustment history (this ledger)</h3>
                {historyLoading ? (
                    <p style={{ color: '#94a3b8' }}>Loading…</p>
                ) : (
                    <table style={tbl}>
                        <thead>
                                <tr>
                                <th style={th}>Date</th>
                                <th style={th}>Bill</th>
                                <th style={th}>Payment / Source</th>
                                <th style={th}>CN Source</th>
                                <th style={th}>Amount</th>
                                <th style={th}>Reversed</th>
                                {(isAdmin || canReverseNote) && <th style={th} />}
                            </tr>
                            </thead>
                        <tbody>
                            {history.map((h) => (
                                <tr key={h._id}>
                                    <td style={td}>{fmtDate(h.adjustmentDate)}</td>
                                    <td style={td}>{h.billNo}</td>
                                    <td style={td}>{h.paymentNo}{h.paymentNature === 'Credit Note' ? ' (CN voucher)' : ''}</td>
                                    <td style={td}>{h.settlementSourceNumber || '—'}</td>
                                    <td style={td}>₹{fmt(h.adjustedAmount)}</td>
                                    <td style={td}>{h.isReversed ? 'Yes' : 'No'}</td>
                                    {(isAdmin || canReverseNote) && (
                                        <td style={td}>
                                            {!h.isReversed && (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        const reason = window.prompt('Reversal reason?');
                                                        if (!reason?.trim()) return;
                                                        try {
                                                            if (h.settlementSourceType === 'CreditDebitNote') {
                                                                await reverseCreditNoteAllocation(h._id, { reason });
                                                            } else {
                                                                await reverseBillWiseAdjustment(h._id, { reason });
                                                            }
                                                            toast.success('Reversed');
                                                            loadHistory();
                                                            loadWorkspace();
                                                            loadAvailableCNs();
                                                        } catch (e) {
                                                            toast.error(e.response?.data?.message || 'Reverse failed');
                                                        }
                                                    }}
                                                    style={{ color: '#b45309', border: 'none', background: 'transparent', cursor: 'pointer', fontWeight: 700 }}
                                                >
                                                    Reverse
                                                </button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

function Panel({ title, children, loading }) {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'auto' }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid #e2e8f0', fontWeight: 800, fontSize: 13 }}>{title}</div>
            {loading ? <div style={{ padding: 20, color: '#94a3b8' }}>Loading…</div> : <div style={{ overflowX: 'auto' }}>{children}</div>}
        </div>
    );
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', fontSize: 12, borderBottom: '1px solid #f1f5f9' };
const tbl = { width: '100%', borderCollapse: 'collapse', minWidth: 520 };
