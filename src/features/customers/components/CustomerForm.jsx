import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useForm, useFieldArray } from 'react-hook-form';
import { Button, Input } from '@/components/ui';
import { Plus, Trash2, Star, MapPin, Loader2 } from 'lucide-react';
import { INDIAN_STATES } from '@/utils/constants';
import { getCustomerTypes, generateCustomerCode } from '@/services/customerApi';
import { listCustomerTypeMaster } from '@/services/sundryDebtorSettingsApi';
import { useFeatureConfiguration } from '@/hooks/useFeatureConfiguration';
import { useCustomerTemplateFieldSettings } from '@/hooks/useCustomerTemplateFieldSettings';
import { useDocumentsKycTemplateSettings } from '@/hooks/useDocumentsKycTemplateSettings';
import { computeCustomerDueDays } from '@/constants/customerMasterTemplateFields';
import { getStickers } from '@/services/stickerApi';
import { fetchGeocodeAddress } from '@/services/locationApi';
import { AddStickerModal } from './AddStickerModal';
import { AddCustomerTypeModal } from './AddCustomerTypeModal';
import { MultiSelect } from '@/components/ui';
import { useToast } from '@/components/ui/Toast';
import { getDistributors } from '@/services/distributorApi';
import { getUsers } from '@/services/userApi';
import { useAuth } from '@/hooks/useAuth';
import { useCompany } from '@/contexts/CompanyContext';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { listCustomerDocuments } from '@/services/customerDocumentApi';
import { CUSTOMER_FORM_TABS } from '@/config/customerKyc.config';
import { CustomerGstTaxTab, CustomerBankingTab, CustomerExportTab } from './CustomerKycTabSections';
import { CustomerDocumentsKycTab } from './CustomerDocumentsKycTab';
import api from '@/services/api';
import MasterAlterationImpactModal from '@/components/masters/MasterAlterationImpactModal';
import MasterUsagePanel from '@/components/masters/MasterUsagePanel';
import styles from './CustomerForm.module.scss';

/**
 * CustomerForm component for creating and editing customers
 * @param {Object} props
 * @param {Object} props.customer - Existing customer data (for edit mode)
 * @param {Function} props.onSubmit - Form submission handler
 * @param {Function} props.onCancel - Cancel handler
 * @param {boolean} props.isSubmitting - Loading state
 */
export const CustomerForm = ({ customer, onSubmit, onCancel, isSubmitting = false }) => {
    const navigate = useNavigate();
    const [isCustomType, setIsCustomType] = useState(false);
    const [dynamicCustomerTypes, setDynamicCustomerTypes] = useState([
        { value: '', label: '-- Select Type --' },
        { value: 'led_light_manufacturer', label: 'LED Light Manufacturer' },
        { value: 'led_light_showroom', label: 'LED Light Showroom' },
        { value: 'home_automation_provider', label: 'Home Automation' },
        { value: 'interior_designer', label: 'Interior Designer' },
        { value: 'builders', label: 'Builders' },
        { value: 'dealer', label: 'Dealer' },
        { value: 'distributor', label: 'Distributor' }
    ]);
    const [dynamicStickers, setDynamicStickers] = useState([]);
    const [showAddSticker, setShowAddSticker] = useState(false);
    const [salesTeam, setSalesTeam] = useState([]);
    const [distributors, setDistributors] = useState([]);
    const { isEnabled, registry, settings, refreshAll } = useFeatureConfiguration();
    const { hasPermission } = useAuth();
    const { selectedCompany } = useCompany();
    const { fieldCtrl } = useCustomerTemplateFieldSettings(selectedCompany?._id, isEnabled);
    const { docCtrl: customerDocCtrl } = useDocumentsKycTemplateSettings(selectedCompany?._id, 'customer', isEnabled, fieldCtrl);
    const { selectedFYObject } = useFinancialYear();
    const [activeTab, setActiveTab] = useState('basic');
    const [kycDocuments, setKycDocuments] = useState([]);

    const showGstTaxTab = fieldCtrl.isVisible('gstNumber') || fieldCtrl.isVisible('panNumber') || fieldCtrl.isVisible('tanNumber')
        || fieldCtrl.isVisible('msmeNumber') || fieldCtrl.isVisible('iecNumber')
        || isEnabled('customer.gstRegistrationType') || isEnabled('customer.gstState') || isEnabled('customer.placeOfSupply')
        || isEnabled('customer.cinNumber') || isEnabled('customer.tcsApplicable');
    const showBankingTab = fieldCtrl.anyVisibleInGroup('banking') || isEnabled('customer.bankDetails');
    const showExportTab = fieldCtrl.anyVisibleInGroup('export') || isEnabled('customer.exportDetails');
    const showDocumentsTab = customerDocCtrl.anyVisible() || fieldCtrl.anyVisibleInGroup('document') || isEnabled('customer.documentsKyc');
    const hideGstInBusiness = showGstTaxTab;

    const visibleTabs = useMemo(() => CUSTOMER_FORM_TABS.filter((t) => {
        if (t.id === 'basic') return true;
        if (t.id === 'gstTax') return showGstTaxTab;
        if (t.id === 'banking') return showBankingTab;
        if (t.id === 'export') return showExportTab;
        if (t.id === 'documents') return showDocumentsTab;
        return false;
    }), [showGstTaxTab, showBankingTab, showExportTab, showDocumentsTab]);

    const docPerms = useMemo(() => ({
        canView: hasPermission('customers.customer_documents.view'),
        canUpload: hasPermission('customers.customer_documents.upload'),
        canDelete: hasPermission('customers.customer_documents.delete'),
        canDownload: hasPermission('customers.customer_documents.download'),
        canScan: hasPermission('customers.customer_documents.scan'),
    }), [hasPermission]);

    const refreshKycDocuments = async () => {
        if (!customer?._id || !docPerms.canView) return;
        try {
            const list = await listCustomerDocuments(customer._id);
            setKycDocuments(list);
        } catch {
            setKycDocuments([]);
        }
    };

    useEffect(() => {
        refreshAll?.();
    }, [refreshAll]);

    useEffect(() => {
        refreshKycDocuments();
    }, [customer?._id, docPerms.canView]);

    useEffect(() => {
        const ids = visibleTabs.map((t) => t.id);
        if (!ids.includes(activeTab)) setActiveTab('basic');
    }, [visibleTabs, activeTab]);
    const industryFieldDefs = useMemo(() => {
        const custom = settings?.featureEngine?.customDefinitions || [];
        const fromReg = (registry || []).filter((r) => r.category === 'industry' && r.module === 'customer');
        const merged = [...fromReg, ...custom.filter((c) => c.category === 'industry' || c.module === 'customer')];
        const seen = new Set();
        return merged.filter((d) => {
            if (!d?.featureKey || seen.has(d.featureKey)) return false;
            seen.add(d.featureKey);
            return true;
        });
    }, [registry, settings]);
    const visibleIndustryFields = industryFieldDefs.filter((d) => isEnabled(d.featureKey));
    const [masterCustomerTypes, setMasterCustomerTypes] = useState([]);
    const [showAddCustomerType, setShowAddCustomerType] = useState(false);
    // Normalize customer data for form display
    const normalizeCustomerData = (customerData) => {
        console.log('🔄 Normalizing customer data:', customerData);

        if (!customerData) {
            console.log('⚠️ No customer data provided, using defaults');
            return {
                customerName: '',
                company: '',
                companyBrand: '',
                companyEmail: '',
                customerType: '',
                stickers: [],
                city: '',
                district: '',
                taluka: '',
                state: '',
                country: 'India',
                address: '',
                pincode: '',
                status: 'lead',
                notes: '',
                tags: [],
                gstNumber: '',
                gstType: '',
                gstRegistrationType: '',
                customerActivityType: '',
                exportCountry: '',
                contactPersons: [
                    {
                        name: '',
                        mobile: '',
                        mobile2: '',
                        mobile3: '',
                        mobile4: '',
                        mobile5: '',
                        email: '',
                        isPrimary: true,
                    }
                ],
                creditPeriod: 0,
                gracePeriodDays: 0,
                creditLimit: 0,
                creditLimitAction: 'Warn',
                paymentType: 'Credit',
                paymentTerms: '',
                tcsApplicable: false,
                tcsSection: '',
                tcsRate: 0,
                tcsThresholdLimit: 0,
                panAvailable: false,
                openingBalance: 0,
                drCr: 'Dr',
                billWiseTracking: false,
                interestApplicable: false,
                collectionPersonId: '',
                assignedSalesperson: '',
                riskCategory: '',
                creditRemarks: '',
                msmeApplicable: false,
                msmeRegNo: '',
                msmeCategory: '',
                panNumber: '',
                tanNumber: '',
                cinNumber: '',
                iecNumber: '',
                gstState: '',
                defaultPlaceOfSupply: '',
                bankName: '',
                bankBranch: '',
                bankAccountNumber: '',
                bankIfsc: '',
                bankSwift: '',
                bankUpi: '',
                exportBuyerCode: '',
                exportPort: '',
                exportCurrency: '',
                exportLcTerms: '',
                exportPaymentTerms: '',
                isExportCustomer: false,
            };

        }

        const normalized = {
            customerName: customerData.customerName || customerData.name || '',
            company: customerData.company || '',
            companyBrand: customerData.companyBrand || '',
            companyEmail: customerData.companyEmail || '',
            website: customerData.website || '',
            customerType: customerData.customerType || '',
            stickers: Array.isArray(customerData.stickers) ? customerData.stickers.map(s => s._id || s) : [],
            city: customerData.area || customerData.city || '',
            district: customerData.district || '',
            taluka: customerData.taluka || '',
            state: (() => {
                if (!customerData.state) return '';
                const stateStr = String(customerData.state).trim();
                const matchedState = INDIAN_STATES.find(
                    s => s.toLowerCase() === stateStr.toLowerCase()
                );
                return matchedState || stateStr;
            })(),
            address: customerData.address || '',
            additionalAddress: customerData.additionalAddress || '',
            pincode: customerData.pincode || '',
            country: customerData.country || 'India',
            status: customerData.status || customerData.customerStatus || 'lead',
            notes: customerData.notes || '',
            tags: Array.isArray(customerData.tags) ? customerData.tags.join(', ') : '',
            gstNumber: customerData.gstNumber || '',
            gstType: customerData.gstType || (customerData.state ? (String(customerData.state).trim().toLowerCase() === 'maharashtra' ? 'CGST / SGST' : 'IGST') : ''),
            gstRegistrationType: customerData.gstRegistrationType || (customerData.gstNumber ? 'Registered' : 'Consumer'),
            customerActivityType: customerData.customerActivityType || '',
            exportCountry: customerData.exportCountry || '',
            customerCode: customerData.customerCode || '',
            contactPersons: Array.isArray(customerData.contactPersons) && customerData.contactPersons.length > 0
                ? customerData.contactPersons.map(contact => ({
                    name: contact.name || '',
                    mobile: contact.mobile || '',
                    mobile2: contact.mobile2 || '',
                    mobile3: contact.mobile3 || '',
                    mobile4: contact.mobile4 || '',
                    mobile5: contact.mobile5 || '',
                    email: contact.email || '',
                    isPrimary: contact.isPrimary || false,
                }))
                : [{
                    name: '',
                    mobile: '',
                    mobile2: '',
                    mobile3: '',
                    mobile4: '',
                    mobile5: '',
                    email: '',
                    isPrimary: true,
                }],
            creditPeriod: customerData.creditPeriod ?? 0,
            gracePeriodDays: customerData.gracePeriodDays ?? 0,
            creditLimit: customerData.creditLimit ?? 0,
            creditLimitAction: customerData.creditLimitAction || 'Warn',
            paymentType: customerData.paymentType || 'Credit',
            paymentTerms: customerData.paymentTerms || '',
            tcsApplicable: !!customerData.tcsApplicable,
            tcsSection: customerData.tcsSection || '',
            tcsRate: customerData.tcsRate ?? 0,
            tcsThresholdLimit: customerData.tcsThresholdLimit ?? 0,
            panAvailable: !!customerData.panAvailable,
            openingBalance: customerData.openingBalance ?? 0,
            drCr: customerData.drCr || 'Dr',
            billWiseTracking: !!customerData.billWiseTracking,
            interestApplicable: !!customerData.interestApplicable,
            collectionPersonId: customerData.collectionPersonId?._id || customerData.collectionPersonId || '',
            assignedSalesperson: customerData.assignedSalesperson?._id || customerData.assignedSalesperson || '',
            riskCategory: customerData.riskCategory || '',
            creditRemarks: customerData.creditRemarks || '',
            msmeApplicable: customerData.msmeApplicable || false,
            msmeRegNo: customerData.msmeRegNo || '',
            msmeCategory: customerData.msmeCategory || '',
            panNumber: customerData.panNumber || '',
            tanNumber: customerData.tanNumber || '',
            cinNumber: customerData.cinNumber || '',
            iecNumber: customerData.iecNumber || '',
            gstState: customerData.gstState || '',
            defaultPlaceOfSupply: customerData.defaultPlaceOfSupply || '',
            gstRegistrationEffectiveDate: customerData.gstRegistrationEffectiveDate
                ? String(customerData.gstRegistrationEffectiveDate).slice(0, 10)
                : '',
            gstCancellationDate: customerData.gstCancellationDate
                ? String(customerData.gstCancellationDate).slice(0, 10)
                : '',
            gstStatus: customerData.gstStatus || 'Unknown',
            gstStatusEffectiveFrom: customerData.gstStatusEffectiveFrom
                ? String(customerData.gstStatusEffectiveFrom).slice(0, 10)
                : '',
            gstRevocationDate: customerData.gstRevocationDate
                ? String(customerData.gstRevocationDate).slice(0, 10)
                : '',
            gstLegalName: customerData.gstLegalName || '',
            gstTradeName: customerData.gstTradeName || '',
            gstTaxpayerType: customerData.gstTaxpayerType || '',
            gstConstitutionOfBusiness: customerData.gstConstitutionOfBusiness || '',
            gstRegisteredAddress: customerData.gstRegisteredAddress || '',
            gstAddressLine1: customerData.gstAddressLine1 || '',
            gstAddressLine2: customerData.gstAddressLine2 || '',
            gstDistrict: customerData.gstDistrict || '',
            gstCity: customerData.gstCity || '',
            gstPincode: customerData.gstPincode || '',
            gstFilingFrequency: customerData.gstFilingFrequency || '',
            gstTreatment: customerData.gstTreatment || '',
            gstVerificationReference: customerData.gstVerificationReference || '',
            gstVerificationResult: customerData.gstVerificationResult || '',
            gstVerificationError: customerData.gstVerificationError || '',
            gstVerificationDate: customerData.gstVerificationDate
                ? String(customerData.gstVerificationDate).slice(0, 10)
                : '',
            gstVerificationSource: customerData.gstVerificationSource || '',
            bankName: customerData.bankName || '',
            bankBranch: customerData.bankBranch || '',
            bankAccountNumber: customerData.bankAccountNumber || '',
            bankIfsc: customerData.bankIfsc || '',
            bankSwift: customerData.bankSwift || '',
            bankUpi: customerData.bankUpi || '',
            exportBuyerCode: customerData.exportBuyerCode || '',
            exportPort: customerData.exportPort || '',
            exportCurrency: customerData.exportCurrency || '',
            exportLcTerms: customerData.exportLcTerms || '',
            exportPaymentTerms: customerData.exportPaymentTerms || '',
            isExportCustomer: !!customerData.isExportCustomer,
            industryCustomFields: (() => {
                const raw = customerData.industryCustomFields;
                if (!raw) return {};
                if (raw instanceof Map) return Object.fromEntries(raw);
                if (typeof raw === 'object') return { ...raw };
                return {};
            })(),
            referralDetails: customerData.referralDetails || {
                sourceType: 'Direct',
                salespersonId: null,
                distributorId: null,
                incentiveApplicable: false,
                incentiveType: 'Percentage of sales',
                incentiveValue: 0,
                remarks: '',
            }
        };


        console.log('✅ Normalized data:', normalized);
        return normalized;
    };

    const { register, control, handleSubmit, setValue, watch, formState: { errors }, reset } = useForm({
        defaultValues: normalizeCustomerData(customer),
    });

    const { fields, append, remove } = useFieldArray({
        control,
        name: 'contactPersons',
    });

    const { addToast } = useToast();
    const [generatingCode, setGeneratingCode] = useState(false);
    const [isFetchingPin, setIsFetchingPin] = useState(false);
    const [gstinWarning, setGstinWarning] = useState(null); // { payload, invoices, showList }
    const [alterationPending, setAlterationPending] = useState(null);
    const initialCompanyName = customer?.company || '';
    const currentCompanyName = watch('company');
    const isNameChanged = customer && initialCompanyName && currentCompanyName && initialCompanyName !== currentCompanyName;
    const creditPeriodVal = watch('creditPeriod');
    const gracePeriodVal = watch('gracePeriodDays');
    const totalDueDays = computeCustomerDueDays(creditPeriodVal, gracePeriodVal, fieldCtrl.isVisible('gracePeriod'));

    const finishSubmit = (payload) => {
        const cleaned = { ...(payload || {}) };
        delete cleaned.__skipMasterAlterationGate;
        onSubmit(cleaned);
    };

    const handleFormSubmit = async (data) => {
        const missing = [];
        if (fieldCtrl.isRequired('creditPeriod') && (data.creditPeriod === undefined || data.creditPeriod === null || data.creditPeriod === '')) missing.push('Credit Period');
        if (fieldCtrl.isRequired('gracePeriod') && (data.gracePeriodDays === undefined || data.gracePeriodDays === null || data.gracePeriodDays === '')) missing.push('Grace Period');
        if (fieldCtrl.isRequired('creditLimit') && (data.creditLimit === undefined || data.creditLimit === null || data.creditLimit === '')) missing.push('Credit Limit');
        if (fieldCtrl.isRequired('gstNumber') && !String(data.gstNumber || '').trim()) missing.push('GST No');
        if (fieldCtrl.isRequired('panNumber') && !String(data.panNumber || '').trim()) missing.push('PAN No');
        if (missing.length) {
            addToast(`Required fields: ${missing.join(', ')}`, 'error');
            return;
        }
        // Blank "-- Select --" options send ""; Mongo ObjectId fields need null.
        const payload = { ...data };
        if (!payload.assignedSalesperson) payload.assignedSalesperson = null;
        if (!payload.collectionPersonId) payload.collectionPersonId = null;
        if (payload.referralDetails) {
            payload.referralDetails = { ...payload.referralDetails };
            if (!payload.referralDetails.salespersonId) payload.referralDetails.salespersonId = null;
            if (!payload.referralDetails.distributorId) payload.referralDetails.distributorId = null;
        }

        const prevGst = String(customer?.gstNumber || '').trim();
        const nextGst = String(payload.gstNumber || '').trim();
        const gstinNewlyAdded = Boolean(customer?._id) && !prevGst && nextGst.length >= 15;

        const sensitiveProposed = {};
        const sensFields = [
            'gstNumber',
            'gstRegistrationType',
            'gstStatus',
            'gstRegistrationEffectiveDate',
            'gstCancellationEffectiveDate',
            'state',
            'billingStateCode',
            'gstState',
            'panNumber',
            'customerName',
            'company',
        ];
        if (customer?._id && !data?.__skipMasterAlterationGate) {
            for (const f of sensFields) {
                if (payload[f] !== undefined && String(payload[f] ?? '') !== String(customer[f] ?? '')) {
                    sensitiveProposed[f] = payload[f];
                }
            }
        }

        if (Object.keys(sensitiveProposed).length && !alterationPending) {
            setAlterationPending({ payload, proposedChanges: sensitiveProposed });
            return;
        }

        // Live production: warn when GSTIN newly added and open invoices may be affected
        if (gstinNewlyAdded && !gstinWarning && !alterationPending) {
            try {
                const { data: res } = await api.get(`/gst-reports/customers/${customer._id}/affected-invoices`);
                const invoices = res?.data?.invoices || [];
                if (invoices.length > 0) {
                    setGstinWarning({ payload, invoices, showList: false, navigateToGstr1: false });
                    return;
                }
            } catch {
                /* non-blocking — still allow save */
            }
        }

        finishSubmit(payload);
    };

    const dismissGstinWarning = (opts = {}) => {
        const pending = gstinWarning?.payload;
        const goGstr1 = opts.reviewGstr1;
        setGstinWarning(null);
        if (pending) finishSubmit(pending);
        if (goGstr1) {
            setTimeout(() => navigate(PATHS.GST?.GSTR1 || '/gst/gstr1'), 400);
        }
    };

    const handleFetchPin = async () => {
        const addressText = watch('address');
        if (!addressText || !addressText.trim()) {
            addToast('Please enter an address first', 'error');
            return;
        }

        setIsFetchingPin(true);
        try {
            const data = await fetchGeocodeAddress(addressText);
            let updatedPin = false;

            const currentPin = watch('pincode');
            const currentCity = watch('city');
            const currentDistrict = watch('district');
            const currentTaluka = watch('taluka');
            const currentState = watch('state');
            const currentCountry = watch('country');

            if (data.postalCode && (!currentPin || !currentPin.trim())) {
                setValue('pincode', data.postalCode, { shouldValidate: true, shouldDirty: true });
                updatedPin = true;
            }
            if (data.city && (!currentCity || !currentCity.trim())) {
                setValue('city', data.city.toUpperCase(), { shouldValidate: true, shouldDirty: true });
            }
            if (data.district && (!currentDistrict || !currentDistrict.trim())) {
                setValue('district', data.district.toUpperCase(), { shouldValidate: true, shouldDirty: true });
            }
            if (data.taluka && (!currentTaluka || !currentTaluka.trim())) {
                setValue('taluka', data.taluka.toUpperCase(), { shouldValidate: true, shouldDirty: true });
            }
            if (data.state && (!currentState || !currentState.trim())) {
                const matchedState = INDIAN_STATES.find(s => s.toLowerCase() === data.state.toLowerCase());
                setValue('state', matchedState || data.state, { shouldValidate: true, shouldDirty: true });
            }
            if (data.country && (!currentCountry || !currentCountry.trim())) {
                setValue('country', data.country.toUpperCase(), { shouldValidate: true, shouldDirty: true });
            }

            if (updatedPin) {
                addToast('PIN code fetched successfully!', 'success');
            } else if (!data.postalCode) {
                addToast('PIN code not found from Google for this address.', 'info');
            } else {
                addToast('Address data fetched. Existing fields were not overwritten.', 'info');
            }
        } catch (error) {
            console.error('Geocoding error:', error);
            addToast(error?.response?.data?.message || error.message || 'Failed to fetch PIN from Google', 'error');
        } finally {
            setIsFetchingPin(false);
        }
    };

    const handleGenerateCode = async () => {
        setGeneratingCode(true);
        try {
            const res = await generateCustomerCode();
            setValue('customerCode', res.customerCode || res?.data?.customerCode || res || '', { shouldDirty: true });
        } catch (error) {
            console.error('Failed to generate code:', error);
        } finally {
            setGeneratingCode(false);
        }
    };

    // Reset form when customer prop changes (to prevent cache)
    useEffect(() => {
        const normalized = normalizeCustomerData(customer);
        reset(normalized);
        const defaultTypes = ['', 'led_light_manufacturer', 'led_light_showroom', 'home_automation_provider', 'interior_designer', 'builders', 'dealer', 'distributor'];
        if (normalized.customerType && !defaultTypes.includes(normalized.customerType)) {
            setIsCustomType(true);
        } else {
            setIsCustomType(false);
        }
    }, [customer, reset]);

    const stateValue = watch('state');
    const gstNumberValue = watch('gstNumber');

    // Automate GST Type based on state OR GST Number (State Code 27 = Maharashtra)
    useEffect(() => {
        let isMaharashtra = false;
        
        // Priority 1: State string
        if (stateValue && stateValue.trim().toLowerCase() === 'maharashtra') {
            isMaharashtra = true;
        } 
        // Priority 2: GST Number State Code
        else if (gstNumberValue && gstNumberValue.trim().startsWith('27')) {
            isMaharashtra = true;
        }
        
        if (stateValue || (gstNumberValue && gstNumberValue.trim().length >= 2)) {
            if (isMaharashtra) {
                setValue('gstType', 'CGST / SGST', { shouldValidate: true, shouldDirty: true });
            } else {
                setValue('gstType', 'IGST', { shouldValidate: true, shouldDirty: true });
            }
        } else {
            setValue('gstType', '', { shouldValidate: true, shouldDirty: true });
        }
    }, [stateValue, gstNumberValue, setValue]);

    // Automate GST Registration Type based on GST Number
    useEffect(() => {
        if (gstNumberValue && gstNumberValue.trim().length > 0) {
            setValue('gstRegistrationType', 'Registered', { shouldValidate: true, shouldDirty: true });
        } else {
            setValue('gstRegistrationType', 'Consumer', { shouldValidate: true, shouldDirty: true });
        }
    }, [gstNumberValue, setValue]);

    useEffect(() => {
        if (!isEnabled('customer.customerType')) return;
        (async () => {
            try {
                const types = await listCustomerTypeMaster();
                if (types?.length) {
                    setMasterCustomerTypes(types.map((t) => ({ value: t.name, label: t.name })));
                }
            } catch (error) {
                console.error('Failed to load customer type master:', error);
            }
        })();
    }, [isEnabled]);

    // Fetch dynamic customer types (legacy free-text types when master toggle off)
    useEffect(() => {
        if (isEnabled('customer.customerType')) return;
        const fetchTypes = async () => {
            try {
                const types = await getCustomerTypes();
                if (types && types.length > 0) {
                    const defaultValues = ['led_light_manufacturer', 'led_light_showroom', 'home_automation_provider', 'interior_designer', 'builders', 'dealer', 'distributor'];
                    const newTypes = types
                        .filter(t => t && !defaultValues.includes(t)) // filter out empty and defaults
                        .map(t => ({ value: t, label: t }));

                    if (newTypes.length > 0) {
                        setDynamicCustomerTypes(prev => {
                            // avoid duplicates on hot reload or multiple renders
                            const existingValues = new Set(prev.map(p => p.value));
                            const uniqueNewTypes = newTypes.filter(nt => !existingValues.has(nt.value));
                            return [...prev, ...uniqueNewTypes];
                        });
                    }
                }
            } catch (error) {
                console.error('Failed to load dynamic customer types:', error);
            }
        };
        fetchTypes();
    }, [isEnabled]);

    // Fetch dynamic stickers
    useEffect(() => {
        const fetchStickers = async () => {
            try {
                const stickers = await getStickers();
                if (stickers && stickers.length > 0) {
                    setDynamicStickers(stickers.map(s => ({ value: s._id, label: s.name })));
                }
            } catch (error) {
                console.error('Failed to load dynamic stickers:', error);
            }
        };
        fetchStickers();
    }, []);

    // Fetch sales team and distributors
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [userData, distData] = await Promise.all([
                    getUsers({ isActive: true, limit: 100 }),
                    getDistributors({ status: 'Active', limit: 100 })
                ]);
                setSalesTeam(userData.users || []);
                setDistributors(distData.results || []);
            } catch (error) {
                console.error('Failed to load referral data:', error);
            }
        };
        fetchData();
    }, []);



    // Helper function to convert input to uppercase
    const handleUppercaseChange = (fieldName) => (e) => {
        const upperValue = e.target.value.toUpperCase();
        setValue(fieldName, upperValue);
    };

    const contactPersons = watch('contactPersons');

    const handleAddContact = () => {
        append({
            name: '',
            mobile: '',
            mobile2: '',
            mobile3: '',
            mobile4: '',
            mobile5: '',
            email: '',
            isPrimary: false,
        });
    };

    const handleSetPrimary = (index) => {
        contactPersons.forEach((_, idx) => {
            setValue(`contactPersons.${idx}.isPrimary`, idx === index);
        });
    };

    const handleRemoveContact = (index) => {
        if (fields.length > 1) {
            const wasPrimary = contactPersons[index].isPrimary;
            remove(index);

            // If removed contact was primary, set first contact as primary
            if (wasPrimary && fields.length > 1) {
                setValue('contactPersons.0.isPrimary', true);
            }
        }
    };

    return (
        <>
            <form onSubmit={handleSubmit(handleFormSubmit)} className={styles['customer-form']}>

                {/* Two-column layout */}
                <div className={styles['form-body']}>

                    {/* Left Sidebar Navigation */}
                    <nav className={styles['form-sidebar']}>
                        <span className={styles['sidebar-label']}>Sections</span>
                        {customer?._id && (
                            <div style={{ marginBottom: 10 }}>
                                <MasterUsagePanel masterType="Customer" masterId={customer._id} />
                            </div>
                        )}
                        <a className={styles['sidebar-item']} href="#sec-basic" onClick={e => { e.preventDefault(); document.getElementById('sec-basic')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <span className={styles['sidebar-icon']}>👤</span> Basic Info
                        </a>
                        <a className={styles['sidebar-item']} href="#sec-contacts" onClick={e => { e.preventDefault(); document.getElementById('sec-contacts')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <span className={styles['sidebar-icon']}>📞</span> Contact Persons
                        </a>
                        <a className={styles['sidebar-item']} href="#sec-business" onClick={e => { e.preventDefault(); document.getElementById('sec-business')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <span className={styles['sidebar-icon']}>💼</span> Business Details
                        </a>
                        <a className={styles['sidebar-item']} href="#sec-credit" onClick={e => { e.preventDefault(); document.getElementById('sec-credit')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <span className={styles['sidebar-icon']}>💳</span> Accounts / Credit
                        </a>
                        <a className={styles['sidebar-item']} href="#sec-additional" onClick={e => { e.preventDefault(); document.getElementById('sec-additional')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <span className={styles['sidebar-icon']}>📝</span> Additional Info
                        </a>
                        <a className={styles['sidebar-item']} href="#sec-msme" onClick={e => { e.preventDefault(); document.getElementById('sec-msme')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <span className={styles['sidebar-icon']}>🏛️</span> MSME Details
                        </a>
                        <a className={styles['sidebar-item']} href="#sec-referral" onClick={e => { e.preventDefault(); document.getElementById('sec-referral')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                            <span className={styles['sidebar-icon']}>🤝</span> Sales / Referral
                        </a>
                    </nav>

                    {/* Right Form Content */}
                    <div className={styles['form-content']}>
                        {(!showBankingTab && !showExportTab && !showDocumentsTab) && (
                            <div style={{ marginBottom: 14, padding: '12px 14px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 13, color: '#9a3412', lineHeight: 1.5 }}>
                                <strong>KYC tabs are off.</strong> Enable them under{' '}
                                <Link to={`${PATHS.SETTINGS.FEATURE_COMPLIANCE}?tab=customer`} style={{ fontWeight: 700, color: '#c2410c' }}>
                                    Admin → Feature / Compliance → Customer
                                </Link>
                                {' '}(e.g. Banking, Documents / KYC) → <strong>Save settings</strong> → reload this page (Ctrl+Shift+R).
                                {showGstTaxTab ? ' GST & Tax tab is on.' : ''}
                            </div>
                        )}
                        {visibleTabs.length > 1 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, borderBottom: '2px solid #e2e8f0', paddingBottom: 8 }}>
                                {visibleTabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setActiveTab(tab.id)}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: 8,
                                            border: activeTab === tab.id ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                            background: activeTab === tab.id ? '#eff6ff' : '#fff',
                                            fontWeight: 700,
                                            fontSize: 12,
                                            color: activeTab === tab.id ? '#1d4ed8' : '#64748b',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        {(activeTab === 'basic' || visibleTabs.length === 1) && (
                        <>
                        {/* Basic Information */}
                        <div id="sec-basic" className={styles['form-section']}>
                            <h3>Basic Information</h3>

                    <div className={styles.grid4}>
                        <div className={styles['form-group']}>
                            <label>CUSTOMER CODE</label>
                            <div style={{ display: 'flex', gap: 4 }}>
                                <Input
                                    {...register('customerCode')}
                                    placeholder="Leave empty to auto-generate"
                                    onChange={handleUppercaseChange('customerCode')}
                                    style={{ flex: 1, fontFamily: 'monospace', fontWeight: 'bold' }}
                                    readOnly={customer?.customerCode ? true : false}
                                />
                                {!customer?.customerCode && (
                                    <button 
                                        type="button" 
                                        onClick={handleGenerateCode} 
                                        disabled={generatingCode} 
                                        title="Auto-generate code"
                                        style={{ height: '42px', width: '42px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: generatingCode ? 'spin 1s linear infinite' : 'none' }}>
                                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                            <path d="M3 3v5h5"></path>
                                        </svg>
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className={styles['form-group']}>
                            <label htmlFor="customerName">CUSTOMER NAME (OPTIONAL)</label>
                            <Input
                                id="customerName"
                                {...register('customerName')}
                                placeholder="Enter customer name (optional)"
                                onChange={handleUppercaseChange('customerName')}
                            />
                            {errors.customerName && <span className={styles.error}>{errors.customerName.message}</span>}
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="company">COMPANY (DISPLAY NAME)</label>
                            <Input
                                id="company"
                                {...register('company')}
                                placeholder="Company / Short Name"
                                onChange={handleUppercaseChange('company')}
                            />
                            {isNameChanged && (
                                <div style={{ 
                                    fontSize: '11px', 
                                    color: '#e11d48', 
                                    marginTop: '4px', 
                                    background: '#fff1f2', 
                                    padding: '4px 8px', 
                                    borderRadius: '4px',
                                    border: '1px solid #fecdd3',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}>
                                    <span style={{ fontSize: '14px' }}>⚠️</span>
                                    <span>Changing this name will update it globally in all past & future records.</span>
                                </div>
                            )}
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="legalName">LEGAL NAME (GSTR-1)</label>
                            <Input
                                id="legalName"
                                {...register('legalName')}
                                placeholder="Exact legal name as per GST portal"
                                onChange={handleUppercaseChange('legalName')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="tradeName">TRADE NAME</label>
                            <Input
                                id="tradeName"
                                {...register('tradeName')}
                                placeholder="Trade name as per GST portal"
                                onChange={handleUppercaseChange('tradeName')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="companyEmail">COMPANY EMAIL</label>
                            <Input
                                id="companyEmail"
                                type="email"
                                {...register('companyEmail')}
                                placeholder="company@example.com"
                                style={{ textTransform: 'uppercase' }}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="website">WEBSITE</label>
                            <Input
                                id="website"
                                type="url"
                                {...register('website')}
                                placeholder="https://www.company.com"
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="companyBrand">COMPANY BRAND (OPTIONAL)</label>
                            <Input
                                id="companyBrand"
                                {...register('companyBrand')}
                                placeholder="Enter brand name"
                                onChange={handleUppercaseChange('companyBrand')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="stickers">STICKERS / LABELS</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div style={{ flex: 1 }}>
                                    <MultiSelect
                                        name="stickers"
                                        control={control}
                                        options={dynamicStickers}
                                        placeholder="Assign labels..."
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setShowAddSticker(true)}
                                    title="Add New Sticker Master"
                                    style={{ height: '42px', padding: '0 12px' }}
                                >
                                    <Plus size={18} />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className={`${styles['form-group']} ${styles.colSpan3}`}>
                        <label htmlFor="address">PRIMARY ADDRESS (BILLING & SHIPPING)</label>
                        <textarea
                            id="address"
                            {...register('address')}
                            placeholder="Enter complete address..."
                            rows={3}
                            className={styles['form-textarea']}
                            onChange={handleUppercaseChange('address')}
                        />
                    </div>
                    
                    <div className={`${styles['form-group']} ${styles.colSpan3}`}>
                        <label htmlFor="additionalAddress">FACTORY / SECONDARY ADDRESS (FOR RECORD ONLY)</label>
                        <textarea
                            id="additionalAddress"
                            {...register('additionalAddress')}
                            placeholder="Enter additional or factory address..."
                            rows={3}
                            className={styles['form-textarea']}
                            onChange={handleUppercaseChange('additionalAddress')}
                        />
                    </div>
                    <div className={styles.grid4}>


                        <div className={styles['form-group']}>
                            <label htmlFor="city">CITY</label>
                            <Input
                                id="city"
                                {...register('city')}
                                placeholder="Enter city"
                                onChange={handleUppercaseChange('city')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="district">DISTRICT</label>
                            <Input
                                id="district"
                                {...register('district')}
                                placeholder="Enter district"
                                onChange={handleUppercaseChange('district')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="taluka">TALUKA / TEHSIL</label>
                            <Input
                                id="taluka"
                                {...register('taluka')}
                                placeholder="Enter taluka or tehsil"
                                onChange={handleUppercaseChange('taluka')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="pincode">PINCODE</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <Input
                                    id="pincode"
                                    {...register('pincode')}
                                    placeholder="Enter pincode"
                                    onChange={handleUppercaseChange('pincode')}
                                    style={{ flex: 1 }}
                                />
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    onClick={handleFetchPin} 
                                    disabled={isFetchingPin}
                                    title="Fetch PIN from Google"
                                    style={{ padding: '0 12px', height: '42px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                    {isFetchingPin ? <Loader2 className="animate-spin" size={16} /> : <MapPin size={16} />}
                                    <span style={{ fontSize: '13px' }}>Fetch PIN</span>
                                </Button>
                            </div>
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="state">STATE</label>
                            <select
                                id="state"
                                {...register('state')}
                                className={styles['form-select']}
                            >
                                <option value="">Select State</option>
                                {INDIAN_STATES.map(state => (
                                    <option key={state} value={state}>{state}</option>
                                ))}
                            </select>
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="country">COUNTRY</label>
                            <Input
                                id="country"
                                {...register('country')}
                                placeholder="India"
                                onChange={handleUppercaseChange('country')}
                            />
                        </div>

                        <div className={styles['form-group']}>
                            <label htmlFor="status">STATUS</label>
                            <select
                                id="status"
                                {...register('status')}
                                className={styles['form-select']}
                            >
                                <option value="lead">Lead</option>
                                <option value="running_high">Running High</option>
                                <option value="running_low">Running Low</option>
                                <option value="inactive">Inactive</option>
                            </select>
                        </div>
                    </div>{/* end grid4 */}
                        </div>{/* end sec-basic */}


                        {/* Contact Persons */}
                        <div id="sec-contacts" className={styles['form-section']}>
                    <div className={styles['section-header']}>
                        <h3>Contact Persons</h3>
                        <Button type="button" onClick={handleAddContact} size="sm" variant="outline">
                            <Plus size={16} /> Add Contact
                        </Button>
                    </div>

                    {fields.map((field, index) => (
                        <div key={field.id} className={styles['contact-person-card']}>
                            <div className={styles['card-header']}>
                                <span className={styles['contact-number']}>Contact {index + 1}</span>
                                <div className={styles['card-actions']}>
                                    <button
                                        type="button"
                                        onClick={() => handleSetPrimary(index)}
                                        className={`${styles['primary-btn']} ${contactPersons[index]?.isPrimary ? styles.active : ''} `}
                                        title="Set as primary contact"
                                    >
                                        <Star size={16} fill={contactPersons[index]?.isPrimary ? 'currentColor' : 'none'} />
                                        {contactPersons[index]?.isPrimary && <span>Primary</span>}
                                    </button>
                                    {fields.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveContact(index)}
                                            className={styles['remove-btn']}
                                            title="Remove contact"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className={styles['form-group']}>
                                <label htmlFor={`contact-name-${index}`}>CONTACT NAME (OPTIONAL)</label>
                                <Input
                                    id={`contact-name-${index}`}
                                    {...register(`contactPersons.${index}.name`)}
                                    placeholder="Enter contact person name"
                                    onChange={handleUppercaseChange(`contactPersons.${index}.name`)}
                                />
                                {errors.contactPersons?.[index]?.name && (
                                    <span className={styles.error}>{errors.contactPersons[index].name.message}</span>
                                )}
                            </div>

                            <div className={styles['form-row']}>
                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile-${index}`}>MOBILE 1 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile-${index}`}
                                        {...register(`contactPersons.${index}.mobile`)}
                                        placeholder="Mobile 1"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                    {errors.contactPersons?.[index]?.mobile && (
                                        <span className={styles.error}>{errors.contactPersons[index].mobile.message}</span>
                                    )}
                                </div>

                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile2-${index}`}>MOBILE 2 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile2-${index}`}
                                        {...register(`contactPersons.${index}.mobile2`)}
                                        placeholder="Mobile 2"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                    {errors.contactPersons?.[index]?.mobile2 && (
                                        <span className={styles.error}>{errors.contactPersons[index].mobile2.message}</span>
                                    )}
                                </div>
                            </div>

                            <div className={styles['form-row']}>
                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile3-${index}`}>MOBILE 3 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile3-${index}`}
                                        {...register(`contactPersons.${index}.mobile3`)}
                                        placeholder="Mobile 3"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>

                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile4-${index}`}>MOBILE 4 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile4-${index}`}
                                        {...register(`contactPersons.${index}.mobile4`)}
                                        placeholder="Mobile 4"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                            </div>

                            <div className={styles['form-row']}>
                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-mobile5-${index}`}>MOBILE 5 (OPTIONAL)</label>
                                    <Input
                                        id={`contact-mobile5-${index}`}
                                        {...register(`contactPersons.${index}.mobile5`)}
                                        placeholder="Mobile 5"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                                <div className={styles['form-group']}>
                                    <label htmlFor={`contact-email-${index}`}>EMAIL</label>
                                    <Input
                                        id={`contact-email-${index}`}
                                        type="email"
                                        {...register(`contactPersons.${index}.email`)}
                                        placeholder="contact@example.com"
                                        style={{ textTransform: 'uppercase' }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                        </div>{/* end sec-contacts */}


                {/* Business Details */}
                        <div id="sec-business" className={styles['form-section']}>
                    <h3>Business Details</h3>

                    <div className={styles.grid4}>
                        {!isEnabled('customer.customerType') && (
                        <div className={styles['form-group']}>
                            <label htmlFor="customerType">TYPE</label>
                            {!isCustomType ? (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <select
                                        id="customerType"
                                        {...register('customerType')}
                                        className={styles['form-select']}
                                        style={{ flex: 1 }}
                                    >
                                        {dynamicCustomerTypes.map((type, index) => (
                                            <option key={`${type.value}-${index}`} value={type.value}>{type.label}</option>
                                        ))}
                                    </select>
                                    <Button type="button" variant="outline" onClick={() => { setIsCustomType(true); setValue('customerType', ''); }} title="Add Custom Type" style={{ padding: '0 12px' }}>
                                        <Plus size={18} />
                                    </Button>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <Input
                                        id="customerType"
                                        {...register('customerType')}
                                        placeholder="Enter custom type"
                                        style={{ flex: 1 }}
                                        onChange={(e) => {
                                            const val = e.target.value.toUpperCase();
                                            setValue('customerType', val, { shouldValidate: true, shouldDirty: true });
                                        }}
                                    />
                                    <Button type="button" variant="outline" onClick={() => { setIsCustomType(false); setValue('customerType', ''); }} title="Select from list" style={{ padding: '0 12px' }}>
                                        List
                                    </Button>
                                </div>
                            )}
                        </div>
                        )}

                        {!hideGstInBusiness && fieldCtrl.isVisible('gstNumber') && (
                        <>
                        <div className={styles['form-group']}>
                            <label htmlFor="gstNumber">GST NUMBER</label>
                            <Input
                                id="gstNumber"
                                {...register('gstNumber', {
                                    pattern: {
                                        value: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
                                        message: 'Invalid GST format'
                                    },
                                    onChange: (e) => {
                                        e.target.value = e.target.value.replace(/\s/g, '').toUpperCase();
                                    }
                                })}
                                placeholder="e.g. 22AAAAA0000A1Z5"
                                maxLength={15}
                                style={{ 
                                    textTransform: 'uppercase', 
                                    color: '#000', 
                                    fontWeight: '700',
                                    fontSize: '0.95rem' 
                                }}
                            />
                            {errors.gstNumber && <span className={styles.error}>{errors.gstNumber.message}</span>}
                            <small className={styles['help-text']}>15 characters GST number</small>
                        </div>

                        {/* GST Type */}
                        <div className={styles['form-group']}>
                            <label htmlFor="gstType">GST TYPE</label>
                            <select
                                id="gstType"
                                {...register('gstType')}
                                className={styles['form-select']}
                            >
                                <option value="">Select Type</option>
                                <option value="CGST / SGST">CGST / SGST</option>
                                <option value="IGST">IGST</option>
                            </select>
                        </div>

                        {/* GST Registration Type */}
                        <div className={styles['form-group']}>
                            <label htmlFor="gstRegistrationType">GST REGISTRATION TYPE</label>
                            <select
                                id="gstRegistrationType"
                                {...register('gstRegistrationType')}
                                className={styles['form-select']}
                            >
                                <option value="">Select Type</option>
                                <option value="Registered">Registered</option>
                                <option value="Unregistered">Unregistered</option>
                                <option value="Composite">Composite</option>
                                <option value="Consumer">Consumer</option>
                                <option value="UIN">UIN Holder</option>
                                <option value="SEZ">SEZ (With/Without Pay)</option>
                                <option value="Export">Export</option>
                            </select>
                        </div>

                        {/* Customer Activity Type (GSTR-1 B2B/B2C logic) */}
                        <div className={styles['form-group']}>
                            <label htmlFor="customerActivityType">CUSTOMER ACTIVITY (GSTR-1)</label>
                            <select
                                id="customerActivityType"
                                {...register('customerActivityType')}
                                className={styles['form-select']}
                            >
                                <option value="">Select Activity</option>
                                <option value="B2B">B2B (Business to Business)</option>
                                <option value="B2C">B2C (Business to Consumer)</option>
                            </select>
                        </div>
                        
                        {/* Export Country */}
                        <div className={styles['form-group']}>
                            <label htmlFor="exportCountry">EXPORT COUNTRY</label>
                            <Input
                                id="exportCountry"
                                {...register('exportCountry')}
                                placeholder="If Export, enter country"
                                onChange={handleUppercaseChange('exportCountry')}
                            />
                        </div>
                        </>
                        )}

                    </div>{/* end grid business */}

                        {isEnabled('customer.industrySpecificFields') && visibleIndustryFields.length > 0 && (
                        <div id="sec-industry" className={styles['form-section']} style={{ marginTop: '1rem' }}>
                            <h3>Industry Specific Fields</h3>
                            <div className={styles.grid4}>
                                {visibleIndustryFields.map((def) => (
                                    <div key={def.featureKey} className={styles['form-group']}>
                                        <label htmlFor={`icf-${def.featureKey}`}>{def.featureName}</label>
                                        <Input
                                            id={`icf-${def.featureKey}`}
                                            {...register(`industryCustomFields.${def.featureKey}`)}
                                            placeholder={def.featureName}
                                            onChange={handleUppercaseChange(`industryCustomFields.${def.featureKey}`)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        )}

                        </div>{/* end sec-business */}

                        {/* Accounts / Credit Details */}
                        <div id="sec-credit" className={styles['form-section']}>
                            <h3>Accounts / Credit Details</h3>
                            <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                                Enable fields under Admin →{' '}
                                <Link to={`${PATHS.SETTINGS.FEATURE_COMPLIANCE}?tab=customer`} style={{ color: '#2563eb', fontWeight: 600 }}>
                                    Feature / Compliance → Customer
                                </Link>
                                {' '}tab (or Feature Configuration → Customer Master).
                            </p>
                            <div className={styles.grid4}>
                                <div className={styles['form-group']}>
                                    <label>LEDGER GROUP</label>
                                    <Input value="Sundry Debtors" readOnly disabled style={{ background: '#f8fafc', fontWeight: 600 }} />
                                </div>

                                {fieldCtrl.isVisible('creditPeriod') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="creditPeriod">CREDIT PERIOD (DAYS){fieldCtrl.isRequired('creditPeriod') ? ' *' : ''}</label>
                                        <Input
                                            id="creditPeriod"
                                            type="number"
                                            {...register('creditPeriod', {
                                                valueAsNumber: true,
                                                required: fieldCtrl.isRequired('creditPeriod') ? 'Credit Period is required' : false,
                                            })}
                                            placeholder="0"
                                            min="0"
                                            readOnly={fieldCtrl.isReadOnly('creditPeriod')}
                                            disabled={fieldCtrl.isReadOnly('creditPeriod')}
                                        />
                                    </div>
                                )}

                                {fieldCtrl.isVisible('gracePeriod') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="gracePeriodDays">GRACE PERIOD (DAYS){fieldCtrl.isRequired('gracePeriod') ? ' *' : ''}</label>
                                        <Input
                                            id="gracePeriodDays"
                                            type="number"
                                            {...register('gracePeriodDays', {
                                                valueAsNumber: true,
                                                required: fieldCtrl.isRequired('gracePeriod') ? 'Grace Period is required' : false,
                                            })}
                                            placeholder="0"
                                            min="0"
                                            readOnly={fieldCtrl.isReadOnly('gracePeriod')}
                                            disabled={fieldCtrl.isReadOnly('gracePeriod')}
                                        />
                                        <small className={styles['help-text']}>
                                            Total due days: {totalDueDays}
                                            {fieldCtrl.isVisible('gracePeriod') && Number(gracePeriodVal) > 0
                                                ? ' (Credit Period + Grace Period)'
                                                : ' (Credit Period only)'}
                                        </small>
                                    </div>
                                )}

                                {fieldCtrl.isVisible('creditLimit') && (
                                    <>
                                        <div className={styles['form-group']}>
                                            <label htmlFor="creditLimit">CREDIT LIMIT (₹)</label>
                                            <Input
                                                id="creditLimit"
                                                type="number"
                                            {...register('creditLimit', {
                                                valueAsNumber: true,
                                                required: fieldCtrl.isRequired('creditLimit') ? 'Credit Limit is required' : false,
                                            })}
                                            placeholder="0"
                                            min="0"
                                            readOnly={fieldCtrl.isReadOnly('creditLimit')}
                                            disabled={fieldCtrl.isReadOnly('creditLimit')}
                                        />
                                        </div>
                                        <div className={styles['form-group']}>
                                            <label htmlFor="creditLimitAction">ON LIMIT BREACH</label>
                                            <select id="creditLimitAction" {...register('creditLimitAction')} className={styles['form-select']}>
                                                <option value="None">No Action</option>
                                                <option value="Warn">Warn</option>
                                                <option value="Block">Block</option>
                                            </select>
                                        </div>
                                    </>
                                )}

                                {isEnabled('customer.customerType') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="customerTypeCredit">CUSTOMER TYPE</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <select
                                                id="customerTypeCredit"
                                                {...register('customerType')}
                                                className={styles['form-select']}
                                                style={{ flex: 1 }}
                                            >
                                                <option value="">-- Select Type --</option>
                                                {masterCustomerTypes.map((type) => (
                                                    <option key={type.value} value={type.value}>{type.label}</option>
                                                ))}
                                                {watch('customerType') && !masterCustomerTypes.some((t) => t.value === watch('customerType')) && (
                                                    <option value={watch('customerType')}>{watch('customerType')}</option>
                                                )}
                                            </select>
                                            <Button type="button" variant="outline" onClick={() => setShowAddCustomerType(true)} title="Add Customer Type" style={{ padding: '0 12px' }}>
                                                <Plus size={18} />
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {isEnabled('customer.paymentTerms') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="paymentTerms">PAYMENT TERMS</label>
                                        <Input id="paymentTerms" {...register('paymentTerms')} placeholder="e.g. Net 30, 50% advance" />
                                    </div>
                                )}

                                <div className={styles['form-group']}>
                                    <label htmlFor="paymentType">PAYMENT TYPE</label>
                                    <select id="paymentType" {...register('paymentType')} className={styles['form-select']}>
                                        <option value="Credit">Credit</option>
                                        <option value="Cash">Cash</option>
                                    </select>
                                </div>

                                {!showGstTaxTab && isEnabled('customer.tcsApplicable') && (
                                    <>
                                        <div className={styles['form-group']}>
                                            <label htmlFor="tcsApplicable">TCS APPLICABLE</label>
                                            <select id="tcsApplicable" {...register('tcsApplicable')} className={styles['form-select']}>
                                                <option value={false}>No</option>
                                                <option value={true}>Yes</option>
                                            </select>
                                        </div>
                                        {watch('tcsApplicable') === true || watch('tcsApplicable') === 'true' ? (
                                            <>
                                                <div className={styles['form-group']}>
                                                    <label htmlFor="tcsSection">TCS SECTION</label>
                                                    <Input id="tcsSection" {...register('tcsSection')} placeholder="e.g. 206C(1H)" />
                                                </div>
                                                {isEnabled('customer.tcsRate') && (
                                                    <>
                                                        <div className={styles['form-group']}>
                                                            <label htmlFor="tcsRate">TCS RATE (%)</label>
                                                            <Input id="tcsRate" type="number" step="0.01" {...register('tcsRate', { valueAsNumber: true })} min="0" />
                                                        </div>
                                                        <div className={styles['form-group']}>
                                                            <label htmlFor="tcsThresholdLimit">TCS THRESHOLD LIMIT (₹)</label>
                                                            <Input id="tcsThresholdLimit" type="number" {...register('tcsThresholdLimit', { valueAsNumber: true })} min="0" />
                                                        </div>
                                                    </>
                                                )}
                                            </>
                                        ) : null}
                                    </>
                                )}

                                {!showGstTaxTab && fieldCtrl.isVisible('panNumber') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="panAvailable">PAN AVAILABLE</label>
                                        <select id="panAvailable" {...register('panAvailable')} className={styles['form-select']}>
                                            <option value={false}>No</option>
                                            <option value={true}>Yes</option>
                                        </select>
                                    </div>
                                )}

                                <div className={styles['form-group']}>
                                    <label htmlFor="openingBalance">OPENING BALANCE (₹)</label>
                                    <Input id="openingBalance" type="number" {...register('openingBalance', { valueAsNumber: true })} min="0" />
                                </div>

                                <div className={styles['form-group']}>
                                    <label htmlFor="drCr">BALANCE TYPE</label>
                                    <select id="drCr" {...register('drCr')} className={styles['form-select']}>
                                        <option value="Dr">Dr</option>
                                        <option value="Cr">Cr</option>
                                    </select>
                                </div>

                                <div className={styles['form-group']}>
                                    <label htmlFor="billWiseTracking">BILL-WISE TRACKING</label>
                                    <select id="billWiseTracking" {...register('billWiseTracking')} className={styles['form-select']}>
                                        <option value={false}>No</option>
                                        <option value={true}>Yes</option>
                                    </select>
                                </div>

                                {isEnabled('customer.interestApplicable') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="interestApplicable">INTEREST APPLICABLE</label>
                                        <select id="interestApplicable" {...register('interestApplicable')} className={styles['form-select']}>
                                            <option value={false}>No</option>
                                            <option value={true}>Yes</option>
                                        </select>
                                    </div>
                                )}

                                {isEnabled('customer.salesPerson') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="assignedSalesperson">SALES PERSON (optional)</label>
                                        <select id="assignedSalesperson" {...register('assignedSalesperson')} className={styles['form-select']}>
                                            <option value="">-- Select --</option>
                                            {salesTeam.map((user) => (
                                                <option key={user._id} value={user._id}>{user.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {isEnabled('customer.collectionPerson') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="collectionPersonId">COLLECTION PERSON (optional)</label>
                                        <select id="collectionPersonId" {...register('collectionPersonId')} className={styles['form-select']}>
                                            <option value="">-- Select --</option>
                                            {salesTeam.map((user) => (
                                                <option key={user._id} value={user._id}>{user.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {isEnabled('customer.riskCategory') && (
                                    <div className={styles['form-group']}>
                                        <label htmlFor="riskCategory">RISK CATEGORY</label>
                                        <select id="riskCategory" {...register('riskCategory')} className={styles['form-select']}>
                                            <option value="">-- Select --</option>
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                        </select>
                                    </div>
                                )}
                            </div>

                            <div className={styles['form-group']} style={{ marginTop: '1rem' }}>
                                <label htmlFor="creditRemarks">REMARKS</label>
                                <textarea
                                    id="creditRemarks"
                                    {...register('creditRemarks')}
                                    placeholder="Credit / accounts remarks..."
                                    rows={2}
                                    className={styles['form-textarea']}
                                />
                            </div>
                        </div>{/* end sec-credit */}

                        {/* Additional Information */}
                        <div id="sec-additional" className={styles['form-section']}>
                    <h3>Additional Information</h3>

                    <div className={styles['form-group']}>
                        <label htmlFor="notes">NOTES</label>
                        <textarea
                            id="notes"
                            {...register('notes')}
                            placeholder="Add any additional notes..."
                            rows={4}
                            className={styles['form-textarea']}
                            onChange={handleUppercaseChange('notes')}
                        />
                    </div>

                    <div className={styles['form-group']}>
                        <label htmlFor="tags">TAGS (COMMA SEPARATED)</label>
                        <Input
                            id="tags"
                            {...register('tags')}
                            placeholder="e.g. vip, premium, wholesale"
                            onChange={handleUppercaseChange('tags')}
                        />
                        <small className={styles['help-text']}>Separate tags with commas</small>
                     </div>{/* end form-group tags */}
                        </div>{/* end sec-additional */}

                        {/* MSME Details */}
                        {!showGstTaxTab && fieldCtrl.isVisible('msmeNumber') ? (
                            <div id="sec-msme" className={styles['form-section']}>
                                <h3>MSME Details (MSMED Act)</h3>
                                <div className={styles['form-group']}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            {...register('msmeApplicable')}
                                            style={{ width: 16, height: 16, accentColor: '#0d9488', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontWeight: 600, fontSize: 13 }}>MSME Registered Customer</span>
                                        <span className={styles['help-text']}>(Enables MSME compliance tracking)</span>
                                    </label>
                                </div>
                                {watch('msmeApplicable') ? (
                                    <div className={styles.grid4}>
                                        <div className={styles['form-group']}>
                                            <label>UDYAM REGISTRATION NO.</label>
                                            <Input
                                                {...register('msmeRegNo')}
                                                placeholder="UDYAM-XX-00-0000000"
                                                style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
                                                onChange={(e) => setValue('msmeRegNo', e.target.value.toUpperCase())}
                                            />
                                            <small className={styles['help-text']}>As per Udyam Registration Certificate</small>
                                        </div>
                                        <div className={styles['form-group']}>
                                            <label>MSME CATEGORY</label>
                                            <select {...register('msmeCategory')} className={styles['form-select']}>
                                                <option value="">— Select Category —</option>
                                                <option value="Micro">Micro Enterprise</option>
                                                <option value="Small">Small Enterprise</option>
                                                <option value="Medium">Medium Enterprise</option>
                                            </select>
                                            <small className={styles['help-text']}>As classified under MSMED Act</small>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        ) : null}

                        {/* Sales / Referral Details */}
                        <div id="sec-referral" className={styles['form-section']}>
                            <h3>Sales / Referral Details</h3>
                            <div className={styles.grid4}>
                                <div className={styles['form-group']}>
                                    <label>SOURCE TYPE</label>
                                    <select {...register('referralDetails.sourceType')} className={styles['form-select']}>
                                        <option value="Direct">Direct</option>
                                        <option value="Salesperson">Salesperson</option>
                                        <option value="Distributor">Distributor</option>
                                        <option value="Dealer">Dealer</option>
                                        <option value="Referral Partner">Referral Partner</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                {watch('referralDetails.sourceType') === 'Salesperson' && (
                                    <div className={styles['form-group']}>
                                        <label>SELECT SALESPERSON</label>
                                        <select {...register('referralDetails.salespersonId')} className={styles['form-select']}>
                                            <option value="">-- Select Salesperson --</option>
                                            {salesTeam.map(user => (
                                                <option key={user._id} value={user._id}>{user.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {['Distributor', 'Dealer', 'Referral Partner'].includes(watch('referralDetails.sourceType')) && (
                                    <div className={styles['form-group']}>
                                        <label>SELECT PARTNER</label>
                                        <select {...register('referralDetails.distributorId')} className={styles['form-select']}>
                                            <option value="">-- Select Partner --</option>
                                            {distributors.map(d => (
                                                <option key={d._id} value={d._id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                <div className={styles['form-group']}>
                                    <label>INCENTIVE APPLICABLE?</label>
                                    <select {...register('referralDetails.incentiveApplicable')} className={styles['form-select']}>
                                        <option value={false}>No</option>
                                        <option value={true}>Yes</option>
                                    </select>
                                </div>

                                {watch('referralDetails.incentiveApplicable') == 'true' && (
                                    <>
                                        <div className={styles['form-group']}>
                                            <label>INCENTIVE TYPE</label>
                                            <select {...register('referralDetails.incentiveType')} className={styles['form-select']}>
                                                <option value="Percentage of sales">Percentage of sales</option>
                                                <option value="Fixed amount per invoice">Fixed amount per invoice</option>
                                                <option value="Fixed amount per customer">Fixed amount per customer</option>
                                                <option value="Item-wise incentive">Item-wise incentive</option>
                                                <option value="Manual">Manual</option>
                                            </select>
                                        </div>
                                        <div className={styles['form-group']}>
                                            <label>VALUE (%) / AMOUNT</label>
                                            <Input
                                                type="number"
                                                {...register('referralDetails.incentiveValue', { valueAsNumber: true })}
                                                placeholder="0"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                            <div className={styles['form-group']} style={{ marginTop: '1rem' }}>
                                <label>REMARKS</label>
                                <textarea
                                    {...register('referralDetails.remarks')}
                                    placeholder="Any internal remarks about this referral..."
                                    rows={2}
                                    className={styles['form-textarea']}
                                    onChange={handleUppercaseChange('referralDetails.remarks')}
                                />
                            </div>
                        </div>{/* end sec-referral */}
                        </>
                        )}

                        {activeTab === 'gstTax' && showGstTaxTab && (
                            <div id="sec-gst-tax" className={styles['form-section']}>
                                <h3>GST &amp; Tax Details</h3>
                                <CustomerGstTaxTab
                                    register={register}
                                    errors={errors}
                                    watch={watch}
                                    setValue={setValue}
                                    isEnabled={isEnabled}
                                    fieldCtrl={fieldCtrl}
                                    handleUppercaseChange={handleUppercaseChange}
                                    customerId={customer?._id}
                                    documents={kycDocuments}
                                    onDocRefresh={refreshKycDocuments}
                                    docPerms={docPerms}
                                    companyId={selectedCompany?._id}
                                    financialYearId={selectedFYObject?._id}
                                />
                            </div>
                        )}

                        {activeTab === 'banking' && showBankingTab && (
                            <div id="sec-banking" className={styles['form-section']}>
                                <h3>Banking Details</h3>
                                <CustomerBankingTab
                                    register={register}
                                    handleUppercaseChange={handleUppercaseChange}
                                    isEnabled={isEnabled}
                                    fieldCtrl={fieldCtrl}
                                    customerId={customer?._id}
                                    documents={kycDocuments}
                                    onDocRefresh={refreshKycDocuments}
                                    docPerms={docPerms}
                                    companyId={selectedCompany?._id}
                                    financialYearId={selectedFYObject?._id}
                                />
                            </div>
                        )}

                        {activeTab === 'export' && showExportTab && (
                            <div id="sec-export" className={styles['form-section']}>
                                <h3>Export Details</h3>
                                <CustomerExportTab
                                    register={register}
                                    watch={watch}
                                    handleUppercaseChange={handleUppercaseChange}
                                    isEnabled={isEnabled}
                                    fieldCtrl={fieldCtrl}
                                />
                            </div>
                        )}

                        {activeTab === 'documents' && showDocumentsTab && (
                            <div id="sec-documents" className={styles['form-section']}>
                                <h3>Documents / KYC</h3>
                                <CustomerDocumentsKycTab
                                    customerId={customer?._id}
                                    companyId={selectedCompany?._id}
                                    financialYearId={selectedFYObject?._id}
                                    fieldCtrl={fieldCtrl}
                                    docCtrl={customerDocCtrl}
                                />
                            </div>
                        )}
                    </div>{/* end form-content */}
                </div>{/* end form-body */}

                {/* Sticky Footer Actions */}
                <div className={styles['form-actions']}>
                    <Button type="button" variant="outline" onClick={() => window.confirm('Discard changes?') && onCancel()} disabled={isSubmitting}>
                        CANCEL
                    </Button>
                    <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
                        {customer ? 'UPDATE CUSTOMER' : 'CREATE CUSTOMER'}
                    </Button>
                </div>
            </form >
            <AddStickerModal
                isOpen={showAddSticker}
                onClose={() => setShowAddSticker(false)}
                onSave={(newSticker) => {
                    setDynamicStickers(prev => [...prev, { value: newSticker._id, label: newSticker.name }]);
                    const current = watch('stickers') || [];
                    setValue('stickers', [...current, newSticker._id], { shouldDirty: true });
                }}
            />
            <AddCustomerTypeModal
                isOpen={showAddCustomerType}
                onClose={() => setShowAddCustomerType(false)}
                onSave={(newType) => {
                    const name = newType?.name || '';
                    if (!name) return;
                    setMasterCustomerTypes((prev) => {
                        if (prev.some((t) => t.value === name)) return prev;
                        return [...prev, { value: name, label: name }];
                    });
                    setValue('customerType', name, { shouldDirty: true });
                }}
            />

            {alterationPending && customer?._id && (
                <MasterAlterationImpactModal
                    open
                    masterType="Customer"
                    masterId={customer._id}
                    proposedChanges={alterationPending.proposedChanges}
                    onClose={() => setAlterationPending(null)}
                    onApplied={() => {
                        const full = { ...alterationPending.payload };
                        const proposed = alterationPending.proposedChanges || {};
                        // Engine already applied sensitive fields — omit them so normal Save cannot bypass/re-write GST.
                        for (const f of Object.keys(proposed)) delete full[f];
                        setAlterationPending(null);
                        addToast('Sensitive Master fields applied via Impact Preview engine', 'success');
                        finishSubmit({ ...full, __skipMasterAlterationGate: true });
                    }}
                />
            )}
            {gstinWarning && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1100,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                    }}
                    onClick={() => setGstinWarning(null)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#fff', borderRadius: 12, maxWidth: 560, width: '100%',
                            boxShadow: '0 20px 50px rgba(0,0,0,0.15)', padding: 24,
                        }}
                    >
                        <h3 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#0f172a' }}>
                            Earlier invoices without GST details
                        </h3>
                        <p style={{ margin: '0 0 14px', fontSize: 13, color: '#475569', lineHeight: 1.5 }}>
                            This customer has earlier invoices without GST details.
                            Customer Master updates never rewrite historical invoices automatically.
                            Use GSTR-1 Validation → Fix from Customer Master when ready.
                        </p>
                        <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#0f766e' }}>
                            Affected invoices: {gstinWarning.invoices?.length || 0}
                        </p>
                        {gstinWarning.showList && (
                            <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 14, fontSize: 12 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ textAlign: 'left', padding: 8 }}>Invoice</th>
                                            <th style={{ textAlign: 'left', padding: 8 }}>Date</th>
                                            <th style={{ textAlign: 'left', padding: 8 }}>GSTIN</th>
                                            <th style={{ textAlign: 'left', padding: 8 }}>POS</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(gstinWarning.invoices || []).map((inv) => (
                                            <tr key={String(inv._id)}>
                                                <td style={{ padding: 8 }}>{inv.invoiceNumber}</td>
                                                <td style={{ padding: 8 }}>{inv.invoiceDate ? String(inv.invoiceDate).slice(0, 10) : '—'}</td>
                                                <td style={{ padding: 8, fontFamily: 'monospace' }}>{inv.customerGstin || '—'}</td>
                                                <td style={{ padding: 8 }}>{inv.placeOfSupply || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setGstinWarning((w) => ({ ...w, showList: !w.showList }))}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                            >
                                View Affected Invoices
                            </button>
                            <button
                                type="button"
                                onClick={() => dismissGstinWarning({ reviewGstr1: true })}
                                style={{ padding: '8px 12px', borderRadius: 8, border: 'none', background: '#0d9488', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
                            >
                                Review for GSTR-1 Correction
                            </button>
                            <button
                                type="button"
                                onClick={() => dismissGstinWarning()}
                                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', fontWeight: 600, cursor: 'pointer', fontSize: 12 }}
                            >
                                Ignore for Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
