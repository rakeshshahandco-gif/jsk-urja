import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect, BrandedLoader
} from '@/components/ui';
import { BrandedModuleLoader } from '@/components/ui/BrandedLoading/BrandedModuleLoader';
import { Plus, Trash2, Save, Layers, AlertTriangle, AlertCircle } from 'lucide-react';
import {
    getVoucherTypes, getCashBankAccounts, getLedgers, getAccountGroups,
    createVoucher, createLedger, getVoucher, updateVoucher,
    autoLinkSingleLedger
} from '@/services/accountApi';
import BillAdjustmentPopup from './components/BillAdjustmentPopup';
import LedgerForm from './components/LedgerForm';
import { toast } from 'react-hot-toast';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useCompany } from '@/contexts/CompanyContext';
import VoucherEntryTallyLayout from './components/voucherEntryTally';
import { useAuth } from '@/hooks/useAuth';
import {
    coerceInstrumentForAccount,
    defaultInstrumentForAccount,
    getInstrumentOptionsForAccount,
    getInstrumentRefMeta,
    validateInstrumentForAccount,
} from './utils/cashBankInstrument';

function getLoadErrorMessage(err, fallback = 'Failed to load initial data') {
    return err?.response?.data?.message || err?.message || fallback;
}

/** Only allow internal Sales Invoice routes as post-save / cancel destinations. */
function resolveSafeSalesReturnPath(candidate, fallback) {
    if (!candidate || typeof candidate !== 'string') return fallback;
    const raw = candidate.trim();
    if (!raw.startsWith('/') || raw.startsWith('//') || /:\/\//.test(raw)) return fallback;
    const pathOnly = raw.split('?')[0].split('#')[0];
    if (pathOnly === '/sales/invoices' || pathOnly.startsWith('/sales/invoices/')) {
        return pathOnly;
    }
    return fallback;
}

/** Prefer a real Receipt series; never default to a Journal-named type. */
function pickDefaultReceiptVoucherType(types = []) {
    const list = (Array.isArray(types) ? types : []).filter((t) => t && t._id);
    if (!list.length) return null;

    const norm = (t) => String(t.name || '').trim().toUpperCase().replace(/\s+/g, ' ');
    const isJournalNamed = (t) => {
        const n = norm(t);
        return n === 'JOURNAL' || n === 'JRNL' || n.startsWith('JOURNAL ');
    };
    const isReceiptNamed = (t) => {
        const n = norm(t);
        if (isJournalNamed(t)) return false;
        return (
            n === 'RECEIPT VOUCHER'
            || n === 'RECEIPT'
            || n === 'RCPT'
            || n === 'RECEIOT VOUCHER' // legacy misspelling
            || /^RECEIPT\b/.test(n)
            || /^RCPT\b/.test(n)
        );
    };

    const exact = list.find((t) => norm(t) === 'RECEIPT VOUCHER');
    if (exact) return exact;

    const receiptNamed = list.find(isReceiptNamed);
    if (receiptNamed) return receiptNamed;

    const nonJournal = list.find((t) => !isJournalNamed(t));
    return nonJournal || null;
}

function sortReceiptVoucherTypesForDisplay(types = []) {
    const preferredId = pickDefaultReceiptVoucherType(types)?._id;
    return [...(Array.isArray(types) ? types : [])].sort((a, b) => {
        if (preferredId && String(a._id) === String(preferredId)) return -1;
        if (preferredId && String(b._id) === String(preferredId)) return 1;
        const aJ = /^JOURNAL|^JRNL$/i.test(String(a.name || '').trim());
        const bJ = /^JOURNAL|^JRNL$/i.test(String(b.name || '').trim());
        if (aJ !== bJ) return aJ ? 1 : -1;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
}

const inp = { padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 7, fontSize: 13, width: '100%', boxSizing: 'border-box', outline: 'none', background: '#fff', color: '#374151' };

const ReceiptEntryPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { openModal, closeModal } = useModal();
    const { hasRole, hasPermission } = useAuth();
    const isAdmin = hasRole('admin') || hasRole('superadmin');
    const canUseCreditNote = isAdmin || hasPermission('accounts.bill_adjustment.use_credit_note');
    const canViewNoteBalance = isAdmin || hasPermission('accounts.bill_adjustment.view_note_balance');

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [cashBankAccounts, setCashBankAccounts] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { id } = useParams();
    const isEdit = !!id;
    const { selectedCompany, loading: companyLoading } = useCompany();
    const [pendingCreditNoteAllocations, setPendingCreditNoteAllocations] = useState([]);
    /** Direct Sales Invoice receive screen — Discount Allowed (persisted onto adjustments). */
    const [directDiscount, setDirectDiscount] = useState('');
    const [directDiscountReason, setDirectDiscountReason] = useState('Bill adjustment discount');
    const [directDiscountLedgerId, setDirectDiscountLedgerId] = useState('');
    /** Refs so Save never posts a stale bank-only payload if React state lags behind the inputs. */
    const directDiscountRef = useRef('');
    const directDiscountReasonRef = useRef('Bill adjustment discount');
    const directDiscountLedgerIdRef = useRef('');

    const INITIAL_FORM_STATE = {
        voucherTypeId: '',
        date: new Date().toISOString().split('T')[0],
        cashBankAccountId: '',
        paymentMode: 'Cash/Bank', // 'Cash/Bank' or 'Adjustment'
        totalAmount: 0,
        narration: '',
        instrumentType: '',
        instrumentNo: '',
        items: [
            { 
                id: Date.now(), 
                ledgerId: '', 
                ledgerName: '', 
                amount: 0, 
                type: 'Credit', 
                narration: '', 
                adjustments: []
            }
        ]
    };

    const [formData, setFormData] = useState(INITIAL_FORM_STATE);

    // Detect if launched from a Sales Invoice
    const fromSalesInvoice = location.state?.source === 'sales_invoice' && !!location.state?.invoiceId;
    const fromInvoice = fromSalesInvoice || !!(location.state?.invoiceId);
    const salesRegisterPath = PATHS.SALES.INVOICES;
    const salesCancelPath = resolveSafeSalesReturnPath(
        location.state?.cancelTo,
        location.state?.invoiceId
            ? PATHS.SALES.INVOICE_DETAIL(location.state.invoiceId)
            : salesRegisterPath,
    );
    const salesReturnPath = resolveSafeSalesReturnPath(location.state?.returnTo, salesRegisterPath);

    const discountAllowedLedgers = useMemo(() => {
        const preferred = (ledgers || []).filter((l) =>
            /discount\s*allowed|discount\s*on\s*sales|sales\s*discount|^discount$/i.test(String(l.name || '').trim()),
        );
        return preferred.length ? preferred : (ledgers || []).filter((l) => /discount/i.test(l.name || ''));
    }, [ledgers]);

    useEffect(() => {
        if (!fromInvoice) return;
        if (directDiscountLedgerId) return;
        if (discountAllowedLedgers[0]?._id) {
            const idStr = String(discountAllowedLedgers[0]._id);
            directDiscountLedgerIdRef.current = idStr;
            setDirectDiscountLedgerId(idStr);
        }
    }, [fromInvoice, discountAllowedLedgers, directDiscountLedgerId]);

    const syncDirectInvoiceAdjustment = useCallback((bankAmt, discountAmt, reason, ledgerId) => {
        const invoiceId = location.state?.invoiceId;
        const invoiceNo = location.state?.invoiceNumber;
        if (!invoiceId) return;
        const bank = Math.max(0, Math.round((Number(bankAmt) || 0) * 100) / 100);
        const disc = Math.max(0, Math.round((Number(discountAmt) || 0) * 100) / 100);
        const reasonStr = String(reason || 'Bill adjustment discount').trim();
        const ledgerStr = ledgerId ? String(ledgerId) : '';
        directDiscountRef.current = disc > 0.009 ? String(disc) : '';
        directDiscountReasonRef.current = reasonStr;
        if (ledgerStr) directDiscountLedgerIdRef.current = ledgerStr;
        setFormData((prev) => {
            const newItems = [...prev.items];
            if (!newItems[0]) return prev;
            newItems[0] = {
                ...newItems[0],
                amount: bank,
                adjustments: [{
                    refId: invoiceId,
                    refNumber: invoiceNo,
                    amount: bank,
                    adjustmentType: 'Against Bill',
                    refModel: 'SalesInvoice',
                    discountAmount: disc,
                    discountLedgerId: disc > 0.009 ? (ledgerStr || undefined) : undefined,
                    discountReason: disc > 0.009 ? reasonStr : '',
                    remarks: disc > 0.009 ? reasonStr : '',
                }],
            };
            return { ...prev, totalAmount: bank, items: newItems };
        });
    }, [location.state?.invoiceId, location.state?.invoiceNumber]);

    useEffect(() => {
        if (companyLoading) return;

        if (!selectedCompany?._id) {
            setLoading(false);
            toast.error('Please select a company using the switcher in the header.');
            return;
        }

        let cancelled = false;

        const fetchData = async () => {
            setLoading(true);
            try {
                const [vTypes, cbAccs, allLedgers, allGroups] = await Promise.all([
                    getVoucherTypes({ nature: 'Receipt', active: 'true' }),
                    getCashBankAccounts({ status: 'Active' }),
                    getLedgers(),
                    getAccountGroups(),
                ]);

                if (cancelled) return;

                const types = Array.isArray(vTypes) ? vTypes : [];
                const cb = Array.isArray(cbAccs) ? cbAccs : [];
                const ledgerList = Array.isArray(allLedgers) ? allLedgers : [];
                const groupList = Array.isArray(allGroups) ? allGroups : [];

                setVoucherTypes(sortReceiptVoucherTypesForDisplay(types));
                setCashBankAccounts(cb);
                setLedgers(ledgerList);
                setGroups(groupList);

                if (isEdit && id) {
                    const response = await getVoucher(id);
                    if (!response) throw new Error('Voucher not found');
                    if (cancelled) return;

                    setFormData({
                        ...response,
                        date: response.date ? new Date(response.date).toISOString().split('T')[0] : '',
                        voucherTypeId: response.voucherType?._id || response.voucherType,
                        cashBankAccountId: response.cashBankAccountId?._id || response.cashBankAccountId,
                        items: (response.items || []).map((item) => ({
                            ...item,
                            id: item._id || Date.now() + Math.random(),
                            ledgerId: item.ledgerId?._id || item.ledgerId,
                            ledgerName: item.ledgerId?.name || item.ledgerName,
                        })),
                    });
                } else {
                    setFormData((prev) => {
                        const next = { ...prev };
                        const defaultType = pickDefaultReceiptVoucherType(types);
                        if (defaultType?._id) {
                            next.voucherTypeId = defaultType._id;
                        } else if (types.length > 1) {
                            next.voucherTypeId = '';
                            toast.error('Select a Receipt Voucher type (multiple Receipt series found).');
                        } else if (types[0]?._id) {
                            next.voucherTypeId = types[0]._id;
                        }
                        if (cb.length > 0 && !next.cashBankAccountId) {
                            next.cashBankAccountId = cb[0]._id;
                            next.instrumentType = defaultInstrumentForAccount(cb[0]);
                        } else if (next.cashBankAccountId) {
                            const acc = cb.find((a) => String(a._id) === String(next.cashBankAccountId));
                            next.instrumentType = coerceInstrumentForAccount(acc, next.instrumentType);
                        }
                        return next;
                    });
                }
            } catch (error) {
                console.error('FetchData Error:', error);
                if (!cancelled) {
                    const msg = getLoadErrorMessage(error);
                    toast.error(msg);
                    if (isEdit) {
                        navigate(PATHS.ACCOUNTS.VOUCHER_LIST);
                    }
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchData();
        return () => {
            cancelled = true;
        };
    }, [companyLoading, selectedCompany?._id, id, isEdit, navigate]);

    // Effect for handling incoming state (e.g. from Sales Invoice)
    useEffect(() => {
        if (!location.state?.invoiceId && !location.state?.customerId) return;

        const defaultAmount = location.state?.amount || 0;
        const defaultInvoiceNo = location.state?.invoiceNumber;
        const defaultInvoiceId = location.state?.invoiceId;
        const customerId = location.state?.customerId;
        const customerName = location.state?.customerName;

        // Try to find the correct ledger in our loaded list
        let targetLedgerId = location.state?.ledgerId || '';
        let targetLedgerName = location.state?.ledgerName || '';

        if (!targetLedgerId && ledgers.length > 0) {
            // Match by referenceId (CustomerId) and ensure it's a Customer ledger
            let matchedByRef = null;
            if (customerId) {
                matchedByRef = ledgers.find(l => 
                    l.referenceId?.toString() === customerId?.toString() && 
                    l.referenceModel === 'Customer'
                );
            }

            if (matchedByRef) {
                targetLedgerId = matchedByRef._id;
                targetLedgerName = matchedByRef.name;
            } else if (customerName) {
                // Match by name as secondary fallback - more flexible matching
                const cleanCustName = customerName.split('(')[0].trim().toLowerCase();
                const matchedByName = ledgers.find(l => {
                    const cleanLedgerName = l.name?.split('(')[0].trim().toLowerCase();
                    return cleanLedgerName === cleanCustName || 
                           cleanLedgerName?.startsWith(cleanCustName) || 
                           cleanCustName.startsWith(cleanLedgerName || '');
                });

                if (matchedByName) {
                    targetLedgerId = matchedByName._id;
                    targetLedgerName = matchedByName.name;
                }
            }
        }

        if (fromInvoice && !targetLedgerId && ledgers.length > 0) {
            toast.error(`Accounting Ledger for "${customerName}" not found. Please ensure the customer is properly linked to a ledger.`, { duration: 5000 });
        }

        setFormData(prev => {
            const prevItem = prev.items?.[0];
            const prevAdj = prevItem?.adjustments?.[0];
            const alreadySeeded = !!(prevAdj?.refId && String(prevAdj.refId) === String(defaultInvoiceId));
            // Re-runs when ledgers load: only fill missing party ledger — never wipe bank/discount.
            if (alreadySeeded) {
                return {
                    ...prev,
                    paymentMode: location.state?.paymentMode || prev.paymentMode,
                    items: [{
                        ...prevItem,
                        ledgerId: targetLedgerId || prevItem.ledgerId,
                        ledgerName: targetLedgerName || prevItem.ledgerName,
                    }],
                };
            }
            return {
                ...prev,
                paymentMode: location.state?.paymentMode || prev.paymentMode,
                totalAmount: defaultAmount,
                narration: defaultInvoiceNo ? `Receipt against Sales Invoice ${defaultInvoiceNo}` : prev.narration,
                items: [{
                    ...prevItem,
                    ledgerId: targetLedgerId,
                    ledgerName: targetLedgerName,
                    amount: defaultAmount,
                    narration: defaultInvoiceNo ? `Against ${defaultInvoiceNo}` : prevItem?.narration,
                    adjustments: defaultInvoiceId ? [{
                        refId: defaultInvoiceId,
                        refNumber: defaultInvoiceNo,
                        amount: defaultAmount,
                        adjustmentType: 'Against Bill',
                        refModel: 'SalesInvoice',
                        discountAmount: 0,
                        discountLedgerId: undefined,
                        discountReason: '',
                    }] : [],
                }],
            };
        });
    }, [location.state, ledgers, fromInvoice]);

    useEffect(() => {
        if (!location.state?.tallyPrefill || !location.state?.ledgerId || !ledgers?.length) return;
        const { ledgerId, ledgerName, amount } = location.state;
        const name = ledgerName || ledgers.find((l) => String(l._id) === String(ledgerId))?.name || '';
        setFormData((prev) => ({
            ...prev,
            totalAmount: amount ?? prev.totalAmount,
            items: [{ ...prev.items[0], ledgerId, ledgerName: name, amount: amount ?? prev.items[0]?.amount ?? 0, type: 'Credit', adjustments: [] }],
        }));
    }, [location.state?.tallyPrefill, location.state?.ledgerId, location.state?.ledgerName, location.state?.amount, ledgers]);

    const tallyTransferContext = formData.items?.[0]?.ledgerId
        ? { ledgerId: formData.items[0].ledgerId, ledgerName: formData.items[0].ledgerName, amount: formData.totalAmount }
        : null;

    const handleHeaderChange = (e) => {
        const { name, value } = e.target;
        if (name === 'cashBankAccountId') {
            const acc = cashBankAccounts.find((a) => String(a._id) === String(value));
            setFormData((prev) => ({
                ...prev,
                cashBankAccountId: value,
                instrumentType: coerceInstrumentForAccount(acc, prev.instrumentType),
            }));
            return;
        }
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleItemChange = (id, field, value) => {
        setFormData(prev => {
            const newItems = prev.items.map(item => {
                if (item.id === id) {
                    const updated = { ...item, [field]: value };
                    if (field === 'ledgerId') {
                        const ledger = ledgers.find(l => l._id === value);
                        updated.ledgerName = ledger ? ledger.name : '';
                        updated.ledgerType = ledger ? ledger.type : 'General';
                        updated.adjustments = [];
                    }
                    return updated;
                }
                return item;
            });
            const total = newItems.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
            return { ...prev, items: newItems, totalAmount: total };
        });
    };

    const handleDiscard = (e) => {
        if (e) e.preventDefault();
        if (window.confirm('Discard changes and return to list?')) {
            window.location.href = '/accounts/vouchers';
        }
    };

    const handleFixAccountLedger = async (accountId) => {
        if (!accountId) return;
        setLoading(true);
        try {
            await autoLinkSingleLedger(accountId, 'CashBankAccount');
            toast.success('Ledger linked successfully');
            // Refresh accounts and ledgers
            const [cbAccs, allLedgers] = await Promise.all([
                getCashBankAccounts({ status: 'Active' }),
                getLedgers()
            ]);
            setCashBankAccounts(cbAccs);
            setLedgers(allLedgers);
        } catch (error) {
            toast.error('Failed to link ledger automatically');
        } finally {
            setLoading(false);
        }
    };

    const handleFixEntityLedger = async (entityId, entityType) => {
        if (!entityId) return;
        setLoading(true);
        try {
            await autoLinkSingleLedger(entityId, entityType);
            toast.success('Ledger linked successfully');
            // Refresh ledgers
            const allLedgers = await getLedgers();
            setLedgers(allLedgers);
        } catch (error) {
            toast.error('Failed to link ledger automatically');
        } finally {
            setLoading(false);
        }
    };

    const handleQuickCreateLedger = (searchTerm, targetItemId) => {
        const debtorGroup = groups.find(g => g.name === 'Sundry Debtors');
        
        openModal({
            title: `Quick Create Ledger: ${searchTerm}`,
            size: 'lg',
            content: (
                <LedgerForm 
                    initial={{ name: searchTerm, underGroup: debtorGroup?._id }}
                    groups={groups}
                    onCancel={closeModal}
                    onSave={async (data) => {
                        try {
                            const newLedger = await createLedger(data);
                            toast.success('Ledger created successfully');
                            
                            // Refresh lists
                            const [lData, cbData] = await Promise.all([
                                getLedgers(),
                                getCashBankAccounts({ status: 'Active' })
                            ]);
                            setLedgers(lData);
                            setCashBankAccounts(cbData);

                            // Select it
                            handleItemChange(targetItemId, 'ledgerId', newLedger._id);
                            closeModal();
                        } catch (err) {
                            toast.error(err.response?.data?.message || 'Failed to create ledger');
                        }
                    }}
                />
            )
        });
    };

    const LedgerLinkMissingAlert = ({ account }) => {
        if (!account || account.ledgerId) return null;
        return (
            <div style={{ marginTop: 12, padding: '12px 16px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={20} color="#f97316" />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, color: '#9a3412', fontWeight: 700 }}>Ledger Link Missing</span>
                        <span style={{ fontSize: 11, color: '#c2410c' }}>"{account.accountName}" needs an accounting ledger to save this entry.</span>
                    </div>
                </div>
                <button 
                    type="button"
                    onClick={() => handleFixAccountLedger(account._id)}
                    style={{ padding: '7px 14px', background: '#f97316', color: '#fff', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(249,115,22,0.3)' }}
                    onMouseOver={(e) => e.target.style.background = '#ea580c'}
                    onMouseOut={(e) => e.target.style.background = '#f97316'}
                >
                    Create & Link Ledger
                </button>
            </div>
        );
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Credit', narration: '', adjustments: [] }]
        }));
    };

    const removeItem = (id) => {
        if (formData.items.length === 1) return;
        setFormData(prev => {
            const newItems = prev.items.filter(item => item.id !== id);
            const total = newItems.reduce((sum, item) => sum + parseFloat(item.amount || 0), 0);
            return { ...prev, items: newItems, totalAmount: total };
        });
    };

    const handleOpenAdjustment = (item) => {
        if (!item.ledgerId || !item.amount) return toast.error('Set ledger and amount first');
        if (item.ledgerType !== 'Customer') {
            handleItemChange(item.id, 'adjustments', [{ adjustmentType: 'On Account', amount: item.amount }]);
            return toast.success('Non-customer ledger: Adjusted on account');
        }
        const ledger = ledgers.find((l) => String(l._id) === String(item.ledgerId));
        openModal({
            title: `Bill Adjustment - ${item.ledgerName}`,
            content: (
                <BillAdjustmentPopup
                    mode="receipt"
                    ledgerId={item.ledgerId}
                    amountToAdjust={item.amount}
                    customerId={ledger?.referenceId}
                    ledgers={ledgers}
                    canUseCreditNote={canUseCreditNote}
                    canViewNoteBalance={canViewNoteBalance}
                    onCancel={closeModal}
                    onConfirm={({ adjustments, creditNoteAllocations }) => {
                        handleItemChange(item.id, 'adjustments', adjustments);
                        setPendingCreditNoteAllocations(creditNoteAllocations || []);
                        closeModal();
                    }}
                />
            ),
            size: 'wide',
        });
    };

    const handleSave = async (shouldClose = false) => {
        if (isSubmitting) return;
        const isAdj = formData.paymentMode === 'Adjustment';
        if (!isAdj && !formData.cashBankAccountId) return toast.error('Select Cash/Bank account');
        if (formData.totalAmount <= 0) return toast.error('Entry amount must be greater than zero');

        if (!isAdj) {
            const selectedAcc = cashBankAccounts.find(a => a._id === formData.cashBankAccountId);
            if (selectedAcc && !selectedAcc.ledgerId) {
                return toast.error('Selected Cash/Bank account is not linked to an accounting ledger. Please fix it first.');
            }
            const instrumentErr = validateInstrumentForAccount(
                selectedAcc,
                formData.instrumentType,
                formData.instrumentNo,
                'receipt',
            );
            if (instrumentErr) return toast.error(instrumentErr);
        }

        if (!fromInvoice) {
            const invalidItem = formData.items.find(item => !item.ledgerId || item.amount <= 0);
            if (invalidItem) return toast.error('All items must have a ledger and amount');
        }

        const firstItem = formData.items[0];
        if (!firstItem?.ledgerId) return toast.error('Ledger selection required');

        if (!formData.voucherTypeId) {
            return toast.error('Select a Receipt Voucher type');
        }
        const selectedVType = voucherTypes.find((v) => String(v._id) === String(formData.voucherTypeId));
        if (selectedVType && String(selectedVType.nature || '') !== 'Receipt') {
            return toast.error(
                `Voucher type "${selectedVType.name}" is not a Receipt series. Select Receipt Voucher.`,
            );
        }
        if (selectedVType && /^JOURNAL$|^JRNL$/i.test(String(selectedVType.name || '').trim())) {
            return toast.error(
                'JOURNAL cannot be used from Receipt Entry. Select Receipt Voucher.',
            );
        }

        // Phase 1 — discount must be on adjustments before Save (popup Confirm must persist it)
        // Direct invoice receive rebuilds adjustments below from screen refs — skip formData check there.
        if (!fromInvoice) {
            for (const item of formData.items || []) {
                for (const adj of item.adjustments || []) {
                    if (adj.adjustmentType !== 'Against Bill') continue;
                    const disc = Number(adj.discountAmount) || 0;
                    if (disc > 0.009) {
                        if (!adj.discountLedgerId) {
                            return toast.error(
                                `Bill ${adj.refNumber || ''}: Discount ₹${disc} is missing Discount ledger. Open Bill Adjustment, enter discount, Confirm Adjustments again.`,
                            );
                        }
                        if (!String(adj.discountReason || adj.remarks || '').trim()) {
                            return toast.error(
                                `Bill ${adj.refNumber || ''}: Discount reason is required. Confirm Adjustments again.`,
                            );
                        }
                    }
                }
            }
        }

        setIsSubmitting(true);
        try {
            // Direct invoice receive: force discount fields from screen refs (never UI-only / never stale state)
            let saveForm = formData;
            if (fromInvoice && location.state?.invoiceId) {
                const bank = Math.max(0, Number(formData.totalAmount) || 0);
                const disc = Math.max(
                    0,
                    Number(directDiscountRef.current !== '' ? directDiscountRef.current : directDiscount) || 0,
                );
                const discLedgerId = String(
                    directDiscountLedgerIdRef.current || directDiscountLedgerId || '',
                ).trim();
                const discReason = String(
                    directDiscountReasonRef.current || directDiscountReason || 'Bill adjustment discount',
                ).trim();
                const outstanding = Math.max(0, Number(location.state?.amount) || 0);
                if (bank + disc > outstanding + 0.01) {
                    setIsSubmitting(false);
                    return toast.error('Total settlement cannot exceed invoice outstanding');
                }
                if (disc > 0.009) {
                    if (!discLedgerId) {
                        setIsSubmitting(false);
                        return toast.error('Select Discount Allowed ledger');
                    }
                    if (!discReason) {
                        setIsSubmitting(false);
                        return toast.error('Discount reason is required');
                    }
                }
                const adj = [{
                    refId: location.state.invoiceId,
                    refNumber: location.state.invoiceNumber,
                    amount: bank,
                    adjustmentType: 'Against Bill',
                    refModel: 'SalesInvoice',
                    discountAmount: disc,
                    discountLedgerId: disc > 0.009 ? discLedgerId : undefined,
                    discountReason: disc > 0.009 ? discReason : '',
                    remarks: disc > 0.009 ? discReason : '',
                }];
                saveForm = {
                    ...formData,
                    totalAmount: bank,
                    partyId: formData.items[0]?.ledgerId || formData.partyId,
                    // Top-level mirror so backend can re-attach if nested fields are dropped
                    billDiscountAmount: disc,
                    billDiscountLedgerId: disc > 0.009 ? discLedgerId : undefined,
                    billDiscountReason: disc > 0.009 ? discReason : undefined,
                    items: [{
                        ...formData.items[0],
                        amount: bank,
                        adjustments: adj,
                    }],
                };
            }

            if (isEdit) {
                await updateVoucher(id, { 
                    ...saveForm, 
                    nature: 'Receipt',
                    partyId: saveForm.items[0]?.ledgerId || saveForm.partyId,
                    creditNoteAllocations: pendingCreditNoteAllocations,
                });
                toast.success(`Voucher updated successfully`);
                setPendingCreditNoteAllocations([]);
                navigate(PATHS.ACCOUNTS.VOUCHER_LIST);
            } else {
                let payload = {
                    ...saveForm,
                    partyId: saveForm.items[0]?.ledgerId || saveForm.partyId,
                    creditNoteAllocations: pendingCreditNoteAllocations,
                };
                
                if (isAdj) {
                    // Logic: To record an adjustment without double-counting the ledger balance,
                    // we create a zero-sum voucher:
                    // 1. Existing Credit items (the user entered these to adjust against bills)
                    // 2. Automated Debit item (the "source" of the adjustment - Opening Credit)
                    const custLedgerId = saveForm.items[0]?.ledgerId;
                    if (!custLedgerId) throw new Error('Customer ledger required for adjustment');

                    const adjItem = {
                        id: 'adj-source',
                        ledgerId: custLedgerId,
                        ledgerName: saveForm.items[0]?.ledgerName,
                        amount: saveForm.totalAmount,
                        type: 'Debit',
                        narration: 'Adjusted from Opening Credit/Advance',
                        adjustments: [{
                            adjustmentType: 'Opening Credit',
                            amount: saveForm.totalAmount,
                            refId: custLedgerId, // Link to self for audit
                            refNumber: 'Opening Balance'
                        }]
                    };
                    payload.items = [...saveForm.items, adjItem];
                }

                const response = await createVoucher({ 
                    ...payload, 
                    nature: isAdj ? 'Adjustment' : 'Receipt',
                    voucherType: formData.voucherTypeId 
                });
                const savedNo = response?.data?.voucherNo || response?.voucherNo || 'Voucher';
                setPendingCreditNoteAllocations([]);

                if (fromSalesInvoice) {
                    toast.success('Receipt saved successfully. Sales Invoice outstanding has been updated.');
                    navigate(salesReturnPath, {
                        replace: true,
                        state: {
                            refreshInvoices: true,
                            updatedInvoiceId: location.state?.invoiceId,
                            savedReceiptNo: savedNo,
                        },
                    });
                } else if (shouldClose) {
                    toast.success(`${savedNo} saved successfully`);
                    navigate(-1);
                } else {
                    toast.success(`${savedNo} saved successfully`);
                    // RESET FOR NEXT ENTRY (KEEP DATE/BANK) — force Receipt Voucher (never Journal)
                    const receiptTypeId = pickDefaultReceiptVoucherType(voucherTypes)?._id || formData.voucherTypeId;
                    setFormData(prev => {
                        const acc = cashBankAccounts.find((a) => String(a._id) === String(prev.cashBankAccountId));
                        return {
                        ...INITIAL_FORM_STATE,
                        voucherTypeId: receiptTypeId,
                        date: prev.date,
                        cashBankAccountId: prev.cashBankAccountId,
                        instrumentType: coerceInstrumentForAccount(acc, defaultInstrumentForAccount(acc) || prev.instrumentType),
                        items: [{ 
                            id: Date.now(), 
                            ledgerId: '', 
                            ledgerName: '', 
                            amount: 0, 
                            type: 'Credit', 
                            narration: '', 
                            adjustments: []
                        }]
                    };
                    });
                }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save receipt');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAndNew = () => handleSave(false);
    const handleSaveAndClose = () => handleSave(true);

    if (loading) return <BrandedModuleLoader />;

    // ── SIMPLIFIED VIEW when opened from Sales Invoice ──────────────────────
    if (fromInvoice) {
        const invNo = location.state?.invoiceNumber || '—';
        const custName = location.state?.customerName || formData.items[0]?.ledgerName || '—';
        const outstanding = Math.max(0, Number(location.state?.amount) || 0);
        const bankAmt = Math.max(0, Number(formData.totalAmount) || 0);
        const discAmt = Math.max(0, Number(directDiscount) || 0);
        const totalSettlement = Math.round((bankAmt + discAmt) * 100) / 100;
        const balanceAfter = Math.max(0, Math.round((outstanding - totalSettlement) * 100) / 100);
        const settlementStatus = totalSettlement <= 0.009
            ? 'Unallocated'
            : totalSettlement > outstanding + 0.01
                ? 'Over-allocated'
                : Math.abs(totalSettlement - outstanding) <= 0.01
                    ? (discAmt > 0.009 ? 'Settled with Discount' : 'Settled')
                    : 'Partially Settled';
        const selectedAccount = cashBankAccounts.find(a => a._id === formData.cashBankAccountId);
        const instrumentOptions = getInstrumentOptionsForAccount(selectedAccount);
        const instrumentRefMeta = getInstrumentRefMeta(formData.instrumentType);
        const fmtInr = (n) => (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const onBankChange = (val) => {
            const bank = Math.max(0, parseFloat(val) || 0);
            if (bank + discAmt > outstanding + 0.01) {
                toast.error(`Total settlement cannot exceed outstanding ₹${fmtInr(outstanding)}`);
                return;
            }
            syncDirectInvoiceAdjustment(bank, discAmt, directDiscountReason, directDiscountLedgerId);
        };

        const onDiscountChange = (raw) => {
            if (raw === '') {
                directDiscountRef.current = '';
                setDirectDiscount('');
                syncDirectInvoiceAdjustment(bankAmt, 0, directDiscountReason, directDiscountLedgerId);
                return;
            }
            let disc = parseFloat(raw);
            if (Number.isNaN(disc) || disc < 0) disc = 0;
            disc = Math.round(disc * 100) / 100;
            const maxDisc = Math.max(0, Math.round((outstanding - bankAmt) * 100) / 100);
            if (disc > maxDisc + 0.01) {
                toast.error(`Discount cannot exceed remaining outstanding ₹${fmtInr(maxDisc)}`);
                disc = maxDisc;
            }
            directDiscountRef.current = String(disc);
            setDirectDiscount(String(disc));
            const ledgerId = directDiscountLedgerId || (discountAllowedLedgers[0]?._id ? String(discountAllowedLedgers[0]._id) : '');
            if (ledgerId && !directDiscountLedgerId) {
                directDiscountLedgerIdRef.current = ledgerId;
                setDirectDiscountLedgerId(ledgerId);
            }
            syncDirectInvoiceAdjustment(bankAmt, disc, directDiscountReason || 'Bill adjustment discount', ledgerId);
        };

        return (
            <div style={{ fontFamily: "'Inter',sans-serif", background: '#f8f9fa', minHeight: '100vh', padding: '32px 24px', color: '#1e293b' }}>
                <div style={{ maxWidth: 560, margin: '0 auto' }}>
                    {/* Header */}
                    <div style={{ marginBottom: 24 }}>
                        <button
                            onClick={() => navigate(salesCancelPath)}
                            style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 8 }}
                        >← Back to Invoice</button>
                        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{isEdit ? 'Edit Payment' : 'Record Payment'}</h1>
                        <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 13 }}>Confirm payment details and select account</p>
                    </div>

                    {/* Invoice Summary Card */}
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 20 }}>
                        <div style={{ background: 'linear-gradient(135deg,#0d9488,#0891b2)', padding: '18px 24px' }}>
                            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Invoice Payment</div>
                            <div style={{ color: '#fff', fontSize: 26, fontWeight: 900 }}>₹{fmtInr(bankAmt)}</div>
                            <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 }}>Bank receipt only (discount settled separately)</div>
                        </div>

                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Bill No */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Invoice No.</span>
                                <span style={{ fontSize: 14, fontWeight: 800, color: '#1e293b', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 6, padding: '2px 12px' }}>{invNo}</span>
                            </div>

                            {/* Customer */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Customer / Party</span>
                                <div style={{ 
                                    width: 240, 
                                    padding: '8px 12px', 
                                    background: '#f0fdf4', 
                                    border: '1px solid #86efac', 
                                    borderRadius: 7, 
                                    fontSize: 14, 
                                    fontWeight: 700, 
                                    color: '#166534',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span>{custName}</span>
                                    {formData.items[0]?.ledgerId ? (
                                        <span style={{ fontSize: 10, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase' }}>Linked</span>
                                    ) : (
                                        <button 
                                            onClick={() => handleFixEntityLedger(location.state?.customerId, 'Customer')}
                                            style={{ fontSize: 10, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', border: '1px solid #fecaca', borderRadius: 6, textTransform: 'uppercase', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                                        >
                                            <AlertCircle size={10} /> Not Linked — Fix Now
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Invoice Outstanding</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: '#b45309' }}>₹{fmtInr(outstanding)}</span>
                            </div>

                            {/* Amount */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Amount to Receive</span>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ position: 'absolute', left: 10, fontWeight: 700, color: '#0d9488' }}>₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={formData.totalAmount || ''}
                                        onChange={(e) => onBankChange(e.target.value)}
                                        style={{ ...inp, width: 140, padding: '6px 10px 6px 22px', fontSize: 15, fontWeight: 800, color: '#0d9488', textAlign: 'right', border: '2px solid #0d9488', background: '#f0fdfa' }}
                                    />
                                </div>
                            </div>

                            {/* Discount Allowed */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Discount Allowed</span>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ position: 'absolute', left: 10, fontWeight: 700, color: '#b45309' }}>₹</span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={directDiscount}
                                        placeholder="0.00"
                                        onChange={(e) => onDiscountChange(e.target.value)}
                                        style={{ ...inp, width: 140, padding: '6px 10px 6px 22px', fontSize: 15, fontWeight: 800, color: '#b45309', textAlign: 'right', border: '2px solid #f59e0b', background: '#fffbeb' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Balance After Settlement</span>
                                <span style={{ fontSize: 15, fontWeight: 800, color: balanceAfter <= 0.009 ? '#166534' : '#334155' }}>
                                    ₹{fmtInr(balanceAfter)}
                                </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Settlement Status</span>
                                <span style={{
                                    fontSize: 12,
                                    fontWeight: 800,
                                    color: settlementStatus.includes('Settled') ? '#166534' : '#475569',
                                    background: settlementStatus.includes('Settled') ? '#f0fdf4' : '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 999,
                                    padding: '3px 10px',
                                }}>
                                    {settlementStatus}
                                </span>
                            </div>

                            {discAmt > 0.009 && (
                                <>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Discount Ledger *</span>
                                        <select
                                            value={directDiscountLedgerId}
                                            onChange={(e) => {
                                                directDiscountLedgerIdRef.current = e.target.value;
                                                setDirectDiscountLedgerId(e.target.value);
                                                syncDirectInvoiceAdjustment(bankAmt, discAmt, directDiscountReason, e.target.value);
                                            }}
                                            style={{ ...inp, width: 240, padding: '6px 10px', fontSize: 12, fontWeight: 600 }}
                                        >
                                            <option value="">— Select Discount ledger —</option>
                                            {discountAllowedLedgers.map((l) => (
                                                <option key={l._id} value={l._id}>{l.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, paddingTop: 6 }}>Discount Reason *</span>
                                        <textarea
                                            value={directDiscountReason}
                                            onChange={(e) => {
                                                directDiscountReasonRef.current = e.target.value;
                                                setDirectDiscountReason(e.target.value);
                                                syncDirectInvoiceAdjustment(bankAmt, discAmt, e.target.value, directDiscountLedgerId);
                                            }}
                                            rows={2}
                                            placeholder="Mandatory when discount is used"
                                            style={{ ...inp, width: '100%', maxWidth: 240, padding: '8px 10px', fontSize: 12, resize: 'vertical' }}
                                        />
                                    </div>
                                </>
                            )}

                            {/* Date */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Receipt Date</span>
                                <input
                                    type="date"
                                    name="date"
                                    value={formData.date}
                                    onChange={handleHeaderChange}
                                    style={{ ...inp, width: 140, padding: '6px 10px', fontSize: 13, fontWeight: 600, color: '#374151', textAlign: 'right' }}
                                />
                            </div>
                            {/* Receipt Mode */}
                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Receipt Mode</span>
                                 <div style={{ display: 'flex', gap: 6 }}>
                                     <button 
                                         type="button"
                                         onClick={() => setFormData(p => ({ ...p, paymentMode: 'Cash/Bank' }))}
                                         style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #e2e8f0', background: formData.paymentMode === 'Cash/Bank' ? '#eff6ff' : '#fff', color: formData.paymentMode === 'Cash/Bank' ? '#2563eb' : '#64748b', fontWeight: 700 }}
                                     >Standard</button>
                                     <button 
                                         type="button"
                                         onClick={() => setFormData(p => ({ ...p, paymentMode: 'Adjustment' }))}
                                         style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid #e2e8f0', background: formData.paymentMode === 'Adjustment' ? '#f0fdf4' : '#fff', color: formData.paymentMode === 'Adjustment' ? '#166534' : '#64748b', fontWeight: 700 }}
                                     >Credit Adj.</button>
                                 </div>
                             </div>
                             {formData.paymentMode !== 'Adjustment' && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>Instrument Type</span>
                                    <select name="instrumentType" value={formData.instrumentType} onChange={handleHeaderChange}
                                        style={{ ...inp, width: 160, padding: '6px 10px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: 'pointer' }}>
                                        {!formData.instrumentType && <option value="">Select Instrument Type</option>}
                                        {instrumentOptions.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </div>
                             )}
                             {/* Customer Balance Info */}
                             {formData.items[0]?.ledgerId && (
                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                                     <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>Available Credit</span>
                                     <span style={{ fontSize: 13, fontWeight: 800, color: (ledgers.find(l => l._id === formData.items[0]?.ledgerId)?.currentBalance || 0) < 0 ? '#10b981' : '#64748b' }}>
                                         ₹{Math.abs(ledgers.find(l => l._id === formData.items[0]?.ledgerId)?.currentBalance || 0).toLocaleString('en-IN')}
                                         {(ledgers.find(l => l._id === formData.items[0]?.ledgerId)?.currentBalance || 0) < 0 ? ' Cr' : ' Dr'}
                                     </span>
                                 </div>
                             )}
                            {/* Narration */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 500, paddingTop: 6 }}>Narration</span>
                                <textarea
                                    name="narration"
                                    value={formData.narration}
                                    onChange={handleHeaderChange}
                                    placeholder="Enter narration..."
                                    style={{ ...inp, width: '100%', maxWidth: 260, height: 60, padding: '8px 10px', fontSize: 12, color: '#4b5563', resize: 'vertical', textAlign: 'left' }}
                                />
                            </div>

                            {formData.items[0]?.ledgerId && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenAdjustment(formData.items[0])}
                                    style={{
                                        marginTop: 4,
                                        padding: '8px 12px',
                                        borderRadius: 8,
                                        border: '1px solid #6366f1',
                                        background: '#eef2ff',
                                        color: '#4338ca',
                                        fontWeight: 700,
                                        fontSize: 12,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Advanced Bill Adjustment (Credit Note / multi-bill)
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Header Selection or Adjustment Info */}
                    <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', padding: '24px', marginBottom: 20 }}>
                        {formData.paymentMode === 'Adjustment' ? (
                            <div style={{ textAlign: 'center', padding: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
                                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#166534' }}>
                                        <Layers size={24} />
                                    </div>
                                </div>
                                <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#166534' }}>Credit Adjustment Mode</h3>
                                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>Settling invoice against available opening credit or advance balance.</p>
                                <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 700, color: '#059669', background: '#ecfdf5', padding: '4px 12px', borderRadius: 20, display: 'inline-block' }}>No Cash/Bank entry will be generated</p>
                            </div>
                        ) : (
                            <>
                                <label style={{ display: 'block', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, color: '#374151', marginBottom: 10 }}>
                                    Deposit Into — Select Account *
                                </label>
                                <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 14, marginTop: -6 }}>Choose how the payment was received (Cash, Bank, or Other)</p>
                                <select
                                    name="cashBankAccountId"
                                    value={formData.cashBankAccountId}
                                    onChange={handleHeaderChange}
                                    style={{ width: '100%', padding: '11px 14px', border: '2px solid #0d9488', borderRadius: 9, fontSize: 14, fontWeight: 600, background: '#f0fdfa', color: '#0d9488', outline: 'none', cursor: 'pointer', marginBottom: (formData.instrumentType !== 'Cash') ? 16 : 0 }}
                                >
                                    {cashBankAccounts.map(a => (
                                        <option key={a._id} value={a._id}>
                                            {a.accountName}  (Bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})
                                        </option>
                                    ))}
                                </select>
                                {(formData.instrumentType !== 'Cash') && (
                                    <>
                                        <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: '#374151', marginBottom: 8 }}>
                                            {instrumentRefMeta.label}{instrumentRefMeta.required ? ' *' : ''}
                                        </label>
                                        <input name="instrumentNo" value={formData.instrumentNo} onChange={handleHeaderChange}
                                            placeholder={instrumentRefMeta.placeholder}
                                            style={{ ...inp, borderRadius: 9, padding: '11px 14px' }} />
                                    </>
                                )}
                                {selectedAccount && (
                                    <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
                                        Current balance: <strong>₹{(selectedAccount.currentBalance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>
                                    </div>
                                )}
                                <LedgerLinkMissingAlert account={selectedAccount} />
                            </>
                        )}
                    </div>

                    {/* Settlement summary — bank button stays bank-only */}
                    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: '14px 18px', marginBottom: 14, fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ color: '#64748b' }}>Bank Receipt</span>
                            <strong>₹{fmtInr(bankAmt)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ color: '#64748b' }}>Discount Allowed</span>
                            <strong style={{ color: '#b45309' }}>₹{fmtInr(discAmt)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ color: '#64748b' }}>Total Invoice Settlement</span>
                            <strong>₹{fmtInr(totalSettlement)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                            <span style={{ color: '#64748b' }}>Balance After</span>
                            <strong style={{ color: balanceAfter <= 0.009 ? '#166534' : '#334155' }}>₹{fmtInr(balanceAfter)}</strong>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            onClick={(e) => { 
                                e.preventDefault();
                                if (window.confirm('Discard changes?')) navigate(salesCancelPath); 
                            }}
                            disabled={isSubmitting}
                            style={{ flex: 1, padding: '13px', border: '1px solid #e5e7eb', borderRadius: 9, background: '#fff', color: '#6b7280', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: 14 }}
                        >Cancel</button>
                        <button
                            onClick={() => handleSave(true)}
                            disabled={isSubmitting || loading}
                            style={{ flex: 2, padding: '13px', border: 'none', borderRadius: 9, background: isSubmitting ? '#9ca3af' : 'linear-gradient(135deg,#0d9488,#0891b2)', color: '#fff', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15, boxShadow: '0 4px 12px rgba(13,148,136,0.35)' }}
                        >
                            {isSubmitting
                                ? 'Saving...'
                                : (isEdit
                                    ? `💳  Update Receipt  ₹${fmtInr(bankAmt)}`
                                    : `💳  Save Receipt & Return  ₹${fmtInr(bankAmt)}`)}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── FULL FORM for normal (non-invoice) entry ────────────────────────────
    return (
        <VoucherEntryTallyLayout fromInvoice={fromInvoice} transferContext={tallyTransferContext}>
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
                <button onClick={() => navigate('/accounts/vouchers')}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ← Back to Voucher Register
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 800, color: '#0f172a' }}>
                            🧾 {isEdit ? 'Edit Receipt' : 'Receipt Entry'}
                        </h1>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Record money received from customers or other sources</p>
                    </div>
                    {formData.items?.[0]?.ledgerId && (
                        <button
                            type="button"
                            onClick={() => {
                                const p = new URLSearchParams({ ledgerId: String(formData.items[0].ledgerId) });
                                if (isEdit && id) p.set('paymentVoucherId', String(id));
                                navigate(`${PATHS.ACCOUNTS.BILL_WISE_ADJUSTMENT}?${p.toString()}`);
                            }}
                            style={{
                                padding: '8px 14px',
                                borderRadius: 8,
                                border: '1px solid #6366f1',
                                background: '#eef2ff',
                                color: '#4338ca',
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            Adjust Against Bills
                        </button>
                    )}
                </div>

                <div style={{ pointerEvents: isSubmitting ? 'none' : 'auto', opacity: isSubmitting ? 0.7 : 1 }}>
                    {/* Header Info */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <h2 style={{ margin: '0 0 16px', fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RECEIPT DETAILS</h2>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Voucher Type *</span>
                                {location.state?.invoiceId ? (
                                    <div style={{ ...inp, background: '#f1f5f9', fontWeight: 700, borderColor: '#cbd5e1', color: '#475569' }}>
                                       {voucherTypes.find(v => v._id === formData.voucherTypeId)?.name || 'Receipt'}
                                    </div>
                                ) : (
                                    <select
                                        name="voucherTypeId"
                                        value={formData.voucherTypeId}
                                        onChange={handleHeaderChange}
                                        style={{ ...inp, cursor: 'pointer' }}
                                    >
                                        {!formData.voucherTypeId && (
                                            <option value="">— Select Receipt Voucher —</option>
                                        )}
                                        {voucherTypes.map(v => <option key={v._id} value={v._id}>{v.name}</option>)}
                                    </select>
                                )}
                            </div>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Voucher Date *</span>
                                {location.state?.invoiceId ? (
                                    <div style={{ ...inp, background: '#f1f5f9', fontWeight: 700, borderColor: '#cbd5e1', color: '#475569' }}>
                                       {formData.date}
                                    </div>
                                ) : (
                                    <input
                                        type="date"
                                        name="date"
                                        value={formData.date}
                                        onChange={handleHeaderChange}
                                        style={inp}
                                    />
                                )}
                            </div>
                            <div style={{ gridColumn: 'span 2' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                        {formData.paymentMode === 'Adjustment' ? 'Adjustment Source' : 'Deposit Into (Cash/Bank) *'}
                                    </span>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button 
                                            type="button"
                                            onClick={() => setFormData(p => ({ ...p, paymentMode: 'Cash/Bank' }))}
                                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #e2e8f0', background: formData.paymentMode === 'Cash/Bank' ? '#eff6ff' : '#fff', color: formData.paymentMode === 'Cash/Bank' ? '#2563eb' : '#64748b', fontWeight: 700 }}
                                        >Standard</button>
                                        <button 
                                            type="button"
                                            onClick={() => setFormData(p => ({ ...p, paymentMode: 'Adjustment' }))}
                                            style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid #e2e8f0', background: formData.paymentMode === 'Adjustment' ? '#f0fdf4' : '#fff', color: formData.paymentMode === 'Adjustment' ? '#166534' : '#64748b', fontWeight: 700 }}
                                        >Credit Adjustment</button>
                                    </div>
                                </div>

                                {formData.paymentMode === 'Adjustment' ? (
                                    <div style={{ ...inp, background: '#f0fdf4', borderColor: '#166534', color: '#166534', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <Layers size={14} />
                                        Adjusting from Customer Opening Credit / Advance
                                    </div>
                                ) : (
                                    <select
                                        name="cashBankAccountId"
                                        value={formData.cashBankAccountId}
                                        onChange={handleHeaderChange}
                                        style={{ ...inp, cursor: 'pointer', fontWeight: 700, color: '#0d9488', background: '#f0fdfa', borderColor: '#0d9488' }}
                                    >
                                        {cashBankAccounts.map(a => (
                                            <option key={a._id} value={a._id}>
                                                {a.accountName} (Bal: ₹{(a.currentBalance || 0).toLocaleString('en-IN')})
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {formData.paymentMode !== 'Adjustment' && (
                                    <LedgerLinkMissingAlert account={cashBankAccounts.find(a => a._id === formData.cashBankAccountId)} />
                                )}
                            </div>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Instrument Type</span>
                                <select
                                    name="instrumentType"
                                    value={formData.instrumentType}
                                    onChange={handleHeaderChange}
                                    style={{ ...inp, cursor: 'pointer' }}
                                >
                                    {!formData.instrumentType && <option value="">Select Instrument Type</option>}
                                    {getInstrumentOptionsForAccount(cashBankAccounts.find((a) => a._id === formData.cashBankAccountId)).map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                                    {getInstrumentRefMeta(formData.instrumentType).label}
                                    {getInstrumentRefMeta(formData.instrumentType).required ? ' *' : ''}
                                </span>
                                <input
                                    name="instrumentNo"
                                    value={formData.instrumentNo}
                                    onChange={handleHeaderChange}
                                    placeholder={getInstrumentRefMeta(formData.instrumentType).placeholder}
                                    style={inp}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Entry Details */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '24px', marginBottom: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Layers size={16} color="#2563eb" /> ENTRY DETAILS
                            </h2>
                            <button type="button" onClick={addItem} style={{ padding: '6px 14px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>+ Add Multi-line</button>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '300px' }}>Received From (Ledger)</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '150px' }}>Amount (₹)</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', width: '160px' }}>Adjustment</th>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '2px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Line Narration</th>
                                        <th style={{ padding: '12px 10px', borderBottom: '2px solid #e2e8f0', width: '50px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.items.map((item, index) => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '10px' }}>
                                                {(location.state?.source === 'sales_invoice' || location.state?.customerId) && index === 0 ? (
                                                    <div style={{ ...inp, background: '#f0fdf4', borderColor: '#86efac', color: '#166534', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span>{item.ledgerName || (loading ? <BrandedLoader size={16} inline /> : 'Not Linked')}</span>
                                                        <span style={{ fontSize: '10px', background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', fontWeight: 700 }}>Locked</span>
                                                    </div>
                                                ) : (
                                                    <SearchableSelect
                                                        options={ledgers.map(l => ({ 
                                                            label: l.name, 
                                                            value: l._id, 
                                                            group: l.groupName || l.accountGroupName || 'General',
                                                            balance: l.currentBalance || 0,
                                                            gst: l.gstNumber,
                                                            phone: l.phone,
                                                            type: l.type 
                                                        }))}
                                                        renderOption={(opt) => (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '2px 0' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{opt.label}</span>
                                                                    <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>{opt.group}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                                                                    <span>{opt.gst ? `GST: ${opt.gst}` : (opt.phone ? `📞 ${opt.phone}` : 'No details')}</span>
                                                                    <span style={{ fontWeight: 800, color: opt.balance >= 0 ? '#10b981' : '#ef4444' }}>
                                                                        ₹{Math.abs(opt.balance).toLocaleString('en-IN')} {opt.balance >= 0 ? 'Dr' : 'Cr'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        )}
                                                        value={item.ledgerId}
                                                        onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                                        placeholder="Search ledger..."
                                                        onCreateNew={(term) => handleQuickCreateLedger(term, item.id)}
                                                    />
                                                )}
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <input
                                                    type="number"
                                                    min="0.01" step="0.01"
                                                    placeholder="0.00"
                                                    value={item.amount || ''}
                                                    onChange={(e) => handleItemChange(item.id, 'amount', Number(e.target.value))}
                                                    style={{ ...inp, fontWeight: 800, color: '#0f172a', textAlign: 'right' }}
                                                />
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenAdjustment(item)}
                                                    disabled={!item.ledgerId || !item.amount}
                                                    style={{ width: '100%', padding: '9px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: (!item.ledgerId || !item.amount) ? 'not-allowed' : 'pointer', border: item.adjustments.length > 0 ? 'none' : '1px solid #cbd5e1', background: item.adjustments.length > 0 ? '#3b82f6' : '#fff', color: item.adjustments.length > 0 ? '#fff' : '#475569', transition: 'all 0.2s' }}
                                                >
                                                    {item.adjustments.length > 0 ? `Adjusted (${item.adjustments.length})` : 'Auto / Bill'}
                                                </button>
                                            </td>
                                            <td style={{ padding: '10px' }}>
                                                <input
                                                    placeholder="Cheque No / Remarks"
                                                    value={item.narration}
                                                    onChange={(e) => handleItemChange(item.id, 'narration', e.target.value)}
                                                    style={inp}
                                                />
                                            </td>
                                            <td style={{ padding: '10px', textAlign: 'center' }}>
                                                {!(location.state?.customerId && index === 0) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeItem(item.id)}
                                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', alignItems: 'end' }}>
                        <div style={{ gridColumn: 'span 2' }}>
                            <span style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px', fontWeight: 600, letterSpacing: '0.02em', textTransform: 'uppercase' }}>Main Narration</span>
                            <input
                                placeholder="Overall transaction reference..."
                                name="narration"
                                value={formData.narration}
                                onChange={handleHeaderChange}
                                style={inp}
                            />
                        </div>
                        <div style={{ background: '#0f172a', color: '#fff', padding: '20px 24px', borderRadius: '14px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Receipt</span>
                            <span style={{ fontSize: '28px', fontWeight: 800, color: '#10b981' }}>₹{formData.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '30px' }}>
                        <button type="button" onClick={handleDiscard}
                            style={{ padding: '10px 24px', borderRadius: '8px', background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: 'pointer', fontWeight: 600 }}>
                            Discard
                        </button>
                        <button type="button" onClick={handleSaveAndClose} disabled={isSubmitting}
                            style={{ padding: '10px 24px', borderRadius: '8px', background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                            Save & Close
                        </button>
                        <button type="button" onClick={handleSaveAndNew} disabled={isSubmitting}
                            style={{ padding: '10px 28px', borderRadius: '8px', background: isSubmitting ? '#9ca3af' : '#2563eb', color: '#fff', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '14px', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Save size={18} />
                            {isSubmitting ? 'Saving...' : (isEdit ? 'Update Receipt' : 'Post & New Receipt')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </VoucherEntryTallyLayout>
    );
};

export default ReceiptEntryPage;
