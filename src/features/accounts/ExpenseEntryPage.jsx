import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    Button, Input, Select, useModal, SearchableSelect
} from '@/components/ui';
import {
    Plus, Trash2, Save, Receipt, Layers, FileText, CheckCircle2, AlertCircle, Percent,
} from 'lucide-react';
import {
    getVoucherTypes, getLedgers, getAccountGroups,
    createVoucher, createLedger, getVoucher, updateVoucher,
} from '@/services/accountApi';
import LedgerForm from './components/LedgerForm';
import { toast } from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { TdsLiabilityAlertModal } from '@/features/accounts/components/TdsLiabilityAlertModal';
import { TdsPayableLedgerModal } from '@/features/accounts/components/TdsPayableLedgerModal';
import { tdsComplianceApi } from '@/services/tdsComplianceApi';
import VoucherEntryTallyLayout from './components/voucherEntryTally';
import { useFeatureSettings } from '@/contexts/FeatureSettingsContext';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { scanEntryApi } from '@/services/scanEntryApi';
import {
    buildGroupIndex,
    isCreditorLedger,
    isExpenseLedger,
    formatLedgerBalanceDrCr,
} from './utils/ledgerClassification';
import RcmPreviewPanel from './components/RcmPreviewPanel';
import RcmAccountingPreviewPanel from './components/RcmAccountingPreviewPanel';
import { getSuppliers } from '@/services/purchaseApi';
import { rcmApi } from '@/services/rcmApi';
import { useCompany } from '@/contexts/CompanyContext';
import { useAuth } from '@/hooks/useAuth';

const r2 = (n) => Math.round((n || 0) * 100) / 100;

/** API payloads may use populated `{ _id }` from forms — normalize for preview/save. */
const toApiId = (val) => {
    if (val == null || val === '') return null;
    if (typeof val === 'object' && val._id != null) return String(val._id);
    return String(val);
};

const inp = { padding: '10px 14px', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '8px', color: '#1e293b', fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box', transition: 'all 0.2s' };
const labelStyle = { fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '6px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' };

const ExpenseEntryPage = () => {
    const navigate = useNavigate();
    const { openModal, closeModal } = useModal();
    const { isFeatureEnabled } = useFeatureSettings();
    const scanEntryEnabled = isFeatureEnabled('accounting.enableAiSmartImport');
    const { selectedFY } = useFinancialYear();
    const { selectedCompany } = useCompany();
    const { user, hasPermission } = useAuth();
    const canOverrideRcm = ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(
        String(user?.role || user?.roleName || '').toLowerCase(),
    ) || hasPermission?.('gst.rcm.override') || hasPermission?.('gst.rcm.confirm');
    const canPostRcm = hasPermission?.('gst.rcm.post_liability')
        || ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(
            String(user?.role || user?.roleName || '').toLowerCase(),
        );
    const canRecordRcmPayment = hasPermission?.('gst.rcm.record_payment')
        || ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(
            String(user?.role || user?.roleName || '').toLowerCase(),
        );
    const canReviewRcmItc = hasPermission?.('gst.rcm.review_itc')
        || ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(
            String(user?.role || user?.roleName || '').toLowerCase(),
        );
    const canReleaseRcmItc = hasPermission?.('gst.rcm.release_itc')
        || ['admin', 'superadmin', 'system admin', 'systemadmin'].includes(
            String(user?.role || user?.roleName || '').toLowerCase(),
        );

    const [rcmPreview, setRcmPreview] = useState(null);
    const [rcmLoading, setRcmLoading] = useState(false);
    const [rcmQuestions, setRcmQuestions] = useState({
        propertyType: '',
        transportServiceType: '',
        supplierGstCharged: '',
        consignmentNoteAvailable: '',
        supplierGstOption: '',
        rcmCategory: '',
    });
    const [linkedSupplierId, setLinkedSupplierId] = useState('');
    const [linkedSupplierProfile, setLinkedSupplierProfile] = useState(null);
    const rcmPrefillKeyRef = useRef('');
    const [rcmOverride, setRcmOverride] = useState(null);
    const [rcmConfirmed, setRcmConfirmed] = useState(false);
    const [rcmAccountingSim, setRcmAccountingSim] = useState(null);
    const [rcmSimLoading, setRcmSimLoading] = useState(false);
    const [rcmPostingEligibility, setRcmPostingEligibility] = useState(null);
    const [rcmPostingResult, setRcmPostingResult] = useState(null);
    const [rcmPostBusy, setRcmPostBusy] = useState(false);
    const [rcmPaymentBusy, setRcmPaymentBusy] = useState(false);
    const [rcmItcBusy, setRcmItcBusy] = useState(false);

    const [voucherTypes, setVoucherTypes] = useState([]);
    const [ledgers, setLedgers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadingScan, setUploadingScan] = useState(false);
    const [tdsPreview, setTdsPreview] = useState(null);
    const [tdsAlertOpen, setTdsAlertOpen] = useState(false);
    const [tdsLineOverrides, setTdsLineOverrides] = useState({}); // keyed by expenseLedgerId
    const [tdsPreviewLoading, setTdsPreviewLoading] = useState(false);
    const [payableModalOpen, setPayableModalOpen] = useState(false);
    const [payableModalCtx, setPayableModalCtx] = useState({ code: '', name: '' });
    const [payableModalIntro, setPayableModalIntro] = useState('');
    const [tdsSectionConflictOpen, setTdsSectionConflictOpen] = useState(false);
    const [tdsSectionConflict, setTdsSectionConflict] = useState(null);
    const expenseTdsSectionResolutionRef = useRef(null);
    const closeAfterSaveRef = useRef(false);
    const { id } = useParams();
    const isEdit = !!id;

    const INITIAL_FORM_STATE = {
        voucherTypeId: '',
        expenseType: 'Credit', // Payable to Supplier / Creditor (payment via Payment Voucher)
        date: new Date().toISOString().split('T')[0],
        cashBankAccountId: '',
        partyId: '', // Supplier / Creditor ledger
        partyName: '',
        supplierBillNo: '',
        supplierBillDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        
        // GST Fields
        isGstEnabled: false,
        gstType: 'CGST / SGST',
        placeOfSupply: '',
        supplierGstin: '',
        totalTaxableAmount: 0,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 0,

        totalAmount: 0, // Legacy/Simple Total
        narration: '',
        items: [
            { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', hsnCode: '', gstRate: 0 }
        ]
    };

    const [formData, setFormData] = useState(INITIAL_FORM_STATE);

    const normalizeFyKey = (fy) => {
        const s = String(fy || '').trim();
        const short = /^(\d{4})-(\d{2})$/.exec(s);
        if (short) return `${short[1]}-20${short[2]}`;
        return s;
    };

    const pickDefaultExpenseSeries = (types, fyName) => {
        const active = (types || []).filter((t) => t.active !== false);
        if (!active.length) return null;
        const fyNorm = normalizeFyKey(fyName);
        const fyMatch = active.filter((t) => {
            if (!t.financialYear) return true; // legacy company-wide series
            return normalizeFyKey(t.financialYear) === fyNorm;
        });
        const pool = fyMatch.length ? fyMatch : active.filter((t) => !t.financialYear);
        const use = pool.length ? pool : active;
        const preferred =
            use.find((t) => /expense\s*voucher/i.test(t.name || '')) ||
            use.find((t) => /^expenses?$/i.test(t.name || '')) ||
            use.find((t) => /\bEV\b/i.test(t.name || '') || /^EV$/i.test(t.prefix || '')) ||
            use[0];
        return preferred || null;
    };

    const previewNextExpenseNo = (vType, dateStr) => {
        if (!vType) return '';
        const d = dateStr ? new Date(dateStr) : new Date();
        const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
        const shortFy = `${String(y).slice(-2)}-${String(y + 1).slice(-2)}`;
        let prefix = vType.prefix || '';
        if (!prefix) prefix = 'EV';
        if (prefix && !prefix.endsWith('/') && !prefix.includes('/')) {
            /* keep as-is; backend may append / */
        }
        const num = Number(vType.nextNumber) || 1;
        const prefixPart = prefix.endsWith('/') ? prefix : `${prefix}${prefix ? '/' : ''}`;
        return `${shortFy}/${prefixPart}${String(num).padStart(4, '0')}`.replace('//', '/');
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [vTypes, allLedgers, allGroups] = await Promise.all([
                    getVoucherTypes({ nature: 'Expense', active: true }),
                    getLedgers(),
                    getAccountGroups()
                ]);
                setVoucherTypes(vTypes);
                setLedgers(allLedgers);
                setGroups(allGroups);

                if (!isEdit) {
                    const defaultType = pickDefaultExpenseSeries(vTypes, selectedFY);
                    setFormData((prev) => ({
                        ...prev,
                        expenseType: 'Credit',
                        cashBankAccountId: '',
                        voucherTypeId: defaultType?._id || '',
                    }));
                    if (!defaultType) {
                        toast.error(
                            'No active Expense Voucher series is configured for this company and financial year.',
                        );
                    }
                }
            } catch (error) {
                toast.error('Failed to load initial data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-select default Expense series when FY changes (create mode only)
    useEffect(() => {
        if (isEdit || loading || !voucherTypes.length) return;
        const defaultType = pickDefaultExpenseSeries(voucherTypes, selectedFY);
        if (!defaultType) return;
        setFormData((prev) => {
            if (prev.voucherTypeId === defaultType._id) return prev;
            const stillValid = voucherTypes.some((t) => t._id === prev.voucherTypeId);
            if (stillValid && prev.voucherTypeId) return prev;
            return { ...prev, voucherTypeId: defaultType._id, expenseType: 'Credit', cashBankAccountId: '' };
        });
    }, [selectedFY, voucherTypes, isEdit, loading]);

    // Effect for loading existing voucher data in edit mode
    useEffect(() => {
        if (isEdit && ledgers.length > 0) {
            const fetchVoucherData = async () => {
                try {
                    const response = await getVoucher(id);
                    if (!response) throw new Error('Voucher not found');
                    
                    setFormData({
                        ...response,
                        date: response.date ? new Date(response.date).toISOString().split('T')[0] : '',
                        supplierBillDate: response.supplierBillDate ? new Date(response.supplierBillDate).toISOString().split('T')[0] : '',
                        dueDate: response.dueDate ? new Date(response.dueDate).toISOString().split('T')[0] : '',
                        voucherTypeId: response.voucherType?._id || response.voucherType,
                        cashBankAccountId: response.cashBankAccountId?._id || response.cashBankAccountId,
                        partyId: response.partyId?._id || response.partyId,
                        items: response.items.map(item => ({
                            ...item,
                            id: item._id || Date.now() + Math.random(),
                            ledgerId: item.ledgerId?._id || item.ledgerId,
                            ledgerName: item.ledgerId?.name || item.ledgerName
                        }))
                    });
                } catch (error) {
                    console.error('FetchVoucher Error:', error);
                    toast.error('Failed to load expense for editing');
                    navigate(PATHS.ACCOUNTS.VOUCHERS);
                }
            };
            fetchVoucherData();
        }
    }, [id, isEdit, ledgers.length]);

    // Helper for Real-time Totals.
    // Confirmed Reverse Charge: supplier payable = taxable only (no ordinary Input GST / GST in grand total).
    const rcmRcRef = useRef(false);
    const calculateTotals = (items, isGst, gstType, opts = {}) => {
        let taxable = 0, cgst = 0, sgst = 0, igst = 0;
        const isIGST = gstType === 'IGST';
        const rcmReverseCharge = opts.rcmReverseCharge ?? rcmRcRef.current;
        const applyInputGst = isGst && !rcmReverseCharge;

        items.forEach(item => {
            const amt = parseFloat(item.amount || 0);
            taxable += amt;
            if (applyInputGst && item.gstRate > 0) {
                if (isIGST) {
                    igst += r2(amt * item.gstRate / 100);
                } else {
                    cgst += r2(amt * (item.gstRate / 2) / 100);
                    sgst += r2(amt * (item.gstRate / 2) / 100);
                }
            }
        });

        const rawTotal = taxable + cgst + sgst + igst;
        const rounded = Math.round(rawTotal);
        const ro = r2(rounded - rawTotal);

        return {
            totalTaxableAmount: r2(taxable),
            totalCgst: r2(cgst),
            totalSgst: r2(sgst),
            totalIgst: r2(igst),
            totalTax: r2(cgst + sgst + igst),
            roundOff: ro,
            grandTotal: rounded,
            totalAmount: applyInputGst ? rounded : r2(taxable),
        };
    };

    const isRcmReverseCharge = useMemo(() => {
        const t = rcmOverride?.finalTreatment || rcmPreview?.treatment;
        return t === 'REVERSE_CHARGE';
    }, [rcmOverride, rcmPreview]);
    rcmRcRef.current = isRcmReverseCharge;

    const rcmLiabilitySummary = useMemo(() => {
        if (!isRcmReverseCharge) return null;
        const taxable = Number(formData.totalTaxableAmount) || 0;
        const rate = Number(
            rcmPreview?.suggestedGstRate
            ?? formData.items.find((i) => i.ledgerId && Number(i.amount) > 0)?.gstRate
            ?? 0,
        ) || 0;
        const isIGST = formData.gstType === 'IGST';
        const tax = r2(taxable * rate / 100);
        if (isIGST) {
            return {
                taxableValue: r2(taxable),
                supplierPayable: r2(taxable),
                rcmCgst: 0,
                rcmSgst: 0,
                rcmIgst: tax,
                rcmTotal: tax,
                rate,
            };
        }
        const half = r2(tax / 2);
        return {
            taxableValue: r2(taxable),
            supplierPayable: r2(taxable),
            rcmCgst: half,
            rcmSgst: half,
            rcmIgst: 0,
            rcmTotal: r2(half * 2),
            rate,
        };
    }, [isRcmReverseCharge, formData.totalTaxableAmount, formData.gstType, formData.items, rcmPreview]);

    // Keep voucher totals in sync when RCM treatment flips (RC ↔ FC).
    useEffect(() => {
        setFormData((prev) => {
            const totals = calculateTotals(prev.items, prev.isGstEnabled, prev.gstType, {
                rcmReverseCharge: isRcmReverseCharge,
            });
            if (
                prev.totalCgst === totals.totalCgst
                && prev.totalSgst === totals.totalSgst
                && prev.totalIgst === totals.totalIgst
                && prev.grandTotal === totals.grandTotal
                && prev.totalAmount === totals.totalAmount
            ) {
                return prev;
            }
            return { ...prev, ...totals };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isRcmReverseCharge]);

    const groupIndex = useMemo(() => buildGroupIndex(groups), [groups]);

    // Supplier / Creditor only (no Cash / Bank)
    const creditorPartyOptions = useMemo(() => {
        return ledgers
            .filter((l) => (l.status || 'Active') === 'Active' && isCreditorLedger(l, groupIndex))
            .map((l) => {
                const bal = formatLedgerBalanceDrCr(l.currentBalance);
                return {
                    value: l._id,
                    label: l.name,
                    type: 'Credit',
                    balance: l.currentBalance,
                    balanceAbs: bal.abs,
                    balanceSide: bal.side,
                    balanceColor: bal.color,
                    gstin: l.gstin || '',
                    isSupplier: true,
                    ledgerId: l._id,
                };
            });
    }, [ledgers, groupIndex]);

    const expenseLedgerOptions = useMemo(() => {
        return ledgers
            .filter((l) => (l.status || 'Active') === 'Active' && isExpenseLedger(l, groupIndex))
            .map((l) => ({
                label: l.name,
                value: l._id,
                group: l.groupName || l.underGroup?.name || 'Expenses',
                balance: l.currentBalance || 0,
            }));
    }, [ledgers, groupIndex]);

    const selectedExpenseSeries = useMemo(
        () => voucherTypes.find((v) => v._id === formData.voucherTypeId) || null,
        [voucherTypes, formData.voucherTypeId],
    );

    const seriesPreview = useMemo(
        () => (isEdit ? '' : previewNextExpenseNo(selectedExpenseSeries, formData.date)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isEdit, selectedExpenseSeries, formData.date],
    );

    const handleAccountChange = async (val) => {
        const acc = creditorPartyOptions.find((a) => a.value === val);
        if (!acc) return;

        const partyLedger = ledgers.find((l) => l._id === val) || null;
        const supplierState = (partyLedger?.state || '').trim().toUpperCase();
        const homeState = 'MAHARASHTRA';
        const isLocal = supplierState === homeState || supplierState === '';

        setFormData((prev) => {
            const next = {
                ...prev,
                expenseType: 'Credit',
                cashBankAccountId: '',
                partyId: acc.value,
                partyName: acc.label,
                placeOfSupply: partyLedger?.state || prev.placeOfSupply,
                supplierGstin: partyLedger?.gstin || prev.supplierGstin,
                gstType: isLocal ? 'CGST / SGST' : 'IGST',
            };
            const totals = calculateTotals(next.items, next.isGstEnabled, next.gstType);
            return { ...next, ...totals };
        });

        // Resolve Supplier Master by ledgerId (never by name). Prefill RCM questions as suggestions only.
        rcmPrefillKeyRef.current = '';
        setLinkedSupplierId('');
        setLinkedSupplierProfile(null);
        try {
            const data = await getSuppliers({ limit: 200 });
            const list = data?.suppliers || data || [];
            const matches = (Array.isArray(list) ? list : []).filter(
                (s) => s && !s.isDeleted && s.isActive !== false && String(s.ledgerId || '') === String(val),
            );
            if (matches.length === 1) {
                const s = matches[0];
                setLinkedSupplierId(s._id);
                setLinkedSupplierProfile(s);
                setFormData((prev) => ({
                    ...prev,
                    supplierGstin: s.gstNumber || prev.supplierGstin,
                    placeOfSupply: s.defaultPlaceOfSupply || s.state || prev.placeOfSupply,
                }));
                const prefillKey = `${s._id}`;
                if (rcmPrefillKeyRef.current !== prefillKey) {
                    rcmPrefillKeyRef.current = prefillKey;
                    setRcmQuestions((q) => {
                        const next = { ...q };
                        if (!next.propertyType && s.defaultPropertyType && s.defaultPropertyType !== 'Transaction-wise') {
                            next.propertyType = s.defaultPropertyType;
                        }
                        if (!next.rcmCategory && Array.isArray(s.defaultRcmCategories) && s.defaultRcmCategories.length === 1) {
                            next.rcmCategory = s.defaultRcmCategories[0];
                        }
                        if (!next.supplierGstOption && s.supplierChargesGst && s.supplierChargesGst !== 'Not Applicable') {
                            next.supplierGstOption = s.supplierChargesGst;
                        }
                        if (!next.transportServiceType && s.transportSupplierType) {
                            const t = String(s.transportSupplierType);
                            if (/gta/i.test(t) && /consignment/i.test(t)) next.transportServiceType = 'GTA with consignment note';
                            else if (/courier/i.test(t)) next.transportServiceType = 'Courier';
                            else if (/local transporter/i.test(t)) next.transportServiceType = 'Local Transport';
                            else if (/vehicle/i.test(t)) next.transportServiceType = 'Local vehicle hire';
                            else if (/parcel/i.test(t)) next.transportServiceType = 'Parcel service';
                            else if (t) next.transportServiceType = 'Other transport';
                        }
                        if (
                            next.consignmentNoteAvailable === ''
                            && s.consignmentNoteNormallyIssued
                            && s.consignmentNoteNormallyIssued !== 'Transaction-wise'
                        ) {
                            next.consignmentNoteAvailable = s.consignmentNoteNormallyIssued === 'Yes';
                        }
                        if (!next.supplierGstOption && s.transportGstPaymentOption) {
                            const p = String(s.transportGstPaymentOption).toLowerCase();
                            if (p.includes('recipient') || p.includes('rcm')) next.supplierGstOption = 'Reverse Charge';
                            else if (p.includes('forward')) next.supplierGstOption = 'Forward Charge';
                            else if (p.includes('exempt')) next.supplierGstOption = 'Exempt / Not Applicable';
                            else if (p.includes('transaction')) next.supplierGstOption = 'Transaction-wise';
                            else if (p.includes('unknown') || p.includes('review')) next.supplierGstOption = 'Unknown';
                        }
                        if (!next.rcmCategory && s.defaultTransportRcmCategory && s.defaultTransportRcmCategory !== 'None') {
                            next.rcmCategory = s.defaultTransportRcmCategory;
                        }
                        return next;
                    });
                }
            } else if (matches.length > 1) {
                setLinkedSupplierId('');
                setLinkedSupplierProfile({ ambiguous: true, matchCount: matches.length });
                toast.error('Multiple suppliers link to this ledger — select/fix the correct supplier master.');
            }
        } catch {
            /* ignore — engine still resolves server-side */
        }
    };

    const handleQuickCreateLedger = (searchTerm, targetField = 'expenseItem') => {
        const defaultGroupName = targetField === 'header' ? 'Sundry Creditors' : 'Indirect Expenses';
        const defaultGroup = groups.find(g => g.name === defaultGroupName);

        openModal({
            title: `Quick Create Ledger: ${searchTerm}`,
            size: 'lg',
            content: (
                <LedgerForm 
                    initial={{ name: searchTerm, underGroup: defaultGroup?._id }}
                    groups={groups}
                    onCancel={closeModal}
                    onSave={async (data) => {
                        try {
                            const newLedger = await createLedger(data);
                            toast.success('Ledger created successfully');
                            
                            const lData = await getLedgers();
                            setLedgers(lData);

                            if (targetField === 'header') {
                                setFormData((prev) => ({
                                    ...prev,
                                    expenseType: 'Credit',
                                    cashBankAccountId: '',
                                    partyId: newLedger._id,
                                    partyName: newLedger.name,
                                }));
                            } else if (targetField.startsWith('item-')) {
                                const itemId = parseInt(targetField.split('-')[1], 10);
                                handleItemChange(itemId, 'ledgerId', newLedger._id);
                            }

                            closeModal();
                        } catch (err) {
                            toast.error(err.response?.data?.message || 'Failed to create ledger');
                        }
                    }}
                />
            )
        });
    };

    const handleHeaderChange = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : value;
        
        setFormData(prev => {
            const next = { ...prev, [name]: val };
            if (name === 'isGstEnabled' || name === 'gstType') {
                const totals = calculateTotals(next.items, next.isGstEnabled, next.gstType);
                return { ...next, ...totals };
            }
            return next;
        });
    };

    const handleItemChange = (id, field, value) => {
        setFormData(prev => {
            let isAnyGstEnabled = prev.isGstEnabled;
            const newItems = prev.items.map(item => {
                if (item.id === id) {
                    const updated = { ...item, [field]: value };
                    
                    if (field === 'ledgerId') {
                        const ledger = ledgers.find(l => l._id === value);
                        updated.ledgerName = ledger ? ledger.name : '';
                        
                        // Auto-sync GST Rate and HSN from Ledger Master
                        if (ledger?.gstRate > 0 || ledger?.hsnCode) {
                            if (ledger.gstRate > 0) {
                                updated.gstRate = ledger.gstRate;
                                isAnyGstEnabled = true; // Auto-enable GST if rate found
                            }
                            if (ledger.hsnCode) {
                                updated.hsnCode = ledger.hsnCode;
                            }
                        }
                    }
                    return updated;
                }
                return item;
            });
            const totals = calculateTotals(newItems, isAnyGstEnabled, prev.gstType);
            return { ...prev, items: newItems, isGstEnabled: isAnyGstEnabled, ...totals };
        });
    };

    const addItem = () => {
        setFormData(prev => ({
            ...prev,
            items: [...prev.items, { id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', hsnCode: '', gstRate: 0 }]
        }));
    };

    const removeItem = (id) => {
        if (formData.items.length === 1) return;
        setFormData(prev => {
            const newItems = prev.items.filter(item => item.id !== id);
            const totals = calculateTotals(newItems, prev.isGstEnabled, prev.gstType);
            return { ...prev, items: newItems, ...totals };
        });
    };

    const buildExpenseTdsPreviewBody = () => {
        const totals = calculateTotals(formData.items, formData.isGstEnabled, formData.gstType);
        const processingTotal = formData.isGstEnabled ? totals.grandTotal : totals.totalAmount;
        const overrides = Object.values(tdsLineOverrides || {}).filter(
            (o) => o && o.expenseLedgerId && String(o.overrideReason || '').trim(),
        );
        return {
            partyId: toApiId(formData.partyId) || undefined,
            date: formData.date,
            items: formData.items.map((item) => ({
                ...item,
                ledgerId: toApiId(item.ledgerId) || null,
                type: item.type || 'Debit',
            })),
            isGstEnabled: formData.isGstEnabled,
            processingTotal,
            grandTotal: totals.grandTotal,
            totalAmount: totals.totalAmount,
            totalTaxableAmount: formData.isGstEnabled ? totals.totalTaxableAmount : undefined,
            totalTax: formData.isGstEnabled ? totals.totalTax : undefined,
            totalCgst: formData.isGstEnabled ? totals.totalCgst : undefined,
            totalSgst: formData.isGstEnabled ? totals.totalSgst : undefined,
            totalIgst: formData.isGstEnabled ? totals.totalIgst : undefined,
            roundOff: formData.isGstEnabled ? totals.roundOff : undefined,
            excludeVoucherId: isEdit ? id : undefined,
            expenseTdsSectionResolution: expenseTdsSectionResolutionRef.current || undefined,
            tdsLineOverrides: overrides,
        };
    };

    const refreshTdsLivePreview = async () => {
        if (!formData.partyId) {
            setTdsPreview(null);
            return;
        }
        const hasLine = formData.items.some((i) => i.ledgerId && Number(i.amount) > 0);
        if (!hasLine) {
            setTdsPreview(null);
            return;
        }
        setTdsPreviewLoading(true);
        try {
            const preview = await tdsComplianceApi.previewExpenseVoucher(buildExpenseTdsPreviewBody());
            if (preview?.engineActive && !preview.previewFailed) {
                setTdsPreview(preview);
            } else if (preview?.previewFailed) {
                setTdsPreview(preview);
            } else {
                setTdsPreview(preview?.engineActive ? preview : null);
            }
        } catch {
            /* non-blocking live preview */
        } finally {
            setTdsPreviewLoading(false);
        }
    };

    useEffect(() => {
        const t = setTimeout(() => {
            refreshTdsLivePreview();
        }, 450);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.partyId, formData.date, formData.items, formData.isGstEnabled, formData.gstType, tdsLineOverrides]);

    useEffect(() => {
        const first = formData.items.find((i) => i.ledgerId && Number(i.amount) > 0);
        if (!first?.ledgerId) {
            setRcmPreview(null);
            return undefined;
        }
        const t = setTimeout(async () => {
            setRcmLoading(true);
            try {
                const taxable = formData.isGstEnabled
                    ? Number(formData.totalTaxableAmount) || Number(first.amount) || 0
                    : Number(first.amount) || 0;
                // Only pass document GST when supplier explicitly charged GST on this bill.
                // Line GST rates under RCM must not force Forward Charge heuristics.
                const chargedYes = rcmQuestions.supplierGstCharged === true
                    || rcmQuestions.supplierGstCharged === 'YES';
                const docGst = chargedYes
                    ? ((Number(formData.totalCgst) || 0)
                        + (Number(formData.totalSgst) || 0)
                        + (Number(formData.totalIgst) || 0))
                    : 0;
                const data = await rcmApi.evaluate({
                    companyId: selectedCompany?._id,
                    transactionDate: formData.date,
                    partyLedgerId: formData.partyId || undefined,
                    supplierId: linkedSupplierId || undefined,
                    expenseLedgerId: first.ledgerId,
                    supplierGstin: formData.supplierGstin,
                    placeOfSupply: formData.placeOfSupply,
                    gstType: formData.gstType,
                    taxableValue: taxable,
                    suggestedGstRate: first.gstRate,
                    hsnSac: first.hsnCode,
                    documentGstAmount: formData.isGstEnabled ? docGst : 0,
                    propertyType: rcmQuestions.propertyType || undefined,
                    transportServiceType: rcmQuestions.transportServiceType || undefined,
                    supplierGstCharged: rcmQuestions.supplierGstCharged === '' ? undefined : rcmQuestions.supplierGstCharged,
                    consignmentNoteAvailable: rcmQuestions.consignmentNoteAvailable === '' ? undefined : rcmQuestions.consignmentNoteAvailable,
                    supplierGstOption: rcmQuestions.supplierGstOption || undefined,
                    rcmCategory: rcmQuestions.rcmCategory || undefined,
                    override: rcmOverride || undefined,
                }, { includeDraftRules: true });
                setRcmPreview(data);
            } catch {
                setRcmPreview(null);
            } finally {
                setRcmLoading(false);
            }
        }, 500);
        return () => clearTimeout(t);
    }, [
        formData.partyId,
        formData.date,
        formData.items,
        formData.isGstEnabled,
        formData.gstType,
        formData.supplierGstin,
        formData.placeOfSupply,
        formData.totalTaxableAmount,
        formData.totalCgst,
        formData.totalSgst,
        formData.totalIgst,
        rcmQuestions,
        rcmOverride,
        linkedSupplierId,
        selectedCompany?._id,
    ]);

    // Phase 2B-A — accounting simulation only (requires confirm + Reverse Charge)
    useEffect(() => {
        if (!rcmPreview) {
            setRcmAccountingSim(null);
            return undefined;
        }
        const first = formData.items.find((i) => i.ledgerId && Number(i.amount) > 0);
        const t = setTimeout(async () => {
            setRcmSimLoading(true);
            try {
                const taxable = formData.isGstEnabled
                    ? Number(formData.totalTaxableAmount) || Number(first?.amount) || 0
                    : Number(first?.amount) || 0;
                const chargedYes = rcmQuestions.supplierGstCharged === true
                    || rcmQuestions.supplierGstCharged === 'YES';
                const supplierChargedGst = chargedYes && formData.isGstEnabled
                    ? ((Number(formData.totalCgst) || 0)
                        + (Number(formData.totalSgst) || 0)
                        + (Number(formData.totalIgst) || 0))
                    : 0;
                const sim = await rcmApi.simulateAccounting({
                    decision: rcmPreview,
                    rcmConfirmed,
                    expenseLedgerName: first?.ledgerName || 'Rent Expense',
                    supplierName: formData.partyName || 'Supplier',
                    taxableValue: taxable,
                    gstType: formData.gstType,
                    rate: first?.gstRate || rcmPreview.suggestedGstRate,
                    supplierChargedGst,
                    rcmCategory: rcmPreview.rcmCategory || rcmQuestions.rcmCategory,
                });
                setRcmAccountingSim(sim);
            } catch {
                setRcmAccountingSim(null);
            } finally {
                setRcmSimLoading(false);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [
        rcmPreview,
        rcmConfirmed,
        formData.partyName,
        formData.gstType,
        formData.isGstEnabled,
        formData.totalTaxableAmount,
        formData.totalCgst,
        formData.totalSgst,
        formData.totalIgst,
        formData.items,
        rcmQuestions.rcmCategory,
    ]);

    // Phase 2B-B — posting eligibility (no side effects)
    useEffect(() => {
        if (!rcmPreview || !rcmConfirmed || !rcmAccountingSim?.simulationGenerated) {
            setRcmPostingEligibility(null);
            return undefined;
        }
        const t = setTimeout(async () => {
            try {
                const elig = await rcmApi.postingEligibility({
                    decision: rcmPreview,
                    rcmConfirmed: true,
                    companyId: selectedCompany?._id,
                    sourceVoucherId: id || undefined,
                    taxableValue: rcmAccountingSim?.rcmLiability?.taxableValue,
                    gstType: formData.gstType,
                    rate: rcmAccountingSim?.rcmLiability?.rate,
                });
                setRcmPostingEligibility(elig);
            } catch {
                setRcmPostingEligibility({
                    eligible: false,
                    reason: 'Could not evaluate posting eligibility.',
                });
            }
        }, 400);
        return () => clearTimeout(t);
    }, [
        rcmPreview,
        rcmConfirmed,
        rcmAccountingSim,
        id,
        selectedCompany?._id,
        formData.gstType,
    ]);

    // Load existing posting when editing
    useEffect(() => {
        if (!id || !selectedCompany?._id) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const rows = await rcmApi.listPostings({ sourceVoucherId: id });
                if (!cancelled && rows?.length) {
                    const active = rows.find((r) => r.postingStatus === 'POSTED') || rows[0];
                    setRcmPostingResult({
                        status: active.postingStatus === 'REVERSED' ? 'REVERSED' : 'ALREADY_POSTED',
                        banner: active.postingStatus === 'POSTED'
                            ? 'RCM Liability Already Posted'
                            : 'RCM Liability Reversed',
                        posting: active,
                        alreadyPosted: active.postingStatus === 'POSTED',
                    });
                }
            } catch { /* ignore */ }
        })();
        return () => { cancelled = true; };
    }, [id, selectedCompany?._id]);

    const handlePostRcmLiability = async ({ confirmPost, checkboxAccepted, remarks }) => {
        const first = formData.items.find((i) => i.ledgerId && Number(i.amount) > 0);
        setRcmPostBusy(true);
        try {
            const result = await rcmApi.postLiability({
                decision: rcmPreview,
                rcmConfirmed: true,
                confirmPost,
                checkboxAccepted,
                remarks,
                companyId: selectedCompany?._id,
                financialYear: selectedFY?.name || selectedFY,
                sourceModule: 'ExpenseVoucher',
                sourceVoucherId: id,
                // Deterministic line id — do not use Date.now() / random on retry
                sourceLineId: first?.ledgerId
                    ? `line:${id}|${first.ledgerId}|0|${Number(rcmAccountingSim?.rcmLiability?.taxableValue) || 0}`
                    : 'header',
                lineIndex: 0,
                expenseLedgerName: first?.ledgerName,
                expensePurchaseLedgerName: first?.ledgerName,
                expensePurchaseLedgerId: first?.ledgerId,
                supplierName: formData.partyName,
                supplierId: formData.partyId,
                taxableValue: rcmAccountingSim?.rcmLiability?.taxableValue,
                gstType: formData.gstType,
                rate: rcmAccountingSim?.rcmLiability?.rate,
                placeOfSupply: formData.placeOfSupply,
                rcmCategory: rcmPreview?.rcmCategory || rcmQuestions.rcmCategory,
            });
            setRcmPostingResult(result);
        } catch (err) {
            const msg = err?.response?.data?.message || err?.message || 'RCM liability posting failed';
            window.alert(msg);
        } finally {
            setRcmPostBusy(false);
        }
    };

    const handleRecordRcmPayment = async (payload) => {
        const postingId = rcmPostingResult?.posting?._id || rcmPostingResult?.postingId;
        if (!postingId) {
            window.alert('No posted RCM liability found to pay.');
            return;
        }
        setRcmPaymentBusy(true);
        try {
            const result = await rcmApi.recordPayment(postingId, {
                ...payload,
                companyId: selectedCompany?._id,
                financialYear: selectedFY?.name || selectedFY,
            });
            setRcmPostingResult({
                ...rcmPostingResult,
                status: result.status || 'PAYMENT_RECORDED',
                banner: result.banner,
                message: result.message,
                posting: result.liability || result.posting || rcmPostingResult?.posting,
                payment: result.payment,
            });
        } catch (err) {
            window.alert(err?.response?.data?.message || err?.message || 'RCM tax payment failed');
        } finally {
            setRcmPaymentBusy(false);
        }
    };

    const refreshPostingAfterItc = (result) => {
        setRcmPostingResult({
            ...rcmPostingResult,
            status: result.status || rcmPostingResult?.status,
            banner: result.banner,
            message: result.message,
            posting: result.posting || result.liability || rcmPostingResult?.posting,
            itcRelease: result.release,
        });
    };

    const handleSaveItcReview = async (payload) => {
        const postingId = rcmPostingResult?.posting?._id || rcmPostingResult?.postingId;
        if (!postingId) return;
        setRcmItcBusy(true);
        try {
            const result = await rcmApi.saveItcReview(postingId, {
                ...payload,
                companyId: selectedCompany?._id,
            });
            refreshPostingAfterItc(result);
        } catch (err) {
            window.alert(err?.response?.data?.message || err?.message || 'ITC review failed');
            throw err;
        } finally {
            setRcmItcBusy(false);
        }
    };

    const handleReleaseItc = async (payload) => {
        const postingId = rcmPostingResult?.posting?._id || rcmPostingResult?.postingId;
        if (!postingId) return;
        setRcmItcBusy(true);
        try {
            await rcmApi.ensureLedgers({
                companyId: selectedCompany?._id,
                confirmCreate: true,
                includeInputLedgers: true,
            });
            const result = await rcmApi.releaseItc(postingId, {
                ...payload,
                companyId: selectedCompany?._id,
                financialYear: selectedFY?.name || selectedFY,
            });
            refreshPostingAfterItc(result);
        } catch (err) {
            window.alert(err?.response?.data?.message || err?.message || 'ITC release failed');
        } finally {
            setRcmItcBusy(false);
        }
    };

    const performSave = async (shouldClose, { tdsUserConfirmed = false, tdsPopupSkipped = false }) => {
        if (!formData.voucherTypeId) {
            throw new Error(
                'No active Expense Voucher series is configured for this company and financial year.',
            );
        }
        if (!toApiId(formData.partyId)) {
            throw new Error(
                'Expense Voucher requires a Supplier or Creditor. Use Payment Voucher for Bank or Cash payment.',
            );
        }
        const totals = calculateTotals(formData.items, formData.isGstEnabled, formData.gstType);
        const payload = {
            ...formData,
            nature: 'Expense',
            expenseType: 'Credit',
            partyId: toApiId(formData.partyId) || null,
            cashBankAccountId: null,
            items: formData.items.map((item) => ({
                ...item,
                ledgerId: toApiId(item.ledgerId) || null,
                type: item.type || 'Debit',
            })),
            tdsUserConfirmed,
            tdsPopupSkipped,
            expenseTdsSectionResolution: expenseTdsSectionResolutionRef.current || undefined,
            tdsLineOverrides: Object.values(tdsLineOverrides || {}).filter(
                (o) => o && o.expenseLedgerId && String(o.overrideReason || '').trim(),
            ),
        };

        if (isEdit) {
            await updateVoucher(id, payload);
            expenseTdsSectionResolutionRef.current = null;
            toast.success('Expense updated successfully');
            navigate(PATHS.ACCOUNTS.VOUCHERS);
        } else {
            const response = await createVoucher(payload);
            const savedNo = response?.data?.voucherNo || 'Voucher';
            toast.success(`${savedNo} saved successfully`);

            setFormData((prev) => ({
                ...INITIAL_FORM_STATE,
                date: prev.date,
                voucherTypeId: prev.voucherTypeId,
                expenseType: prev.expenseType,
                cashBankAccountId: prev.cashBankAccountId,
                items: [{ id: Date.now(), ledgerId: '', ledgerName: '', amount: 0, type: 'Debit', narration: '', hsnCode: '', gstRate: 0 }],
            }));

            if (shouldClose) {
                navigate(PATHS.ACCOUNTS.VOUCHER_LIST || PATHS.ACCOUNTS.VOUCHERS);
            }
        }
    };

    const confirmTdsAndSave = async () => {
        setIsSubmitting(true);
        try {
            await performSave(closeAfterSaveRef.current, { tdsUserConfirmed: true, tdsPopupSkipped: false });
            setTdsAlertOpen(false);
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error.response?.data?.message || 'Failed to save expense');
        } finally {
            setIsSubmitting(false);
        }
    };

    const skipTdsAndSave = async () => {
        setIsSubmitting(true);
        try {
            await performSave(closeAfterSaveRef.current, { tdsUserConfirmed: false, tdsPopupSkipped: true });
            setTdsAlertOpen(false);
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error.response?.data?.message || 'Failed to save expense');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSave = async (shouldClose = false) => {
        if (!formData.voucherTypeId) {
            return toast.error(
                'No active Expense Voucher series is configured for this company and financial year.',
            );
        }
        if (!formData.partyId) {
            return toast.error(
                'Expense Voucher requires a Supplier or Creditor. Use Payment Voucher for Bank or Cash payment.',
            );
        }

        if (formData.totalAmount <= 0) return toast.error('Total amount must be greater than zero');

        const invalidItem = formData.items.find((item) => !item.ledgerId || item.amount <= 0);
        if (invalidItem) return toast.error('All items must have a ledger and amount');

        const badExpenseHead = formData.items.find(
            (item) => item.ledgerId && !expenseLedgerOptions.some((o) => o.value === item.ledgerId),
        );
        if (badExpenseHead) {
            return toast.error('Expense Heads must use expense ledgers only (not Supplier / Creditor / Cash / Bank).');
        }

        setIsSubmitting(true);
        try {
            let preview = null;
            try {
                preview = await tdsComplianceApi.previewExpenseVoucher(buildExpenseTdsPreviewBody());
            } catch (pe) {
                const data = pe.response?.data;
                const msg =
                    (typeof data?.message === 'string' && data.message) ||
                    (typeof data?.error === 'string' && data.error) ||
                    (typeof pe.message === 'string' && pe.message) ||
                    (pe.code === 'ECONNABORTED'
                        ? 'TDS preview timed out — server took too long. Check backend logs ([tds] expense-voucher/preview) and database performance.'
                        : null);
                toast.error(msg || 'TDS preview failed — see browser Network tab for details.');
                return;
            }

            if (preview.sectionConflict?.message) {
                setTdsSectionConflict(preview.sectionConflict);
                setTdsSectionConflictOpen(true);
                closeAfterSaveRef.current = shouldClose;
                return;
            }

            if (preview.previewFailed && preview.previewErrorCode === 'TDS_PAYABLE_LEDGER_MISSING') {
                setPayableModalCtx({
                    code: preview.missingTdsSection || '',
                    name: preview.master?.sectionName || '',
                });
                setPayableModalIntro(
                    preview.previewErrorMessage
                        || `TDS payable ledger is not mapped for Section ${preview.missingTdsSection || ''}. Please create or select ledger.`,
                );
                setPayableModalOpen(true);
                return;
            }

            if (preview.previewFailed && preview.previewErrorMessage) {
                toast.error(preview.previewErrorMessage);
                return;
            }

            if (Array.isArray(preview.previewMessages) && preview.previewMessages.length > 0) {
                preview.previewMessages.forEach((m) => toast(m, { duration: 6500 }));
            }

            if (preview.blocked) {
                toast.error(preview.blockReason || 'TDS validation failed');
                return;
            }
            if (preview.engineActive && preview.decision?.panBlock) {
                toast.error('PAN is required for this TDS deduction — update Supplier Master or adjust the expense ledger.');
                return;
            }

            const d = preview.decision;
            if (preview.engineActive && d?.tdsApplicable && Number(d.tdsAmount || 0) > 0) {
                setTdsPreview(preview);
                closeAfterSaveRef.current = shouldClose;
                setTdsAlertOpen(true);
                return;
            }

            await performSave(shouldClose, { tdsUserConfirmed: false, tdsPopupSkipped: false });
        } catch (error) {
            console.error('Save error:', error);
            toast.error(error.response?.data?.message || 'Failed to save expense');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveAndNew = () => handleSave(false);
    const handleSaveAndClose = () => handleSave(true);

    const onUploadExpenseScan = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingScan(true);
        try {
            const d = await scanEntryApi.upload({ file, moduleType: 'expense_bill', financialYear: selectedFY });
            toast.success('Scan draft uploaded');
            navigate(PATHS.DOCUMENTS.SCAN_ENTRY_REVIEW(d?._id || d?.id));
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Scan upload failed');
        } finally {
            setUploadingScan(false);
            e.target.value = '';
        }
    };


    return (
        <VoucherEntryTallyLayout>
        <div style={{ padding: '28px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '1150px', margin: '0 auto' }}>
                <button onClick={() => navigate(PATHS.ACCOUNTS.VOUCHER_LIST || PATHS.ACCOUNTS.VOUCHERS)}
                    style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '13px', cursor: 'pointer', padding: 0, marginBottom: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    ← Back to Voucher Register
                </button>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ margin: '0 0 4px', fontSize: '26px', fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                            💸 {isEdit ? 'Edit Expense' : 'Expense Voucher'}
                        </h1>
                        <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Record business expenses with optional GST Input Credit</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {scanEntryEnabled && (
                            <label style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid #93c5fd', background: '#eff6ff', color: '#1d4ed8', cursor: uploadingScan ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 12, opacity: uploadingScan ? 0.7 : 1 }}>
                                {uploadingScan ? 'Uploading…' : 'Upload / Scan Expense Bill'}
                                <input type="file" accept=".pdf,image/*" onChange={onUploadExpenseScan} style={{ display: 'none' }} disabled={uploadingScan} />
                            </label>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#fff', padding: '8px 16px', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: formData.isGstEnabled ? '#8b5cf6' : '#64748b' }}>
                            {formData.isGstEnabled ? 'GST Enabled' : 'Simple Mode'}
                        </span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                name="isGstEnabled"
                                checked={formData.isGstEnabled}
                                onChange={handleHeaderChange}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                        </div>
                    </div>
                </div>

                <div style={{ pointerEvents: isSubmitting ? 'none' : 'auto', opacity: isSubmitting ? 0.7 : 1 }}>
                    
                    {/* Header Info */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
                            <div>
                                <span style={labelStyle}>Expense Voucher Series *</span>
                                <select
                                    name="voucherTypeId"
                                    value={formData.voucherTypeId}
                                    onChange={handleHeaderChange}
                                    disabled={voucherTypes.length <= 1}
                                    style={{
                                        ...inp,
                                        cursor: voucherTypes.length <= 1 ? 'default' : 'pointer',
                                        fontWeight: 600,
                                        background: voucherTypes.length <= 1 ? '#f8fafc' : '#fff',
                                    }}
                                >
                                    {!voucherTypes.length && (
                                        <option value="">No Expense series configured</option>
                                    )}
                                    {voucherTypes.map((v) => (
                                        <option key={v._id} value={v._id}>{v.name}{v.prefix ? ` (${v.prefix})` : ''}</option>
                                    ))}
                                </select>
                                {seriesPreview ? (
                                    <div style={{ marginTop: 6, fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                                        Next number preview: <span style={{ color: '#0f172a' }}>{seriesPreview}</span>
                                    </div>
                                ) : null}
                                {!voucherTypes.length ? (
                                    <div style={{ marginTop: 6, fontSize: 11, color: '#b91c1c', fontWeight: 600 }}>
                                        No active Expense Voucher series is configured for this company and financial year.
                                    </div>
                                ) : null}
                            </div>
                            <div>
                                <span style={labelStyle}>Voucher Date *</span>
                                <input type="date" name="date" value={formData.date} onChange={handleHeaderChange} style={{ ...inp, fontWeight: 600 }} />
                            </div>
                            
                             <div style={{ gridColumn: 'span 2' }}>
                                <span style={labelStyle}>Supplier / Creditor *</span>
                                <SearchableSelect
                                    options={creditorPartyOptions}
                                    value={formData.partyId}
                                    onChange={handleAccountChange}
                                    renderOption={(opt) => (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '2px 0' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{opt.label}</span>
                                                <span style={{ fontSize: '10px', background: '#fef2f2', color: '#dc2626', padding: '1px 8px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>
                                                    Supplier
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                                                <span>{opt.gstin ? `GSTIN: ${opt.gstin}` : 'Creditor ledger'}</span>
                                                <span style={{ fontWeight: 800, color: opt.balanceColor }}>
                                                    ₹{opt.balanceAbs.toLocaleString('en-IN')} {opt.balanceSide}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                    placeholder="Search Supplier / Creditor..."
                                    onCreateNew={(term) => handleQuickCreateLedger(term, 'header')}
                                />
                                <div style={{ marginTop: 8, fontSize: 11, color: '#64748b', lineHeight: 1.45 }}>
                                    Select the supplier or creditor against whom this expense bill is payable. Payment can be recorded separately through Payment Voucher.
                                </div>
                            </div>
                        </div>

                        {(formData.expenseType === 'Credit' || formData.isGstEnabled) && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginTop: '20px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                                <div>
                                    <span style={labelStyle}>Supplier Bill No</span>
                                    <input placeholder="INV-123" name="supplierBillNo" value={formData.supplierBillNo} onChange={handleHeaderChange} style={inp} />
                                </div>
                                <div>
                                    <span style={labelStyle}>Bill Date</span>
                                    <input type="date" name="supplierBillDate" value={formData.supplierBillDate} onChange={handleHeaderChange} style={inp} />
                                </div>
                                {formData.isGstEnabled && (
                                    <div>
                                        <span style={labelStyle}>GST Type *</span>
                                        <select name="gstType" value={formData.gstType} onChange={handleHeaderChange} style={{ ...inp, fontWeight: 700, color: '#4f46e5' }}>
                                            <option value="CGST / SGST">Intra-state (CGST/SGST)</option>
                                            <option value="IGST">Inter-state (IGST)</option>
                                        </select>
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b' }}>
                                    {formData.isGstEnabled ? <CheckCircle2 size={20} color="#10b981" /> : <FileText size={20} />}
                                    <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>
                                        {formData.isGstEnabled ? 'GST Invoice Mode' : 'Bill Booking Mode'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Entry Details */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '24px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Layers size={18} color="#6366f1" /> {formData.isGstEnabled ? 'TAXABLE EXPENSES' : 'EXPENSE HEADS (DR)'}
                            </h2>
                            <button type="button" onClick={addItem} style={{ padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Plus size={14} /> Add Line
                            </button>
                        </div>
                        
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                                    <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                                        <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Expense Ledger</th>
                                        {formData.isGstEnabled && <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, width: '120px' }}>HSN/SAC</th>}
                                        <th style={{ padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, width: '160px' }}>{formData.isGstEnabled ? 'Taxable Amt' : 'Amount'} (₹)</th>
                                        {formData.isGstEnabled && <th style={{ padding: '12px 10px', textAlign: 'right', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, width: '100px' }}>GST %</th>}
                                        <th style={{ padding: '12px 10px', textAlign: 'left', borderBottom: '2px solid #f1f5f9', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800 }}>Narration</th>
                                        <th style={{ padding: '12px 10px', borderBottom: '2px solid #f1f5f9', width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {formData.items.map((item) => (
                                        <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <td style={{ padding: '12px 10px' }}>
                                                <SearchableSelect
                                                    options={expenseLedgerOptions}
                                                    renderOption={(opt) => (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '2px 0' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{opt.label}</span>
                                                                <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '1px 8px', borderRadius: '4px', fontWeight: 700, textTransform: 'uppercase' }}>{opt.group}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', color: '#64748b' }}>
                                                                <span>Expense Head</span>
                                                                <span style={{ fontWeight: 800, color: opt.balance >= 0 ? '#10b981' : '#ef4444' }}>
                                                                    ₹{Math.abs(opt.balance).toLocaleString('en-IN')} {opt.balance >= 0 ? 'Dr' : 'Cr'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    value={item.ledgerId}
                                                    onChange={(val) => handleItemChange(item.id, 'ledgerId', val)}
                                                    placeholder="Select Expense..."
                                                    onCreateNew={(term) => handleQuickCreateLedger(term, `item-${item.id}`)}
                                                />
                                            </td>
                                            {formData.isGstEnabled && (
                                                <td style={{ padding: '12px 10px' }}>
                                                    <input placeholder="Code" value={item.hsnCode} onChange={(e) => handleItemChange(item.id, 'hsnCode', e.target.value)} style={inp} />
                                                </td>
                                            )}
                                            <td style={{ padding: '12px 10px' }}>
                                                <input
                                                    type="number"
                                                    min="0.01" step="0.01"
                                                    placeholder="0.00"
                                                    value={item.amount || ''}
                                                    onChange={(e) => handleItemChange(item.id, 'amount', Number(e.target.value))}
                                                    style={{ ...inp, fontWeight: 900, color: '#0f172a', textAlign: 'right' }}
                                                />
                                            </td>
                                            {formData.isGstEnabled && (
                                                <td style={{ padding: '12px 10px' }}>
                                                    <select 
                                                        value={item.gstRate} 
                                                        onChange={(e) => handleItemChange(item.id, 'gstRate', Number(e.target.value))} 
                                                        style={{ ...inp, fontWeight: 700, textAlign: 'center' }}
                                                    >
                                                        <option value="0">0%</option>
                                                        <option value="5">5%</option>
                                                        <option value="12">12%</option>
                                                        <option value="18">18%</option>
                                                        <option value="28">28%</option>
                                                    </select>
                                                </td>
                                            )}
                                            <td style={{ padding: '12px 10px' }}>
                                                <input
                                                    placeholder="Remarks"
                                                    value={item.narration}
                                                    onChange={(e) => handleItemChange(item.id, 'narration', e.target.value)}
                                                    style={inp}
                                                />
                                            </td>
                                            <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                                                {formData.items.length > 1 && (
                                                    <button type="button" onClick={() => removeItem(item.id)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Phase 2A — RCM / GST treatment preview (no posting) */}
                        <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                            <RcmPreviewPanel
                                result={rcmPreview}
                                loading={rcmLoading}
                                canOverride={canOverrideRcm}
                                onOverride={(ov) => {
                                    if (!ov?.finalTreatment || !String(ov.reason || '').trim()) {
                                        toast.error('Override requires final treatment and a reason.');
                                        return;
                                    }
                                    setRcmOverride({
                                        finalTreatment: ov.finalTreatment,
                                        reason: String(ov.reason).trim(),
                                        at: new Date().toISOString(),
                                    });
                                    toast.success('Override applied — refreshing RCM preview…');
                                }}
                                onQuestionChange={(key, value) => setRcmQuestions((q) => ({ ...q, [key]: value }))}
                                questions={[
                                    {
                                        key: 'rcmCategory',
                                        label: 'RCM Category',
                                        type: 'select',
                                        value: rcmQuestions.rcmCategory,
                                        options: ['RENT', 'GTA', 'COURIER', 'LEGAL', 'SECURITY', 'GENERAL', 'OTHER'],
                                    },
                                    {
                                        key: 'propertyType',
                                        label: 'Property type (Rent)',
                                        type: 'select',
                                        value: rcmQuestions.propertyType,
                                        options: ['Commercial', 'Residential', 'Mixed', 'Other', 'Transaction-wise'],
                                    },
                                    {
                                        key: 'transportServiceType',
                                        label: 'Transport service type',
                                        type: 'select',
                                        value: rcmQuestions.transportServiceType,
                                        options: [
                                            'GTA with consignment note',
                                            'Courier',
                                            'Local Transport',
                                            'Local vehicle hire',
                                            'Parcel service',
                                            'Goods transport without GTA conditions',
                                            'Other transport',
                                        ],
                                    },
                                    {
                                        key: 'supplierGstOption',
                                        label: 'Supplier tax option',
                                        type: 'select',
                                        value: rcmQuestions.supplierGstOption,
                                        options: ['Forward Charge', 'Reverse Charge', 'Exempt / Not Applicable', 'Transaction-wise', 'Unknown'],
                                    },
                                    {
                                        key: 'supplierGstCharged',
                                        label: 'GST charged on this transaction?',
                                        type: 'yesno',
                                        value: rcmQuestions.supplierGstCharged,
                                    },
                                    {
                                        key: 'consignmentNoteAvailable',
                                        label: 'Consignment note available?',
                                        type: 'yesno',
                                        value: rcmQuestions.consignmentNoteAvailable,
                                    },
                                ]}
                            />
                            {linkedSupplierProfile?.ambiguous ? (
                                <div style={{ marginTop: 8, fontSize: 12, color: '#b45309' }}>
                                    Multiple suppliers link to this creditor ledger — select the correct Supplier Master before confirming RCM.
                                </div>
                            ) : null}
                            <RcmAccountingPreviewPanel
                                simulation={rcmAccountingSim}
                                loading={rcmSimLoading}
                                rcmConfirmed={rcmConfirmed}
                                onConfirmChange={setRcmConfirmed}
                                canConfirm={canOverrideRcm}
                                canPost={canPostRcm}
                                canRecordPayment={canRecordRcmPayment}
                                canReviewItc={canReviewRcmItc}
                                canReleaseItc={canReleaseRcmItc}
                                postingEligibility={rcmPostingEligibility}
                                postingResult={rcmPostingResult}
                                sourceVoucherId={id || null}
                                sourceSummary={{
                                    voucherNumber: formData.voucherNo || id,
                                    supplierName: formData.partyName,
                                    ledgerName: formData.items.find((i) => i.ledgerId)?.ledgerName,
                                    taxPeriod: formData.date,
                                }}
                                postBusy={rcmPostBusy}
                                paymentBusy={rcmPaymentBusy}
                                itcBusy={rcmItcBusy}
                                onPostLiability={handlePostRcmLiability}
                                onRecordPayment={handleRecordRcmPayment}
                                onSaveItcReview={handleSaveItcReview}
                                onReleaseItc={handleReleaseItc}
                            />
                        </div>

                        {/* Line-wise TDS suggestion panel (master-driven; not hard-coded rates) */}
                        <div style={{ marginTop: 20, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    TDS by expense line {tdsPreviewLoading ? '(refreshing…)' : ''}
                                </h3>
                                <button type="button" onClick={refreshTdsLivePreview} style={{ fontSize: 11, fontWeight: 700, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#5b21b6', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>
                                    Refresh TDS
                                </button>
                            </div>
                            {!formData.partyId ? (
                                <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Select a Party (supplier) to preview line-wise TDS.</p>
                            ) : !(tdsPreview?.tdsLines?.length) ? (
                                <div style={{ fontSize: 12, color: '#64748b' }}>
                                    <p style={{ margin: '0 0 8px' }}>
                                        {tdsPreview?.previewErrorMessage || 'No TDS-applicable expense ledgers on this voucher yet (enable TDS + section on Ledger Master).'}
                                    </p>
                                    {tdsPreview?.previewErrorMessage && /not mapped|194I|TDS Section|not set up for TDS/i.test(tdsPreview.previewErrorMessage) ? (
                                        <a
                                            href={PATHS.ACCOUNT_MASTER.LEDGER_MASTER}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                display: 'inline-block',
                                                fontWeight: 700,
                                                color: '#5b21b6',
                                                background: '#f5f3ff',
                                                border: '1px solid #ddd6fe',
                                                borderRadius: 6,
                                                padding: '6px 12px',
                                                textDecoration: 'none',
                                            }}
                                        >
                                            Open Rent Ledger TDS Setup
                                        </a>
                                    ) : null}
                                </div>
                            ) : (
                                <>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 1100 }}>
                                            <thead>
                                                <tr style={{ background: '#f5f3ff', color: '#5b21b6', textAlign: 'left' }}>
                                                    <th style={{ padding: 6 }}>Expense Ledger</th>
                                                    <th style={{ padding: 6 }}>Taxable</th>
                                                    <th style={{ padding: 6 }}>TDS Appl.</th>
                                                    <th style={{ padding: 6 }}>Nature</th>
                                                    <th style={{ padding: 6 }}>Section</th>
                                                    <th style={{ padding: 6 }}>FY 2026-27 mapping</th>
                                                    <th style={{ padding: 6 }}>Constitution</th>
                                                    <th style={{ padding: 6 }}>Threshold</th>
                                                    <th style={{ padding: 6 }}>Rate</th>
                                                    <th style={{ padding: 6 }}>TDS Base</th>
                                                    <th style={{ padding: 6 }}>TDS Amt</th>
                                                    <th style={{ padding: 6 }}>Override reason</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {tdsPreview.tdsLines.map((line, idx) => {
                                                    const lid = String(line.expenseLedgerId || idx);
                                                    const ov = tdsLineOverrides[lid] || {};
                                                    return (
                                                        <tr key={lid} style={{ borderTop: '1px solid #ede9fe', verticalAlign: 'top' }}>
                                                            <td style={{ padding: 6, fontWeight: 700 }}>{line.expenseLedgerName || '—'}</td>
                                                            <td style={{ padding: 6 }}>₹{Number(line.tdsBase || 0).toLocaleString('en-IN')}</td>
                                                            <td style={{ padding: 6 }}>{line.tdsApplicable || line.tdsAmount > 0 ? 'Yes' : 'No'}</td>
                                                            <td style={{ padding: 6 }}>
                                                                <select
                                                                    value={ov.tdsNature ?? line.tdsNature ?? ''}
                                                                    onChange={(e) => setTdsLineOverrides((p) => ({
                                                                        ...p,
                                                                        [lid]: {
                                                                            expenseLedgerId: line.expenseLedgerId,
                                                                            tdsNature: e.target.value,
                                                                            section: ov.section ?? line.section,
                                                                            rate: ov.rate,
                                                                            overrideReason: ov.overrideReason || '',
                                                                        },
                                                                    }))}
                                                                    style={{ ...inp, padding: '4px 6px', fontSize: 11 }}
                                                                >
                                                                    <option value={line.tdsNature || ''}>{line.tdsNature || '—'}</option>
                                                                    {['Contractor', 'Professional Services', 'Technical Services', 'Rent', 'Commission', 'Interest']
                                                                        .filter((n) => n !== line.tdsNature)
                                                                        .map((n) => <option key={n} value={n}>{n}</option>)}
                                                                </select>
                                                            </td>
                                                            <td style={{ padding: 6 }}>
                                                                <input
                                                                    value={ov.section ?? line.sectionDisplay ?? line.section ?? ''}
                                                                    onChange={(e) => setTdsLineOverrides((p) => ({
                                                                        ...p,
                                                                        [lid]: {
                                                                            expenseLedgerId: line.expenseLedgerId,
                                                                            tdsNature: ov.tdsNature ?? line.tdsNature,
                                                                            section: e.target.value.split('/')[0].trim(),
                                                                            rate: ov.rate,
                                                                            overrideReason: ov.overrideReason || '',
                                                                        },
                                                                    }))}
                                                                    style={{ ...inp, padding: '4px 6px', fontSize: 11, minWidth: 90 }}
                                                                    title="Override section (e.g. 194C)"
                                                                />
                                                            </td>
                                                            <td style={{ padding: 6, maxWidth: 160 }}>{line.section393Label || '—'}</td>
                                                            <td style={{ padding: 6 }}>{line.supplierConstitution || tdsPreview.supplier?.deducteeConstitution || '—'}</td>
                                                            <td style={{ padding: 6, fontSize: 10, lineHeight: 1.35 }}>
                                                                Prev ₹{Number(line.previousAggregate || 0).toLocaleString('en-IN')}<br />
                                                                Curr ₹{Number(line.currentTransaction || 0).toLocaleString('en-IN')}<br />
                                                                New ₹{Number(line.newAggregate || 0).toLocaleString('en-IN')}<br />
                                                                Single ₹{Number(line.singleBillThreshold || 0).toLocaleString('en-IN')} / Annual ₹{Number(line.annualThreshold || 0).toLocaleString('en-IN')}<br />
                                                                Crossed: <strong>{line.thresholdCrossed ? 'Yes' : 'No'}</strong>
                                                            </td>
                                                            <td style={{ padding: 6 }}>
                                                                <input
                                                                    type="number"
                                                                    step="0.01"
                                                                    value={ov.rate != null ? ov.rate : (line.rate ?? '')}
                                                                    onChange={(e) => setTdsLineOverrides((p) => ({
                                                                        ...p,
                                                                        [lid]: {
                                                                            expenseLedgerId: line.expenseLedgerId,
                                                                            tdsNature: ov.tdsNature ?? line.tdsNature,
                                                                            section: ov.section ?? line.section,
                                                                            rate: Number(e.target.value),
                                                                            overrideReason: ov.overrideReason || '',
                                                                        },
                                                                    }))}
                                                                    style={{ ...inp, padding: '4px 6px', fontSize: 11, width: 64 }}
                                                                />%
                                                            </td>
                                                            <td style={{ padding: 6 }}>₹{Number(line.tdsBase || 0).toLocaleString('en-IN')}</td>
                                                            <td style={{ padding: 6, fontWeight: 800, color: '#7c3aed' }}>₹{Number(line.tdsAmount || 0).toLocaleString('en-IN')}</td>
                                                            <td style={{ padding: 6 }}>
                                                                <input
                                                                    placeholder="Required to apply override"
                                                                    value={ov.overrideReason || ''}
                                                                    onChange={(e) => setTdsLineOverrides((p) => ({
                                                                        ...p,
                                                                        [lid]: {
                                                                            expenseLedgerId: line.expenseLedgerId,
                                                                            tdsNature: ov.tdsNature ?? line.tdsNature,
                                                                            section: ov.section ?? line.section,
                                                                            rate: ov.rate,
                                                                            overrideReason: e.target.value,
                                                                        },
                                                                    }))}
                                                                    style={{ ...inp, padding: '4px 6px', fontSize: 11, minWidth: 120 }}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    {(tdsPreview.tdsLines || []).map((line, i) => (
                                        line.rateReason ? (
                                            <p key={`rr-${i}`} style={{ margin: '6px 0 0', fontSize: 11, color: '#475569' }}>• {line.rateReason}</p>
                                        ) : null
                                    ))}
                                    {(tdsPreview.tdsLines || []).map((line, i) => (
                                        line.tdsApplicableReason ? (
                                            <p key={`ar-${i}`} style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>• {line.expenseLedgerName}: {line.tdsApplicableReason}</p>
                                        ) : null
                                    ))}
                                    {(() => {
                                        const lines = tdsPreview.tdsLines || [];
                                        const gross = formData.isGstEnabled ? formData.grandTotal : formData.totalAmount;
                                        const totalTds = lines.reduce((s, l) => s + (Number(l.tdsAmount) || 0), 0);
                                        return (
                                            <div style={{ marginTop: 12, padding: 10, background: '#f8fafc', borderRadius: 8, fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                                                <span>Gross expense: <strong>₹{Number(gross || 0).toLocaleString('en-IN')}</strong></span>
                                                {lines.map((l, i) => (
                                                    <span key={i}>{l.tdsNature || l.section}: <strong>₹{Number(l.tdsAmount || 0).toLocaleString('en-IN')}</strong></span>
                                                ))}
                                                <span>Total TDS: <strong style={{ color: '#7c3aed' }}>₹{totalTds.toLocaleString('en-IN')}</strong></span>
                                                <span>Net supplier payable: <strong>₹{Math.max(0, Number(gross || 0) - totalTds).toLocaleString('en-IN')}</strong></span>
                                            </div>
                                        );
                                    })()}
                                </>
                            )}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>
                        <div>
                            <span style={labelStyle}>Overall Voucher Narration</span>
                            <textarea
                                placeholder="Details about this expense (shown in reports)..."
                                name="narration"
                                value={formData.narration}
                                onChange={handleHeaderChange}
                                style={{ ...inp, minHeight: '80px', resize: 'none' }}
                            />
                        </div>

                        {formData.isGstEnabled ? (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                        <span>Sub-total (Taxable)</span>
                                        <span style={{ fontWeight: 600 }}>₹{(isRcmReverseCharge ? (rcmLiabilitySummary?.taxableValue ?? formData.totalTaxableAmount) : formData.totalTaxableAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    {isRcmReverseCharge && rcmLiabilitySummary ? (
                                        <>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                                <span>Supplier Payable</span>
                                                <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{rcmLiabilitySummary.supplierPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div style={{ marginTop: 4, padding: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8 }}>
                                                <div style={{ fontSize: 11, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', marginBottom: 6 }}>RCM Liability Summary (not in supplier payable)</div>
                                                {formData.gstType === 'CGST / SGST' ? (
                                                    <>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9a3412' }}>
                                                            <span>RCM CGST Liability</span>
                                                            <span style={{ fontWeight: 650 }}>₹{rcmLiabilitySummary.rcmCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9a3412' }}>
                                                            <span>RCM SGST Liability</span>
                                                            <span style={{ fontWeight: 650 }}>₹{rcmLiabilitySummary.rcmSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9a3412' }}>
                                                        <span>RCM IGST Liability</span>
                                                        <span style={{ fontWeight: 650 }}>₹{rcmLiabilitySummary.rcmIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9a3412', marginTop: 4 }}>
                                                    <span>RCM Total</span>
                                                    <span style={{ fontWeight: 700 }}>₹{rcmLiabilitySummary.rcmTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                                <div style={{ fontSize: 11, color: '#b45309', marginTop: 6 }}>Payment Status: Not Posted / Pending</div>
                                                <div style={{ fontSize: 11, color: '#b45309' }}>ITC Status: Not Available Yet</div>
                                                <div style={{ fontSize: 10, color: '#78716c', marginTop: 4 }}>Ordinary Input GST is not claimed at expense-entry stage.</div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', margin: '8px -20px -20px', padding: '16px 20px', borderRadius: '0 0 16px 16px' }}>
                                                <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>Supplier Payable</span>
                                                <span style={{ color: '#fff', fontSize: '24px', fontWeight: 900 }}>₹{Math.round(rcmLiabilitySummary.supplierPayable).toLocaleString('en-IN')}</span>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            {formData.gstType === 'CGST / SGST' ? (
                                                <>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                                        <span>Input CGST</span>
                                                        <span style={{ fontWeight: 600 }}>₹{formData.totalCgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                                        <span>Input SGST</span>
                                                        <span style={{ fontWeight: 600 }}>₹{formData.totalSgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b' }}>
                                                    <span>Input IGST</span>
                                                    <span style={{ fontWeight: 600 }}>₹{formData.totalIgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                                                <span>Round Off</span>
                                                <span>{formData.roundOff >= 0 ? '+' : ''}{formData.roundOff.toFixed(2)}</span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', margin: '8px -20px -20px', padding: '16px 20px', borderRadius: '0 0 16px 16px' }}>
                                                <span style={{ color: '#94a3b8', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>Grand Total</span>
                                                <span style={{ color: '#fff', fontSize: '24px', fontWeight: 900 }}>₹{formData.grandTotal.toLocaleString('en-IN')}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: '#0f172a', color: '#fff', padding: '24px', borderRadius: '16px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center' }}>
                                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Amount</span>
                                <span style={{ fontSize: '32px', fontWeight: 900, color: '#fca5a5', letterSpacing: '-0.02em' }}>₹{formData.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '14px', justifyContent: 'flex-end', marginTop: '36px' }}>
                        <button type="button" onClick={() => { if (window.confirm('Discard changes?')) navigate(-1); }}
                            style={{ padding: '12px 28px', borderRadius: '10px', background: '#fff', color: '#64748b', border: '1.5px solid #e2e8f0', cursor: 'pointer', fontWeight: 700 }}>
                            Discard
                        </button>
                        <button type="button" onClick={handleSaveAndClose} disabled={isSubmitting}
                            style={{ padding: '12px 28px', borderRadius: '10px', background: '#f8fafc', color: '#475569', border: '1.5px solid #e2e8f0', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                            Save & Close
                        </button>
                        <button type="button" onClick={handleSaveAndNew} disabled={isSubmitting}
                            style={{ padding: '12px 40px', borderRadius: '10px', background: isSubmitting ? '#9ca3af' : 'linear-gradient(135deg,#4f46e5,#3730a3)', color: '#fff', border: 'none', cursor: isSubmitting ? 'not-allowed' : 'pointer', fontWeight: 800, fontSize: '15px', boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.3)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Save size={18} />
                            {isSubmitting ? 'Posting...' : (isEdit ? 'Update Expense' : 'Post & New Entry')}
                        </button>
                    </div>
                </div>
            </div>

            {tdsSectionConflictOpen && tdsSectionConflict && (
                <div
                    role="presentation"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15,23,42,0.5)',
                        zIndex: 1250,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 16,
                    }}
                    onClick={() => !isSubmitting && setTdsSectionConflictOpen(false)}
                >
                    <div
                        role="dialog"
                        aria-labelledby="tds-section-conflict-title"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#fff',
                            borderRadius: 14,
                            maxWidth: 500,
                            width: '100%',
                            padding: '24px 26px',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                            border: '1px solid #e2e8f0',
                        }}
                    >
                        <h3 id="tds-section-conflict-title" style={{ margin: '0 0 12px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                            TDS section mismatch
                        </h3>
                        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#475569', lineHeight: 1.55 }}>
                            {tdsSectionConflict.message}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => {
                                    expenseTdsSectionResolutionRef.current = 'EXPENSE_LEDGER';
                                    setTdsSectionConflictOpen(false);
                                    setTdsSectionConflict(null);
                                    handleSave(closeAfterSaveRef.current);
                                }}
                                style={{
                                    padding: '12px 16px',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: 'linear-gradient(135deg,#4f46e5,#4338ca)',
                                    color: '#fff',
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                }}
                            >
                                Use expense ledger section {tdsSectionConflict.expenseSection}
                            </button>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => {
                                    expenseTdsSectionResolutionRef.current = 'SUPPLIER_DEFAULT';
                                    setTdsSectionConflictOpen(false);
                                    setTdsSectionConflict(null);
                                    handleSave(closeAfterSaveRef.current);
                                }}
                                style={{
                                    padding: '12px 16px',
                                    borderRadius: 10,
                                    border: '1.5px solid #cbd5e1',
                                    background: '#f8fafc',
                                    color: '#334155',
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                }}
                            >
                                Use supplier default section {tdsSectionConflict.supplierSection}
                            </button>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => {
                                    expenseTdsSectionResolutionRef.current = null;
                                    setTdsSectionConflictOpen(false);
                                    setTdsSectionConflict(null);
                                }}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: 10,
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#64748b',
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                }}
                            >
                                Cancel — edit ledger or supplier mapping
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <TdsLiabilityAlertModal
                open={tdsAlertOpen}
                supplierName={tdsPreview?.supplier?.supplierName || formData.partyName}
                decision={tdsPreview?.decision}
                master={tdsPreview?.master}
                tdsLines={tdsPreview?.tdsLines}
                onYes={confirmTdsAndSave}
                onNo={skipTdsAndSave}
                loading={isSubmitting}
            />
            <TdsPayableLedgerModal
                open={payableModalOpen}
                sectionCode={payableModalCtx.code}
                sectionName={payableModalCtx.name}
                introText={payableModalIntro}
                primaryButtonLabel="Create Ledger Now"
                onClose={() => setPayableModalOpen(false)}
                onSuccess={() => {
                    setPayableModalOpen(false);
                    toast.success('TDS Payable ledger mapped. Click Post again to continue.');
                }}
            />
        </div>
        </VoucherEntryTallyLayout>
    );
};

export default ExpenseEntryPage;
