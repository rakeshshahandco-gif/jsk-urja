import React, { useState, useEffect } from 'react';
import { getCompanyProfile, updateCompanyProfile } from '@/services/settingsApi';
import toast from 'react-hot-toast';

const inp = {
    padding: '10px 14px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#f1f5f9',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
};

const lbl = {
    fontSize: '12px',
    color: '#94a3b8',
    display: 'block',
    marginBottom: '6px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
};

export default function CompanyProfilePage() {
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
        email: '',
        phone: '',
        urn: '',
        cin: '',
        logoUrl: '',
        bankName: '',
        accountNo: '',
        branchName: '',
        ifscCode: '',
    });

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await getCompanyProfile();
            if (res.data) {
                setProfile({
                    companyName: res.data.companyName || '',
                    address: res.data.address || '',
                    city: res.data.city || '',
                    state: res.data.state || '',
                    stateCode: res.data.stateCode || '',
                    pincode: res.data.pincode || '',
                    gstNumber: res.data.gstNumber || '',
                    panNumber: res.data.panNumber || '',
                    email: res.data.email || '',
                    phone: res.data.phone || '',
                    urn: res.data.urn || '',
                    cin: res.data.cin || '',
                    bankName: res.data.bankName || '',
                    accountNo: res.data.accountNo || '',
                    branchName: res.data.branchName || '',
                    ifscCode: res.data.ifscCode || '',
                    logoUrl: res.data.logoUrl || '',
                });
            }
        } catch (error) {
            toast.error('Failed to load company profile');
        } finally {
            setLoading(false);
        }
    };

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
            formData.append('email', profile.email);
            formData.append('phone', profile.phone);
            formData.append('urn', profile.urn);
            formData.append('cin', profile.cin);
            formData.append('bankName', profile.bankName);
            formData.append('accountNo', profile.accountNo);
            formData.append('branchName', profile.branchName);
            formData.append('ifscCode', profile.ifscCode);

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
        <div style={{ padding: '32px', fontFamily: "'Inter', sans-serif", background: '#0f172a', minHeight: '100vh', color: '#f1f5f9' }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <div style={{ marginBottom: '24px' }}>
                    <h1 style={{ margin: '0 0 8px', fontSize: '26px', fontWeight: 800, color: '#f8fafc' }}>
                        🏢 Company Profile
                    </h1>
                    <p style={{ margin: 0, color: '#94a3b8', fontSize: '14px' }}>
                        Manage your company's core details, address, and tax information. These will be used across your invoices and documents.
                    </p>
                </div>

                <form onSubmit={handleSubmit} style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '16px', padding: '28px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)' }}>

                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#60a5fa', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
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
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#60a5fa', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
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
                                <span style={lbl}>CIN (Corporate Identification Number)</span>
                                <input type="text" name="cin" value={profile.cin} onChange={handleChange} style={inp} placeholder="CIN Number" />
                            </div>
                            <div>
                                <span style={lbl}>URN / Registration Number</span>
                                <input type="text" name="urn" value={profile.urn} onChange={handleChange} style={inp} placeholder="URN Number" />
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#60a5fa', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
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
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#60a5fa', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
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
                        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: 700, color: '#60a5fa', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>
                            Branding
                        </h3>
                        <div>
                            <span style={lbl}>Company Logo (Image or PDF)</span>
                            <input
                                type="file"
                                name="logoFile"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        setProfile(prev => ({ ...prev, logoFile: e.target.files[0] }));
                                    }
                                }}
                                accept="image/*,.pdf"
                                style={inp}
                            />
                            <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#64748b' }}>Select a local image or PDF file to upload.</p>

                            {profile.logoFile ? (
                                <div style={{ marginTop: '16px', padding: '12px', background: '#0f172a', borderRadius: '8px', display: 'inline-block', border: '1px solid #334155', color: '#60a5fa' }}>
                                    Selected File: {profile.logoFile.name}
                                </div>
                            ) : profile.logoUrl ? (
                                <div style={{ marginTop: '16px', padding: '12px', background: '#0f172a', borderRadius: '8px', display: 'inline-block', border: '1px solid #334155' }}>
                                    <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#94a3b8' }}>Current Logo:</p>
                                    {profile.logoUrl.endsWith('.pdf') ? (
                                        <a href={profile.logoUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#60a5fa', textDecoration: 'none' }}>
                                            📄 View Existing PDF Logo
                                        </a>
                                    ) : (
                                        <img src={profile.logoUrl} alt="Company Logo" style={{ maxHeight: '60px', maxWidth: '200px', objectFit: 'contain' }} />
                                    )}
                                </div>
                            ) : null}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid #334155', paddingTop: '24px' }}>
                        <button type="submit" disabled={saving} style={{
                            padding: '12px 28px',
                            background: saving ? '#475569' : 'linear-gradient(135deg, #3b82f6, #6366f1)',
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
