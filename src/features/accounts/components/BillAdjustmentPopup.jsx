import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { getOutstandingBills } from '@/services/accountApi';
import { getAvailableCustomerCreditNotes } from '@/services/creditDebitNoteApi';
import { toast } from 'react-hot-toast';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n) =>
    r2(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function billOutstanding(bill, mode) {
    if (mode === 'payment') {
        return r2((bill.grandTotal ?? bill.roundedTotal ?? 0) - (bill.paidAmount || 0));
    }
    return r2((bill.roundedTotal ?? bill.grandTotal ?? 0) - (bill.paidAmount || 0));
}

function settlementStatus({ selected, bank, discount, roundOff, outstanding }) {
    if (!selected && bank <= 0 && discount <= 0 && Math.abs(roundOff) < 0.005) return '—';
    const total = r2(bank + discount + roundOff);
    if (total <= 0.009) return 'Unallocated';
    if (total > outstanding + 0.01) return 'Over-allocated';
    if (Math.abs(total - outstanding) <= 0.01) {
        return discount > 0.009 ? 'Settled with Discount' : 'Settled';
    }
    return 'Partially Settled';
}

/**
 * Phase 1 bill allocation grid (+ Phase 4A Credit Notes on receipt).
 * mode: 'receipt' | 'payment'
 */
export default function BillAdjustmentPopup({
    mode = 'receipt',
    ledgerId,
    amountToAdjust,
    customerId = null,
    ledgers = [],
    canUseCreditNote = false,
    canViewNoteBalance = false,
    onConfirm,
    onCancel,
}) {
    const isReceipt = mode === 'receipt';
    const discountLabel = isReceipt ? 'Discount Allowed' : 'Discount Received';
    const applyDiscountLabel = isReceipt ? 'Apply Discount' : 'Apply Discount Received';
    const refModel = isReceipt ? 'SalesInvoice' : 'PurchaseInvoice';

    const [bills, setBills] = useState([]);
    const [loading, setLoading] = useState(false);
    /** @type {Record<string, { selected: boolean, bankAmount: string, discount: string, roundOff: string, remarks: string, discountLedgerId: string, discountReason: string, discountError: string }>} */
    const [rows, setRows] = useState({});
    const [availableCNs, setAvailableCNs] = useState([]);
    const [cnLoading, setCnLoading] = useState(false);
    const [cnUseAmounts, setCnUseAmounts] = useState({});
    const [cnTargetInvoice, setCnTargetInvoice] = useState({});
    const [discountModalBillId, setDiscountModalBillId] = useState(null);
    const [discDraft, setDiscDraft] = useState({
        shortAmount: '',
        discountAmount: '',
        discountLedgerId: '',
        reason: '',
    });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const data = await getOutstandingBills(ledgerId);
                if (cancelled) return;
                const list = Array.isArray(data) ? data : [];
                setBills(list);
                const init = {};
                for (const b of list) {
                    init[String(b._id)] = {
                        selected: false,
                        bankAmount: '',
                        discount: '',
                        roundOff: '',
                        remarks: '',
                        discountLedgerId: '',
                        discountReason: '',
                        discountError: '',
                    };
                }
                setRows(init);
            } catch {
                toast.error('Failed to fetch outstanding bills');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [ledgerId]);

    useEffect(() => {
        if (!isReceipt || !customerId || (!canViewNoteBalance && !canUseCreditNote)) {
            setAvailableCNs([]);
            return;
        }
        setCnLoading(true);
        getAvailableCustomerCreditNotes({ customerId })
            .then((rowsCn) => setAvailableCNs(Array.isArray(rowsCn) ? rowsCn : []))
            .catch((e) => {
                setAvailableCNs([]);
                if (e.response?.status !== 403) {
                    toast.error(e.response?.data?.message || 'Could not load Credit Notes');
                }
            })
            .finally(() => setCnLoading(false));
    }, [isReceipt, customerId, canViewNoteBalance, canUseCreditNote]);

    const discountLedgers = useMemo(() => {
        const needle = isReceipt
            ? /discount\s*allowed|discount\s*on\s*sales|sales\s*discount|^discount$/i
            : /discount\s*received|discount\s*on\s*purchase|purchase\s*discount|^discount$/i;
        const preferred = (ledgers || []).filter((l) => needle.test(String(l.name || '').trim()));
        if (preferred.length) return preferred;
        return (ledgers || []).filter((l) => /discount/i.test(l.name || ''));
    }, [ledgers, isReceipt]);

    const defaultDiscountLedgerId = discountLedgers[0]?._id ? String(discountLedgers[0]._id) : '';

    const ensureDiscountDefaults = (row) => {
        const next = { ...row };
        if (r2(next.discount) > 0.009) {
            if (!String(next.discountLedgerId || '').trim() && defaultDiscountLedgerId) {
                next.discountLedgerId = defaultDiscountLedgerId;
            }
            if (!String(next.discountReason || '').trim()) {
                next.discountReason = String(next.remarks || '').trim() || 'Bill adjustment discount';
            }
            if (!String(next.remarks || '').trim()) {
                next.remarks = next.discountReason;
            }
        }
        return next;
    };

    const cnByInvoice = useMemo(() => {
        const map = {};
        for (const cn of availableCNs) {
            const amt = Number(cnUseAmounts[cn._id]) || 0;
            if (!(amt > 0)) continue;
            const invId = String(cnTargetInvoice[cn._id] || '');
            if (!invId) continue;
            map[invId] = r2((map[invId] || 0) + amt);
        }
        return map;
    }, [availableCNs, cnUseAmounts, cnTargetInvoice]);

    const bankAllocated = useMemo(
        () => Object.values(rows).reduce((s, r) => s + (r.selected ? r2(r.bankAmount) : 0), 0),
        [rows],
    );
    const discountTotal = useMemo(
        () => Object.values(rows).reduce((s, r) => s + (r.selected ? r2(r.discount) : 0), 0),
        [rows],
    );
    const roundOffTotal = useMemo(
        () => Object.values(rows).reduce((s, r) => s + (r.selected ? r2(r.roundOff) : 0), 0),
        [rows],
    );

    const shortAmountFor = (billId, override = {}) => {
        const bill = bills.find((b) => String(b._id) === String(billId));
        if (!bill) return 0;
        const row = { ...(rows[String(billId)] || {}), ...override };
        const outstanding = billOutstanding(bill, mode);
        const bank = r2(row.bankAmount);
        const roundOff = r2(row.roundOff);
        const cn = cnByInvoice[String(billId)] || 0;
        return Math.max(0, r2(outstanding - bank - roundOff - cn));
    };
    const cnUsedTotal = useMemo(
        () => Object.values(cnByInvoice).reduce((s, v) => s + v, 0),
        [cnByInvoice],
    );
    const unallocatedBank = Math.max(0, r2(amountToAdjust) - bankAllocated);
    const totalBillsSettled = r2(bankAllocated + discountTotal + roundOffTotal + cnUsedTotal);

    const patchRow = (billId, patch) => {
        setRows((prev) => ({
            ...prev,
            [String(billId)]: { ...prev[String(billId)], ...patch },
        }));
    };

    const toggleSelect = (bill) => {
        const id = String(bill._id);
        const row = rows[id] || {};
        if (row.selected) {
            patchRow(id, {
                selected: false,
                bankAmount: '',
                discount: '',
                roundOff: '',
                discountError: '',
                discountLedgerId: '',
                discountReason: '',
            });
            return;
        }
        const outstanding = billOutstanding(bill, mode);
        // Default suggestion only — user can edit freely afterward
        const suggested = Math.min(unallocatedBank, outstanding);
        patchRow(id, {
            selected: true,
            bankAmount: suggested > 0 ? String(suggested) : '',
        });
    };

    const setBankAmount = (bill, raw) => {
        const id = String(bill._id);
        const outstanding = billOutstanding(bill, mode);
        let val = raw === '' ? '' : String(raw);
        const num = r2(val);
        if (val !== '' && num > outstanding + 0.01) {
            toast.error(`Bank amount cannot exceed outstanding ₹${fmt(outstanding)}`);
            val = String(outstanding);
        }
        const nextBank = val;
        const maxDisc = shortAmountFor(id, { bankAmount: nextBank });
        const curDisc = r2(rows[id]?.discount);
        const patch = { selected: true, bankAmount: val, discountError: '' };
        if (curDisc > maxDisc + 0.01) {
            patch.discount = maxDisc > 0 ? String(maxDisc) : '';
            patch.discountError = maxDisc > 0
                ? `Discount cannot exceed remaining balance of ₹${fmt(maxDisc)}.`
                : '';
        }
        patchRow(id, patch);
    };

    const setDiscountAmount = (bill, raw) => {
        const id = String(bill._id);
        if (raw === '') {
            patchRow(id, { selected: true, discount: '', discountError: '' });
            return;
        }
        let num = Number(raw);
        if (Number.isNaN(num) || num < 0) {
            patchRow(id, {
                selected: true,
                discount: '0',
                discountError: 'Discount cannot be negative.',
            });
            return;
        }
        num = r2(num);
        const maxDisc = shortAmountFor(id);
        if (num > maxDisc + 0.01) {
            patchRow(id, {
                selected: true,
                discount: String(maxDisc),
                discountError: `Discount cannot exceed remaining balance of ₹${fmt(maxDisc)}.`,
            });
            return;
        }
        patchRow(id, {
            selected: true,
            discount: String(raw),
            discountError: '',
            discountLedgerId: rows[id]?.discountLedgerId || defaultDiscountLedgerId || '',
            discountReason: rows[id]?.discountReason || rows[id]?.remarks || 'Bill adjustment discount',
        });
    };

    const openDiscountModal = (bill) => {
        const id = String(bill._id);
        const row = rows[id] || {};
        const shortAmt = shortAmountFor(id);
        const typed = row.discount !== '' && row.discount != null ? String(row.discount) : '';
        setDiscDraft({
            shortAmount: String(shortAmt),
            // Prefill from column — do not force user to re-enter
            discountAmount: typed !== '' ? typed : (shortAmt > 0 ? String(shortAmt) : ''),
            discountLedgerId: row.discountLedgerId || discountLedgers[0]?._id || '',
            reason: row.discountReason || row.remarks || '',
        });
        setDiscountModalBillId(id);
        if (!row.selected) patchRow(id, { selected: true });
    };

    const applyDiscountModal = () => {
        const id = discountModalBillId;
        if (!id) return;
        const bill = bills.find((b) => String(b._id) === id);
        if (!bill) return;
        const discount = r2(discDraft.discountAmount);
        if (discount < 0) {
            toast.error('Discount cannot be negative');
            return;
        }
        if (discount > 0 && !String(discDraft.discountLedgerId || '').trim()) {
            toast.error('Select a Discount Ledger');
            return;
        }
        if (discount > 0 && !String(discDraft.reason || '').trim()) {
            toast.error('Reason is required for discount');
            return;
        }
        const maxDisc = shortAmountFor(id);
        if (discount > maxDisc + 0.01) {
            toast.error(`Discount cannot exceed remaining balance of ₹${fmt(maxDisc)}.`);
            return;
        }
        const ledgerOk = (ledgers || []).some((l) => String(l._id) === String(discDraft.discountLedgerId));
        if (discount > 0 && !ledgerOk) {
            toast.error('Discount Ledger must be a valid active company ledger');
            return;
        }
        const row = rows[id] || {};
        patchRow(id, {
            selected: true,
            discount: discount > 0 ? String(discount) : '',
            discountLedgerId: discDraft.discountLedgerId || '',
            discountReason: discDraft.reason || '',
            remarks: discDraft.reason || row.remarks || '',
            discountError: '',
        });
        setDiscountModalBillId(null);
    };

    const autoAllocateFifo = () => {
        let remaining = r2(amountToAdjust);
        const next = { ...rows };
        for (const bill of bills) {
            const id = String(bill._id);
            const outstanding = billOutstanding(bill, mode);
            if (remaining <= 0.009) {
                next[id] = {
                    ...(next[id] || {}),
                    selected: false,
                    bankAmount: '',
                    discount: '',
                    roundOff: '',
                    discountError: '',
                };
                continue;
            }
            const take = Math.min(remaining, outstanding);
            next[id] = {
                ...(next[id] || {}),
                selected: take > 0,
                bankAmount: take > 0 ? String(take) : '',
                discount: next[id]?.discount || '',
                roundOff: next[id]?.roundOff || '',
                remarks: next[id]?.remarks || '',
                discountLedgerId: next[id]?.discountLedgerId || '',
                discountReason: next[id]?.discountReason || '',
                discountError: '',
            };
            remaining = r2(remaining - take);
        }
        setRows(next);
        toast.success('FIFO preview applied — edit amounts as needed');
    };

    const handleConfirm = () => {
        const adjustments = [];
        for (const bill of bills) {
            const id = String(bill._id);
            let row = rows[id];
            if (!row?.selected) continue;
            row = ensureDiscountDefaults(row);
            const bank = r2(row.bankAmount);
            const discount = r2(row.discount);
            const roundOff = r2(row.roundOff);
            const outstanding = billOutstanding(bill, mode);
            const cn = cnByInvoice[id] || 0;
            const totalSettle = r2(bank + discount + roundOff + cn);
            if (totalSettle > outstanding + 0.01) {
                toast.error(`${bill.invoiceNumber}: settlement exceeds outstanding`);
                return;
            }
            if (bank <= 0 && discount <= 0 && Math.abs(roundOff) < 0.005) {
                toast.error(`${bill.invoiceNumber}: enter Bank Amount or Discount`);
                return;
            }
            if (discount > 0.009) {
                const reason = String(row.discountReason || row.remarks || '').trim();
                const ledgerIdSel = String(row.discountLedgerId || '').trim();
                const ledgerOk = (ledgers || []).some((l) => String(l._id) === ledgerIdSel);
                if (!ledgerIdSel || !ledgerOk) {
                    toast.error(
                        `${bill.invoiceNumber}: Select Discount ledger via Apply Discount before confirming.`,
                    );
                    openDiscountModal(bill);
                    return;
                }
                if (!reason) {
                    toast.error(`${bill.invoiceNumber}: Discount reason is required.`);
                    openDiscountModal(bill);
                    return;
                }
                // Persist defaults back into row state for subsequent opens
                patchRow(id, {
                    discountLedgerId: ledgerIdSel,
                    discountReason: reason,
                    remarks: row.remarks || reason,
                });
            }
            if (bank > 0) {
                adjustments.push({
                    refId: bill._id,
                    refNumber: bill.invoiceNumber,
                    amount: bank,
                    adjustmentType: 'Against Bill',
                    refModel,
                    discountAmount: discount,
                    roundOff,
                    remarks: row.remarks || row.discountReason || '',
                    discountLedgerId: discount > 0.009 ? row.discountLedgerId : undefined,
                    discountReason: discount > 0.009 ? (row.discountReason || row.remarks || '') : '',
                    settlementStatus: settlementStatus({
                        selected: true,
                        bank: bank + cn,
                        discount,
                        roundOff,
                        outstanding,
                    }),
                });
            } else if (discount > 0 || Math.abs(roundOff) > 0.005) {
                toast.error(
                    `${bill.invoiceNumber}: enter Bank Amount (discount alone does not post without bank in this voucher path).`,
                );
                return;
            }
        }

        if (bankAllocated > r2(amountToAdjust) + 0.01) {
            toast.error('Bank amount allocated cannot exceed receipt/payment amount');
            return;
        }

        const cnLines = [];
        if (isReceipt) {
            for (const cn of availableCNs) {
                const amt = Number(cnUseAmounts[cn._id]) || 0;
                if (!(amt > 0)) continue;
                if (!canUseCreditNote) {
                    toast.error('Permission denied: accounts.bill_adjustment.use_credit_note');
                    return;
                }
                const invId = cnTargetInvoice[cn._id];
                if (!invId) {
                    toast.error(`Select a Sales Invoice target for Credit Note ${cn.noteNumber}`);
                    return;
                }
                if (amt > Number(cn.availableBalance || 0) + 0.01) {
                    toast.error(`Credit Note ${cn.noteNumber}: amount exceeds available balance`);
                    return;
                }
                cnLines.push({ creditNoteId: cn._id, salesInvoiceId: invId, amount: amt });
            }
        }

        // Per-invoice: bank + discount + roundOff + CN ≤ outstanding
        for (const bill of bills) {
            const id = String(bill._id);
            const row = rows[id];
            const bank = row?.selected ? r2(row.bankAmount) : 0;
            const discount = row?.selected ? r2(row.discount) : 0;
            const roundOff = row?.selected ? r2(row.roundOff) : 0;
            const cn = cnByInvoice[id] || 0;
            const used = r2(bank + discount + roundOff + cn);
            const outstanding = billOutstanding(bill, mode);
            if (used > outstanding + 0.01) {
                toast.error(
                    `Settlement for ${bill.invoiceNumber} (₹${fmt(used)}) exceeds outstanding ₹${fmt(outstanding)}`,
                );
                return;
            }
        }

        const finalAdjustments = [...adjustments];
        if (bankAllocated < r2(amountToAdjust) - 0.009) {
            finalAdjustments.push({
                adjustmentType: 'On Account',
                amount: r2(r2(amountToAdjust) - bankAllocated),
            });
        }

        onConfirm({ adjustments: finalAdjustments, creditNoteAllocations: cnLines });
    };

    const th = {
        padding: '8px 10px',
        fontSize: 10,
        fontWeight: 800,
        textTransform: 'uppercase',
        color: '#64748b',
        whiteSpace: 'nowrap',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 1,
    };
    const td = { padding: '8px 10px', fontSize: 12, whiteSpace: 'nowrap', verticalAlign: 'middle' };
    const inp = {
        width: 88,
        padding: '4px 6px',
        border: '1px solid #cbd5e1',
        borderRadius: 6,
        textAlign: 'right',
        fontSize: 12,
    };

    const discountBill = bills.find((b) => String(b._id) === String(discountModalBillId));

    return (
        <div className="space-y-4 pt-2" style={{ maxWidth: '100%' }}>
            {/* C. Summary totals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm bg-primary/5 p-3 rounded-lg border border-primary/20">
                <div>
                    Actual {isReceipt ? 'Bank Receipt' : 'Bank Payment'}:{' '}
                    <span className="font-bold text-primary">₹{fmt(amountToAdjust)}</span>
                </div>
                <div>
                    Bank Amount Allocated: <span className="font-bold text-green-700">₹{fmt(bankAllocated)}</span>
                </div>
                {isReceipt && (
                    <div>
                        Customer Credit Note Used:{' '}
                        <span className="font-bold text-purple-700">₹{fmt(cnUsedTotal)}</span>
                    </div>
                )}
                <div>
                    Unallocated Bank Amount: <span className="font-bold">₹{fmt(unallocatedBank)}</span>
                </div>
                <div>
                    {discountLabel}: <span className="font-medium">₹{fmt(discountTotal)}</span>
                </div>
                <div>
                    Round-off: <span className="font-medium">₹{fmt(roundOffTotal)}</span>
                </div>
                <div className="col-span-2">
                    Total Bills Settled: <span className="font-bold">₹{fmt(totalBillsSettled)}</span>
                    {isReceipt && (
                        <span className="text-xs text-gray-500"> (bank + discount + round-off + CN; CN not in bank total)</span>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
                <Button type="button" variant="outline" onClick={autoAllocateFifo}>
                    Auto Allocate FIFO (optional)
                </Button>
                <span className="text-xs text-gray-500">
                    Type Bank Amount per invoice. Checkbox does not lock amounts.
                </span>
            </div>

            {/* A. Bill allocation grid */}
            <div className="border rounded-lg bg-white" style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="text-left border-collapse" style={{ minWidth: 1100, width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={th}>Select</th>
                            <th style={th}>Invoice #</th>
                            <th style={th}>Date</th>
                            <th style={{ ...th, textAlign: 'right' }}>Outstanding</th>
                            <th style={{ ...th, textAlign: 'right' }}>Bank Amount to Adjust</th>
                            <th style={{ ...th, textAlign: 'right' }}>{discountLabel}</th>
                            <th style={{ ...th, textAlign: 'right' }}>Round-off</th>
                            <th style={{ ...th, textAlign: 'right' }}>Total Settlement</th>
                            <th style={{ ...th, textAlign: 'right' }}>Balance After</th>
                            <th style={th}>Status</th>
                            <th style={th}>Remarks / Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {bills.map((bill) => {
                            const id = String(bill._id);
                            const row = rows[id] || {
                                selected: false,
                                bankAmount: '',
                                discount: '',
                                roundOff: '',
                                remarks: '',
                                discountError: '',
                            };
                            const outstanding = billOutstanding(bill, mode);
                            const bank = row.selected ? r2(row.bankAmount) : 0;
                            const discount = row.selected ? r2(row.discount) : 0;
                            const roundOff = row.selected ? r2(row.roundOff) : 0;
                            const cn = cnByInvoice[id] || 0;
                            const totalSettle = r2(bank + discount + roundOff + cn);
                            const balanceAfter = Math.max(0, r2(outstanding - totalSettle));
                            const status = settlementStatus({
                                selected: row.selected || bank > 0 || discount > 0,
                                bank: bank + cn,
                                discount,
                                roundOff,
                                outstanding,
                            });
                            return (
                                <tr
                                    key={id}
                                    style={{
                                        background: row.selected ? '#f0f9ff' : undefined,
                                        borderBottom: '1px solid #f1f5f9',
                                    }}
                                >
                                    <td style={td}>
                                        <input
                                            type="checkbox"
                                            checked={!!row.selected}
                                            onChange={() => toggleSelect(bill)}
                                        />
                                    </td>
                                    <td style={{ ...td, fontWeight: 600 }}>{bill.invoiceNumber}</td>
                                    <td style={td}>
                                        {bill.invoiceDate
                                            ? new Date(bill.invoiceDate).toLocaleDateString('en-IN')
                                            : '—'}
                                    </td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                                        ₹{fmt(outstanding)}
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            style={inp}
                                            value={row.bankAmount}
                                            placeholder="0.00"
                                            onChange={(e) => setBankAmount(bill, e.target.value)}
                                            onFocus={() => {
                                                if (!row.selected) patchRow(id, { selected: true });
                                            }}
                                        />
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            style={inp}
                                            value={row.discount}
                                            placeholder="0.00"
                                            title={row.discountError || discountLabel}
                                            onChange={(e) => setDiscountAmount(bill, e.target.value)}
                                            onFocus={() => {
                                                if (!row.selected) patchRow(id, { selected: true });
                                            }}
                                        />
                                        {row.discountError ? (
                                            <div style={{ fontSize: 10, color: '#b91c1c', maxWidth: 120, whiteSpace: 'normal', marginTop: 2 }}>
                                                {row.discountError}
                                            </div>
                                        ) : null}
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>
                                        <input
                                            type="number"
                                            step="0.01"
                                            style={{ ...inp, width: 72 }}
                                            value={row.roundOff}
                                            placeholder="0"
                                            onChange={(e) => {
                                                const maxDisc = shortAmountFor(id, { roundOff: e.target.value });
                                                const curDisc = r2(rows[id]?.discount);
                                                const patch = {
                                                    selected: true,
                                                    roundOff: e.target.value,
                                                    discountError: '',
                                                };
                                                if (curDisc > maxDisc + 0.01) {
                                                    patch.discount = maxDisc > 0 ? String(maxDisc) : '';
                                                    patch.discountError = `Discount cannot exceed remaining balance of ₹${fmt(maxDisc)}.`;
                                                }
                                                patchRow(id, patch);
                                            }}
                                            onFocus={() => {
                                                if (!row.selected) patchRow(id, { selected: true });
                                            }}
                                        />
                                    </td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>
                                        ₹{fmt(totalSettle)}
                                    </td>
                                    <td style={{ ...td, textAlign: 'right' }}>₹{fmt(balanceAfter)}</td>
                                    <td style={td}>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color:
                                                    status === 'Settled with Discount' || status === 'Settled'
                                                        ? '#166534'
                                                        : status === 'Over-allocated'
                                                            ? '#b91c1c'
                                                            : '#475569',
                                            }}
                                        >
                                            {status}
                                        </span>
                                    </td>
                                    <td style={td}>
                                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                            <input
                                                type="text"
                                                style={{
                                                    ...inp,
                                                    width: 100,
                                                    textAlign: 'left',
                                                }}
                                                placeholder="Remarks"
                                                value={row.remarks || ''}
                                                onChange={(e) =>
                                                    patchRow(id, {
                                                        selected: true,
                                                        remarks: e.target.value,
                                                    })
                                                }
                                            />
                                            <button
                                                type="button"
                                                onClick={() => openDiscountModal(bill)}
                                                style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    padding: '4px 8px',
                                                    borderRadius: 6,
                                                    border: '1px solid #fcd34d',
                                                    background: '#fffbeb',
                                                    color: '#b45309',
                                                    cursor: 'pointer',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {applyDiscountLabel}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {bills.length === 0 && !loading && (
                    <div className="p-10 text-center text-gray-400">
                        {isReceipt ? 'No outstanding invoices' : 'No outstanding purchase invoices found.'}
                    </div>
                )}
            </div>

            {/* B. Available Customer Credit Notes (receipt only) */}
            {isReceipt && (canViewNoteBalance || canUseCreditNote) && (
                <div className="border rounded-lg border-purple-200 bg-purple-50/40 p-3">
                    <h4 className="text-xs font-bold uppercase text-purple-900 mb-2">
                        AVAILABLE CUSTOMER CREDIT NOTES
                    </h4>
                    {cnLoading ? (
                        <div className="text-sm text-gray-500">Loading…</div>
                    ) : (
                        <div className="max-h-[180px] overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b text-xs uppercase text-gray-500">
                                        <th className="py-1 pr-2">CN #</th>
                                        <th className="py-1 pr-2">Date</th>
                                        <th className="py-1 pr-2 text-right">Original</th>
                                        <th className="py-1 pr-2 text-right">Applied</th>
                                        <th className="py-1 pr-2 text-right">Available</th>
                                        <th className="py-1 pr-2">Apply to Invoice</th>
                                        <th className="py-1 pr-2 text-right">Amount to Use</th>
                                        <th className="py-1 text-right">Remaining</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {availableCNs.length === 0 ? (
                                        <tr>
                                            <td colSpan={8} className="py-3 text-gray-400">
                                                No Final Credit Notes with available balance
                                            </td>
                                        </tr>
                                    ) : (
                                        availableCNs.map((cn) => {
                                            const useAmt = Number(cnUseAmounts[cn._id]) || 0;
                                            const rem = Math.max(0, Number(cn.availableBalance || 0) - useAmt);
                                            return (
                                                <tr key={cn._id} className="border-b border-purple-100">
                                                    <td className="py-1 pr-2 font-semibold">{cn.noteNumber}</td>
                                                    <td className="py-1 pr-2">
                                                        {cn.noteDate
                                                            ? new Date(cn.noteDate).toLocaleDateString('en-IN')
                                                            : '—'}
                                                    </td>
                                                    <td className="py-1 pr-2 text-right">
                                                        ₹{fmt(cn.originalAmount)}
                                                    </td>
                                                    <td className="py-1 pr-2 text-right">
                                                        ₹{fmt(cn.appliedAmount)}
                                                    </td>
                                                    <td className="py-1 pr-2 text-right font-semibold text-purple-800">
                                                        ₹{fmt(cn.availableBalance)}
                                                    </td>
                                                    <td className="py-1 pr-2">
                                                        <select
                                                            className="border rounded px-1 py-0.5 text-xs max-w-[140px]"
                                                            disabled={!canUseCreditNote}
                                                            value={cnTargetInvoice[cn._id] || ''}
                                                            onChange={(e) =>
                                                                setCnTargetInvoice((p) => ({
                                                                    ...p,
                                                                    [cn._id]: e.target.value,
                                                                }))
                                                            }
                                                        >
                                                            <option value="">— select SI —</option>
                                                            {bills.map((b) => (
                                                                <option key={b._id} value={b._id}>
                                                                    {b.invoiceNumber}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="py-1 pr-2 text-right">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            disabled={!canUseCreditNote}
                                                            className="border rounded px-1 py-0.5 w-24 text-right"
                                                            value={cnUseAmounts[cn._id] ?? ''}
                                                            onChange={(e) =>
                                                                setCnUseAmounts((p) => ({
                                                                    ...p,
                                                                    [cn._id]: e.target.value,
                                                                }))
                                                            }
                                                        />
                                                    </td>
                                                    <td className="py-1 text-right">₹{fmt(rem)}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={onCancel}>
                    Cancel
                </Button>
                <Button onClick={handleConfirm}>Confirm Adjustments</Button>
            </div>

            {/* Discount modal */}
            {discountModalBillId && discountBill && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.45)',
                        zIndex: 80,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16,
                    }}
                >
                    <div
                        style={{
                            background: '#fff',
                            borderRadius: 12,
                            width: '100%',
                            maxWidth: 420,
                            padding: 20,
                            boxShadow: '0 20px 50px rgba(0,0,0,0.2)',
                        }}
                    >
                        <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800 }}>
                            {applyDiscountLabel}
                        </h3>
                        <p style={{ margin: '0 0 14px', fontSize: 12, color: '#64748b' }}>
                            {discountBill.invoiceNumber} · Outstanding ₹
                            {fmt(billOutstanding(discountBill, mode))}
                        </p>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                            Short Amount
                        </label>
                        <input
                            type="number"
                            step="0.01"
                            value={discDraft.shortAmount}
                            onChange={(e) => setDiscDraft((p) => ({ ...p, shortAmount: e.target.value }))}
                            style={{ ...inp, width: '100%', textAlign: 'left', marginBottom: 10 }}
                            readOnly
                        />
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                            Discount Amount *
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={discDraft.discountAmount}
                            onChange={(e) =>
                                setDiscDraft((p) => ({ ...p, discountAmount: e.target.value }))
                            }
                            style={{ ...inp, width: '100%', textAlign: 'left', marginBottom: 10 }}
                        />
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>
                            Discount Ledger
                        </label>
                        <select
                            value={discDraft.discountLedgerId}
                            onChange={(e) =>
                                setDiscDraft((p) => ({ ...p, discountLedgerId: e.target.value }))
                            }
                            style={{
                                width: '100%',
                                padding: '6px 8px',
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                                marginBottom: 10,
                                fontSize: 13,
                            }}
                        >
                            <option value="">— Select ledger —</option>
                            {(discountLedgers.length ? discountLedgers : ledgers).map((l) => (
                                <option key={l._id} value={l._id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>
                        <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>Reason</label>
                        <textarea
                            value={discDraft.reason}
                            onChange={(e) => setDiscDraft((p) => ({ ...p, reason: e.target.value }))}
                            rows={2}
                            style={{
                                width: '100%',
                                padding: 8,
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                                marginBottom: 14,
                                fontSize: 13,
                            }}
                        />
                        <p style={{ fontSize: 11, color: '#64748b', marginBottom: 12 }}>
                            Bill settles only when Bank + Discount + Round-off = Outstanding. Partial is allowed.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                            <Button variant="outline" onClick={() => setDiscountModalBillId(null)}>
                                Cancel
                            </Button>
                            <Button onClick={applyDiscountModal}>Apply</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
