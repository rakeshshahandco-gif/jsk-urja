import React, { useState, useEffect, useCallback } from 'react';
import { getCompanyProfile, updateCompanyProfile } from '@/services/settingsApi';
import { useCompany } from '@/contexts/CompanyContext';
import InvoiceBarcodeSettingsCard from './InvoiceBarcodeSettingsCard';
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
    const { selectedCompany } = useCompany();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
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
        if (!selectedCompany?._id) return;
        try {
            setLoading(true);
            const res = await getCompanyProfile();
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

    const handleChange = (e) => {
        const { name, value } = e.target;
        setProfile(prev => ({ ...prev, [name]: value }));
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

            // Re-fetch profile to get updated URLs
            if (data?.data) {
                setProfile(prev => ({
                    ...prev,
                    logoUrl: data.data.logoUrl || prev.logoUrl,
                    logoHeight: data.data.logoHeight || prev.logoHeight,
                    logoFile: null // clear picked file after upload
                }));
            }

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

                <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '28px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)' }}>

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
