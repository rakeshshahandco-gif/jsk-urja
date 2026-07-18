import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { getCompanyProfile, updateCompanyProfile } from '@/services/settingsApi';
import { getIndustryTemplates } from '@/services/industryTemplateApi';
import { getCompanyById, updateCompanyRecord, createCompanyRecord } from '@/services/companyApi';
import {
    getCompanyWorkflowAssignment,
    assignCompanyWorkflow,
    getCompanyWorkflowOptions,
} from '@/services/companyWorkflowAssignmentApi';
import { useCompany } from '@/contexts/CompanyContext';
import InvoiceBarcodeSettingsCard from './InvoiceBarcodeSettingsCard';
import PrintFormatDesignerSettingsCard from './PrintFormatDesignerSettingsCard';
import toast from 'react-hot-toast';

const inp = {
    padding: '10px 14px',
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    color: '#1e293b',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s, box-shadow 0.2s',
};

const lbl = {
    fontSize: '12px',
    color: '#64748b',
    display: 'block',
    marginBottom: '6px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
};

export default function CompanyProfilePage() {
    const navigate = useNavigate();
    const { selectedCompany, companies, switchCompany, refreshCompanies } = useCompany();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showCreateCompany, setShowCreateCompany] = useState(false);
    const [creatingCompany, setCreatingCompany] = useState(false);
    const [newCompany, setNewCompany] = useState({
        companyName: '',
        companyType: 'Pvt Ltd',
        industryTemplateRef: '',
        assignDefaultWorkflow: true,
    });
    const [industryTemplates, setIndustryTemplates] = useState([]);
    const [industryTemplateRef, setIndustryTemplateRef] = useState('');
    const [assignedWorkflowRef, setAssignedWorkflowRef] = useState('');
    const [activeWorkflow, setActiveWorkflow] = useState(false);
    const [workflowVersion, setWorkflowVersion] = useState('');
    const [workflowOptions, setWorkflowOptions] = useState([]);
    const [workflowPreview, setWorkflowPreview] = useState({ description: '', stages: [], warnings: [] });
    const [profile, setProfile] = useState({
        companyName: '',
        address: '',
        city: '',
        state: '',
        stateCode: '',
        pincode: '',
        gstNumber: '',
        panNumber: '',
        tanNumber: '',
        email: '',
        phone: '',
        urn: '',
        cin: '',
        aatoBracket: '',
        gstFilingFrequency: '',
        logoUrl: '',
        bankName: '',
        accountNo: '',
        branchName: '',
        ifscCode: '',
        logoHeight: 65,
    });

    const fetchProfile = useCallback(async () => {
        try {
            setLoading(true);
            const templates = await getIndustryTemplates({ isActive: true });
            setIndustryTemplates(templates || []);

            if (!selectedCompany?._id) {
                return;
            }

            const [res, companyRecord] = await Promise.all([
                getCompanyProfile(),
                getCompanyById(selectedCompany._id),
            ]);
            const savedRef = companyRecord?.industryTemplateRef;
            const savedId = savedRef?._id || savedRef || '';
            if (savedId) {
                setIndustryTemplateRef(String(savedId));
            } else {
                const defaultTpl = (templates || []).find((t) => t.templateCode === 'ELECTRONICS_JSK');
                setIndustryTemplateRef(defaultTpl?._id ? String(defaultTpl._id) : '');
            }

            try {
                const wfData = await getCompanyWorkflowAssignment(selectedCompany._id);
                setAssignedWorkflowRef(wfData?.assignment?.assignedWorkflowRef ? String(wfData.assignment.assignedWorkflowRef) : '');
                setActiveWorkflow(!!wfData?.assignment?.activeWorkflow);
                setWorkflowVersion(wfData?.assignment?.workflowVersion || '');
                setWorkflowPreview({
                    description: wfData?.workflow?.description || '',
                    stages: wfData?.previewStages || [],
                    warnings: wfData?.warnings || [],
                });
            } catch {
                setAssignedWorkflowRef('');
                setActiveWorkflow(false);
                setWorkflowVersion('');
                setWorkflowPreview({ description: '', stages: [], warnings: [] });
            }

            try {
                const opts = await getCompanyWorkflowOptions(selectedCompany._id, savedId || industryTemplateRef);
                setWorkflowOptions(opts || []);
            } catch {
                setWorkflowOptions([]);
            }
            const row = res?.data || res;
            if (row) {
                setProfile({
                    companyName: row.companyName || '',
                    address: row.address || '',
                    city: row.city || '',
                    state: row.state || '',
                    stateCode: row.stateCode || '',
                    pincode: row.pincode || '',
                    gstNumber: row.gstNumber || '',
                    panNumber: row.panNumber || '',
                    email: row.email || '',
                    phone: row.phone || '',
                    urn: row.urn || '',
                    cin: row.cin || '',
                    aatoBracket: row.aatoBracket || 'Up to 5Cr',
                    gstFilingFrequency: row.gstFilingFrequency || 'Monthly',
                    bankName: row.bankName || '',
                    accountNo: row.accountNo || '',
                    branchName: row.branchName || '',
                    ifscCode: row.ifscCode || '',
                    logoUrl: row.logoUrl || '',
                    logoHeight: row.logoHeight || 65,
                });
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to load company profile');
        } finally {
            setLoading(false);
        }
    }, [selectedCompany?._id]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    useEffect(() => {
        if (!selectedCompany?._id || !industryTemplateRef) {
            setWorkflowOptions([]);
            return undefined;
        }
        let cancelled = false;
        getCompanyWorkflowOptions(selectedCompany._id, industryTemplateRef)
            .then((opts) => { if (!cancelled) setWorkflowOptions(opts || []); })
            .catch(() => { if (!cancelled) setWorkflowOptions([]); });
        return () => { cancelled = true; };
    }, [industryTemplateRef, selectedCompany?._id]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
    };

    const handleCreateCompany = async (e) => {
        e.preventDefault();
        if (!newCompany.companyName.trim()) {
            toast.error('Company name is required');
            return;
        }
        if (!newCompany.industryTemplateRef) {
            toast.error('Select an industry template for the new company');
            return;
        }
        setCreatingCompany(true);
        try {
            const created = await createCompanyRecord({
                companyName: newCompany.companyName.trim(),
                companyType: newCompany.companyType,
                industryTemplateRef: newCompany.industryTemplateRef,
                isActive: true,
            });

            if (newCompany.assignDefaultWorkflow) {
                try {
                    await assignCompanyWorkflow(created._id, {
                        useSuggestedDefault: true,
                        activeWorkflow: true,
                    });
                } catch (wfErr) {
                    toast.error(wfErr?.response?.data?.message || 'Company created but workflow assignment failed');
                }
            }

            const list = await refreshCompanies();
            const fresh = list.find((c) => c._id === created._id) || created;
            switchCompany(fresh);
            toast.success(`Company "${created.companyName}" created. Switching…`);
            setShowCreateCompany(false);
            setNewCompany({
                companyName: '',
                companyType: 'Pvt Ltd',
                industryTemplateRef: '',
                assignDefaultWorkflow: true,
            });
            window.location.reload();
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to create company');
        } finally {
            setCreatingCompany(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const formData = new FormData();
            formData.append('companyName', profile.companyName);
            formData.append('address', profile.address);
            formData.append('city', profile.city);
            formData.append('state', profile.state);
            formData.append('stateCode', profile.stateCode);
            formData.append('pincode', profile.pincode);
            formData.append('gstNumber', profile.gstNumber);
            formData.append('panNumber', profile.panNumber);
            formData.append('tanNumber', (profile.tanNumber || '').trim().toUpperCase());
            formData.append('email', profile.email);
            formData.append('phone', profile.phone);
            formData.append('urn', profile.urn);
            formData.append('cin', profile.cin);
            formData.append('aatoBracket', profile.aatoBracket);
            formData.append('gstFilingFrequency', profile.gstFilingFrequency);
            formData.append('bankName', profile.bankName);
            formData.append('accountNo', profile.accountNo);
            formData.append('branchName', profile.branchName);
            formData.append('ifscCode', profile.ifscCode);
            formData.append('logoHeight', profile.logoHeight);

            // Only append file if a new one was selected
            if (profile.logoFile) {
                formData.append('logoFile', profile.logoFile);
            }

            const data = await updateCompanyProfile(formData);

            await updateCompanyRecord(selectedCompany._id, {
                companyName: profile.companyName.trim(),
                industryTemplateRef: industryTemplateRef || null,
            });

            const wfResult = await assignCompanyWorkflow(selectedCompany._id, {
                assignedWorkflowRef: assignedWorkflowRef || null,
                activeWorkflow,
            });
            setWorkflowVersion(wfResult?.assignment?.workflowVersion || '');
            setWorkflowPreview({
                description: wfResult?.workflow?.description || '',
                stages: wfResult?.previewStages || [],
                warnings: wfResult?.warnings || [],
            });

            // Re-fetch profile to get updated URLs
            if (data?.data) {
                setProfile(prev => ({
                    ...prev,
                    logoUrl: data.data.logoUrl || prev.logoUrl,
                    logoHeight: data.data.logoHeight || prev.logoHeight,
                    logoFile: null // clear picked file after upload
                }));
            }

            await refreshCompanies();
            toast.success('Company profile updated successfully!');
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div style={{ padding: '30px', color: '#94a3b8' }}>Loading profile...</div>;
    }

    return (
        <div style={{ padding: '32px', fontFamily: "'Inter', sans-serif", background: '#f8fafc', minHeight: '100vh', color: '#1e293b' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ margin: '0 0 8px', fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
                        🏢 Company Profile
                    </h1>
                    <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>
                        Manage your company&apos;s core details, address, and tax information. These will be used across your invoices and documents.
                    </p>
                </div>

                <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '20px 24px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ margin: '0 0 6px', fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Active Company</h3>
                            <p style={{ margin: 0, fontSize: '14px', color: '#334155' }}>
                                <strong>{selectedCompany?.companyName || '—'}</strong>
                                {selectedCompany?.industryTemplateRef?.templateName && (
                                    <span style={{ color: '#64748b' }}> · {selectedCompany.industryTemplateRef.templateName}</span>
                                )}
                            </p>
                            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>
                                {companies.length > 1
                                    ? 'Switch from the header dropdown, browse all companies, or create another below.'
                                    : 'Browse all companies or create another below.'}
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={() => navigate(PATHS.SETTINGS.COMPANIES_LIST)}
                            style={{
                                padding: '8px 14px',
                                background: '#fff',
                                color: '#2563eb',
                                border: '1px solid #93c5fd',
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            View All Companies
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreateCompany((v) => !v)}
                            style={{
                                padding: '8px 14px',
                                background: showCreateCompany ? '#f1f5f9' : '#2563eb',
                                color: showCreateCompany ? '#334155' : '#fff',
                                border: showCreateCompany ? '1px solid #cbd5e1' : 'none',
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: 'pointer',
                            }}
                        >
                            {showCreateCompany ? 'Cancel' : '+ Create New Company'}
                        </button>
                        </div>
                    </div>

                    {showCreateCompany && (
                        <form onSubmit={handleCreateCompany} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                            <p style={{ margin: '0 0 14px', fontSize: 13, color: '#64748b' }}>
                                Add a separate company for another industry (e.g. Textile) without changing JSK URJA electronics settings.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <span style={lbl}>Company Name *</span>
                                    <input
                                        value={newCompany.companyName}
                                        onChange={(e) => setNewCompany((p) => ({ ...p, companyName: e.target.value }))}
                                        placeholder="e.g. HETPL Textile Pvt Ltd"
                                        style={inp}
                                        required
                                    />
                                </div>
                                <div>
                                    <span style={lbl}>Company Type</span>
                                    <select
                                        value={newCompany.companyType}
                                        onChange={(e) => setNewCompany((p) => ({ ...p, companyType: e.target.value }))}
                                        style={{ ...inp, cursor: 'pointer' }}
                                    >
                                        {['Pvt Ltd', 'Partnership', 'Proprietorship', 'LLP', 'Other'].map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <span style={lbl}>Industry Template *</span>
                                    <select
                                        value={newCompany.industryTemplateRef}
                                        onChange={(e) => setNewCompany((p) => ({ ...p, industryTemplateRef: e.target.value }))}
                                        style={{ ...inp, cursor: 'pointer' }}
                                        required
                                    >
                                        <option value="">Select industry…</option>
                                        {industryTemplates.map((t) => (
                                            <option key={t._id} value={t._id}>
                                                {t.templateName} ({t.templateCode})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 13 }}>
                                <input
                                    type="checkbox"
                                    checked={newCompany.assignDefaultWorkflow}
                                    onChange={(e) => setNewCompany((p) => ({ ...p, assignDefaultWorkflow: e.target.checked }))}
                                />
                                Assign default workflow for selected industry (recommended for Textile / Handloom)
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                                <button
                                    type="submit"
                                    disabled={creatingCompany}
                                    style={{
                                        padding: '10px 18px',
                                        background: '#059669',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: 8,
                                        fontWeight: 600,
                                        fontSize: 13,
                                        cursor: creatingCompany ? 'not-allowed' : 'pointer',
                                        opacity: creatingCompany ? 0.7 : 1,
                                    }}
                                >
                                    {creatingCompany ? 'Creating…' : 'Create Company & Switch'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>

                <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' }}>

                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#2563eb', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                            Industry &amp; Workflow
                        </h3>
                        {workflowPreview.warnings?.length > 0 && (
                            <div style={{ marginBottom: 12, padding: 12, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, fontSize: 12, color: '#9a3412' }}>
                                {workflowPreview.warnings.includes('workflow_deleted') && <div>Assigned workflow was deleted. Showing last saved snapshot only.</div>}
                                {workflowPreview.warnings.includes('workflow_inactive') && <div>Assigned workflow is inactive.</div>}
                                {workflowPreview.warnings.includes('workflow_version_outdated') && <div>Workflow master was updated after assignment. Historical records keep the snapshot from assignment time.</div>}
                                {workflowPreview.warnings.includes('template_mismatch') && <div>Workflow industry template differs from company industry template.</div>}
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <span style={lbl}>Industry Template</span>
                                <select
                                    value={industryTemplateRef}
                                    onChange={(e) => setIndustryTemplateRef(e.target.value)}
                                    style={{ ...inp, cursor: 'pointer' }}
                                >
                                    {industryTemplates.length === 0 && (
                                        <option value="">Loading templates…</option>
                                    )}
                                    {industryTemplates.map((t) => (
                                        <option key={t._id} value={t._id}>
                                            {t.templateName} ({t.templateCode})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <span style={lbl}>Assigned Workflow</span>
                                <select
                                    value={assignedWorkflowRef}
                                    onChange={(e) => setAssignedWorkflowRef(e.target.value)}
                                    style={{ ...inp, cursor: 'pointer' }}
                                >
                                    <option value="">— None / use template default later —</option>
                                    {workflowOptions.map((w) => (
                                        <option key={w._id} value={w._id}>
                                            {w.workflowName}{w.isActive ? '' : ' (inactive)'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 12 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                                <input type="checkbox" checked={activeWorkflow} onChange={(e) => setActiveWorkflow(e.target.checked)} />
                                Active Workflow
                            </label>
                            <span style={{ fontSize: 12, color: '#64748b' }}>
                                Version: {workflowVersion ? new Date(workflowVersion).toLocaleString('en-IN') : '—'}
                            </span>
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        const data = await assignCompanyWorkflow(selectedCompany._id, { useSuggestedDefault: true, activeWorkflow: true });
                                        setAssignedWorkflowRef(data?.assignment?.assignedWorkflowRef ? String(data.assignment.assignedWorkflowRef) : '');
                                        setActiveWorkflow(!!data?.assignment?.activeWorkflow);
                                        setWorkflowVersion(data?.assignment?.workflowVersion || '');
                                        setWorkflowPreview({
                                            description: data?.workflow?.description || '',
                                            stages: data?.previewStages || [],
                                            warnings: data?.warnings || [],
                                        });
                                        toast.success('Suggested workflow applied');
                                    } catch (err) {
                                        toast.error(err?.response?.data?.message || 'No suggested workflow for this template');
                                    }
                                }}
                                style={{ height: 30, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                            >
                                Use template default workflow
                            </button>
                        </div>
                        {workflowPreview.description && (
                            <p style={{ margin: '12px 0 8px', fontSize: 13, color: '#475569' }}>{workflowPreview.description}</p>
                        )}
                        {workflowPreview.stages?.length > 0 && (
                            <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                                <div style={{ padding: '8px 12px', background: '#f8fafc', fontSize: 11, fontWeight: 700, color: '#64748b' }}>Workflow Stages Preview</div>
                                <ol style={{ margin: 0, padding: '12px 12px 12px 28px', fontSize: 13, color: '#334155' }}>
                                    {workflowPreview.stages.map((s, i) => (
                                        <li key={s._id || i} style={{ marginBottom: 4 }}>{s.stageName}</li>
                                    ))}
                                </ol>
                            </div>
                        )}
                        <span style={{ fontSize: 11, color: '#64748b', display: 'block', marginTop: 8 }}>
                            JSK URJA: leave unset to preserve existing behavior. Assignment is configuration only — production is not driven by this yet.
                        </span>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#2563eb', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                            Business Information
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                            <div>
                                <span style={lbl}>Company Name *</span>
                                <input type="text" name="companyName" value={profile.companyName} onChange={handleChange} required style={inp} placeholder="e.g. JSK URJA" />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                            <div>
                                <span style={lbl}>Company Email</span>
                                <input type="email" name="email" value={profile.email} onChange={handleChange} style={inp} placeholder="info@company.com" />
                            </div>
                            <div>
                                <span style={lbl}>Phone Number</span>
                                <input type="text" name="phone" value={profile.phone} onChange={handleChange} style={inp} placeholder="+91 9876543210" />
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#2563eb', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                            Tax Details
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <span style={lbl}>GST Number</span>
                                <input type="text" name="gstNumber" value={profile.gstNumber} onChange={handleChange} style={inp} placeholder="15-digit GSTIN" />
                            </div>
                            <div>
                                <span style={lbl}>PAN / Income Tax No.</span>
                                <input type="text" name="panNumber" value={profile.panNumber} onChange={handleChange} style={inp} placeholder="10-character PAN" />
                            </div>
                            <div>
                                <span style={lbl}>TDS No. (TAN)</span>
                                <input
                                    type="text"
                                    name="tanNumber"
                                    value={profile.tanNumber}
                                    onChange={(e) =>
                                        setProfile((prev) => ({
                                            ...prev,
                                            tanNumber: e.target.value.toUpperCase(),
                                        }))
                                    }
                                    style={inp}
                                    placeholder="e.g. ABCD12345E"
                                    maxLength={10}
                                />
                            </div>
                            <div>
                                <span style={lbl}>CIN (Corporate Identification Number)</span>
                                <input type="text" name="cin" value={profile.cin} onChange={handleChange} style={inp} placeholder="CIN Number" />
                            </div>
                            <div>
                                <span style={lbl}>URN / Registration Number</span>
                                <input type="text" name="urn" value={profile.urn} onChange={handleChange} style={inp} placeholder="URN Number" />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
                            <div>
                                <span style={lbl}>AATO Bracket (GSTR-1 Rule)</span>
                                <select name="aatoBracket" value={profile.aatoBracket} onChange={handleChange} style={inp}>
                                    <option value="Up to 5Cr">Up to 5 Crore (4-Digit HSN)</option>
                                    <option value="Above 5Cr">Above 5 Crore (6-Digit HSN)</option>
                                </select>
                            </div>
                            <div>
                                <span style={lbl}>GST Filing Frequency</span>
                                <select name="gstFilingFrequency" value={profile.gstFilingFrequency} onChange={handleChange} style={inp}>
                                    <option value="Monthly">Monthly</option>
                                    <option value="Quarterly">Quarterly (QRMP)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#2563eb', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                            Bank Information
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div>
                                <span style={lbl}>Bank Name</span>
                                <input type="text" name="bankName" value={profile.bankName} onChange={handleChange} style={inp} placeholder="Bank Name" />
                            </div>
                            <div>
                                <span style={lbl}>Account Number</span>
                                <input type="text" name="accountNo" value={profile.accountNo} onChange={handleChange} style={inp} placeholder="Account Number" />
                            </div>
                            <div>
                                <span style={lbl}>Branch Name</span>
                                <input type="text" name="branchName" value={profile.branchName} onChange={handleChange} style={inp} placeholder="Branch Name" />
                            </div>
                            <div>
                                <span style={lbl}>IFSC Code</span>
                                <input type="text" name="ifscCode" value={profile.ifscCode} onChange={handleChange} style={inp} placeholder="IFSC Code" />
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#2563eb', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                            Address Details
                        </h3>
                        <div style={{ display: 'grid', gap: '16px' }}>
                            <div>
                                <span style={lbl}>Full Address</span>
                                <textarea name="address" value={profile.address} onChange={handleChange} style={{ ...inp, height: '80px', resize: 'vertical' }} placeholder="Plot No, Street, Landmark" />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                <div>
                                    <span style={lbl}>City</span>
                                    <input type="text" name="city" value={profile.city} onChange={handleChange} style={inp} placeholder="Local City" />
                                </div>
                                <div>
                                    <span style={lbl}>Pincode</span>
                                    <input type="text" name="pincode" value={profile.pincode} onChange={handleChange} style={inp} placeholder="Area code" />
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                                <div>
                                    <span style={lbl}>State</span>
                                    <input type="text" name="state" value={profile.state} onChange={handleChange} style={inp} placeholder="e.g. Gujarat" />
                                </div>
                                <div>
                                    <span style={lbl}>State Code</span>
                                    <input type="text" name="stateCode" value={profile.stateCode} onChange={handleChange} style={inp} placeholder="e.g. 24" />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '32px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#2563eb', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                            Branding
                        </h3>
                        <div>
                            <span style={lbl}>Company Logo (Accepts: PNG, JPG, JPEG, PDF)</span>
                            <input
                                type="file"
                                id="logoInput"
                                name="logoFile"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        setProfile(prev => ({ ...prev, logoFile: e.target.files[0] }));
                                    }
                                }}
                                accept="image/png,image/jpeg,image/jpg,application/pdf"
                                style={{ ...inp, display: 'none' }}
                            />
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <button
                                    type="button"
                                    onClick={() => document.getElementById('logoInput').click()}
                                    style={{
                                        padding: '8px 16px',
                                        background: '#f1f5f9',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        color: '#475569'
                                    }}
                                >
                                    📁 Choose New logo
                                </button>
                                <span style={{ fontSize: '12px', color: '#64748b' }}> Max size: 5MB </span>
                            </div>

                            {profile.logoFile ? (
                                <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px', display: 'inline-block', border: '1px solid #e2e8f0', color: '#2563eb' }}>
                                    Selected File: {profile.logoFile.name}
                                </div>
                            ) : profile.logoUrl ? (
                                <div style={{ marginTop: '16px', padding: '12px', background: '#f8fafc', borderRadius: '8px', display: 'inline-block', border: '1px solid #e2e8f0' }}>
                                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748b' }}>Current Logo:</p>
                                    {profile.logoUrl.endsWith('.pdf') ? (
                                        <a href={profile.logoUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
                                            📄 View Existing PDF Logo
                                        </a>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            <img src={profile.logoUrl} alt="Company Logo" style={{ maxHeight: `${profile.logoHeight}px`, maxWidth: '200px', objectFit: 'contain' }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ fontSize: '12px', color: '#64748b' }}>Display Height:</span>
                                                <input
                                                    type="range"
                                                    min="20"
                                                    max="150"
                                                    value={profile.logoHeight}
                                                    onChange={(e) => setProfile(prev => ({ ...prev, logoHeight: e.target.value }))}
                                                    style={{ width: '150px' }}
                                                />
                                                <span style={{ fontSize: '12px', fontWeight: 600 }}>{profile.logoHeight}px</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <InvoiceBarcodeSettingsCard />

                    <PrintFormatDesignerSettingsCard />

                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', paddingTop: '24px' }}>
                        <button type="submit" disabled={saving} style={{
                            padding: '12px 28px',
                            background: saving ? '#94a3b8' : 'linear-gradient(135deg, #2563eb, #4f46e5)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: 700,
                            fontSize: '14px',
                            boxShadow: saving ? 'none' : '0 4px 6px -1px rgba(59, 130, 246, 0.4)'
                        }}>
                            {saving ? 'Saving...' : '💾 Save Profile'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
