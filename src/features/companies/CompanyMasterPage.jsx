import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Edit2, ToggleLeft, ToggleRight, Save, X, Upload, CheckCircle, XCircle } from 'lucide-react';
import { apiClient } from '@/config/apiClient';
import { useCompany } from '@/contexts/CompanyContext';
import styles from './CompanyMasterPage.module.scss';

const EMPTY_FORM = {
    companyName: '',
    companyType: 'Pvt Ltd',
    legalName: '',
    brandName: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    gstNumber: '',
    panNumber: '',
    cinNumber: '',
    contactPerson: '',
    mobile: '',
    email: '',
    website: '',
    bankDetails: { bankName: '', accountNo: '', accountType: '', branchName: '', ifscCode: '', swiftCode: '' },
    termsAndConditions: '',
    defaultFinancialYear: '',
    isActive: true,
};

export default function CompanyMasterPage() {
    const [companies, setCompanies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState(null);
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreview, setLogoPreview] = useState('');
    const { refreshCompanies } = useCompany();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/companies');
            setCompanies(res.data?.data || []);
        } catch (err) {
            showMsg('Failed to load companies: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const showMsg = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 4000);
    };

    const handleEdit = (company) => {
        setEditingId(company._id);
        setForm({
            companyName: company.companyName || '',
            companyType: company.companyType || 'Pvt Ltd',
            legalName: company.legalName || '',
            brandName: company.brandName || '',
            address: company.address || '',
            city: company.city || '',
            state: company.state || '',
            pincode: company.pincode || '',
            country: company.country || 'India',
            gstNumber: company.gstNumber || '',
            panNumber: company.panNumber || '',
            cinNumber: company.cinNumber || '',
            contactPerson: company.contactPerson || '',
            mobile: company.mobile || '',
            email: company.email || '',
            website: company.website || '',
            bankDetails: {
                bankName: company.bankDetails?.bankName || '',
                accountNo: company.bankDetails?.accountNo || '',
                accountType: company.bankDetails?.accountType || '',
                branchName: company.bankDetails?.branchName || '',
                ifscCode: company.bankDetails?.ifscCode || '',
                swiftCode: company.bankDetails?.swiftCode || '',
            },
            termsAndConditions: company.termsAndConditions || '',
            defaultFinancialYear: company.defaultFinancialYear || '',
            isActive: company.isActive !== false,
        });
        setLogoPreview(company.logoUrl || '');
        setLogoFile(null);
        setShowForm(true);
    };

    const handleNew = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setLogoPreview('');
        setLogoFile(null);
        setShowForm(true);
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingId(null);
        setForm(EMPTY_FORM);
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name.startsWith('bankDetails.')) {
            const key = name.split('.')[1];
            setForm(f => ({ ...f, bankDetails: { ...f.bankDetails, [key]: value } }));
        } else {
            setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
        }
    };

    const handleLogoChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setLogoFile(file);
        setLogoPreview(URL.createObjectURL(file));
    };

    const handleSave = async () => {
        if (!form.companyName.trim()) {
            showMsg('Company Name is required', 'error');
            return;
        }
        setSaving(true);
        try {
            let payload = { ...form };

            // Upload logo first if there's a new file
            if (logoFile) {
                const fd = new FormData();
                fd.append('logoFile', logoFile);
                const uploadRes = await apiClient.post('/companies/upload-logo', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                payload.logoUrl = uploadRes.data?.logoUrl || '';
            }

            if (editingId) {
                await apiClient.put(`/companies/${editingId}`, payload);
                showMsg('Company updated successfully');
            } else {
                await apiClient.post('/companies', payload);
                showMsg('Company created successfully');
            }
            setShowForm(false);
            await load();
            await refreshCompanies();
        } catch (err) {
            showMsg(err.response?.data?.message || err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleToggle = async (company) => {
        if (company.isDefault) {
            showMsg('Cannot deactivate the default company', 'error');
            return;
        }
        try {
            await apiClient.patch(`/companies/${company._id}/toggle-active`);
            await load();
            await refreshCompanies();
        } catch (err) {
            showMsg(err.response?.data?.message || err.message, 'error');
        }
    };

    return (
        <div className={styles.page}>
            <div className={styles.topBar}>
                <div className={styles.titleArea}>
                    <Building2 size={24} className={styles.titleIcon} />
                    <div>
                        <h1 className={styles.title}>Company Master</h1>
                        <p className={styles.subtitle}>Manage all your companies in one place</p>
                    </div>
                </div>
                <button className={styles.btnPrimary} onClick={handleNew}>
                    <Plus size={16} /> Add Company
                </button>
            </div>

            {message && (
                <div className={`${styles.alertBanner} ${message.type === 'error' ? styles.alertError : styles.alertSuccess}`}>
                    {message.type === 'error' ? <XCircle size={16} /> : <CheckCircle size={16} />}
                    {message.text}
                </div>
            )}

            {/* Company List */}
            {loading ? (
                <div className={styles.loadingState}>Loading companies…</div>
            ) : (
                <div className={styles.cardGrid}>
                    {companies.map(c => (
                        <div key={c._id} className={`${styles.companyCard} ${!c.isActive ? styles.inactive : ''}`}>
                            {c.isDefault && <span className={styles.defaultBadge}>Default</span>}
                            <div className={styles.cardHeader}>
                                {c.logoUrl ? (
                                    <img src={c.logoUrl} alt="logo" className={styles.cardLogo} />
                                ) : (
                                    <div className={styles.cardLogoPlaceholder}>
                                        <Building2 size={28} />
                                    </div>
                                )}
                                <div className={styles.cardInfo}>
                                    <h3 className={styles.cardName}>{c.companyName}</h3>
                                    <span className={styles.cardType}>{c.companyType}</span>
                                </div>
                            </div>
                            <div className={styles.cardDetails}>
                                {c.gstNumber && <div className={styles.cardDetail}><span>GST:</span> {c.gstNumber}</div>}
                                {c.city && <div className={styles.cardDetail}><span>City:</span> {c.city}, {c.state}</div>}
                                {c.mobile && <div className={styles.cardDetail}><span>Mobile:</span> {c.mobile}</div>}
                            </div>
                            <div className={styles.cardActions}>
                                <button className={styles.btnEdit} onClick={() => handleEdit(c)}>
                                    <Edit2 size={14} /> Edit
                                </button>
                                <button
                                    className={`${styles.btnToggle} ${c.isActive ? styles.active : styles.deactive}`}
                                    onClick={() => handleToggle(c)}
                                    disabled={c.isDefault}
                                    title={c.isDefault ? 'Default company cannot be deactivated' : ''}
                                >
                                    {c.isActive ? <><ToggleRight size={16} /> Active</> : <><ToggleLeft size={16} /> Inactive</>}
                                </button>
                            </div>
                        </div>
                    ))}
                    {companies.length === 0 && (
                        <div className={styles.emptyState}>No companies found. Click "Add Company" to get started.</div>
                    )}
                </div>
            )}

            {/* Slide-in Form */}
            {showForm && (
                <div className={styles.formOverlay}>
                    <div className={styles.formPanel}>
                        <div className={styles.formHeader}>
                            <h2>{editingId ? 'Edit Company' : 'New Company'}</h2>
                            <button onClick={handleCancel} className={styles.btnClose}><X size={20} /></button>
                        </div>

                        <div className={styles.formBody}>
                            {/* Section: Identity */}
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Company Identity</h3>
                                <div className={styles.formGrid}>
                                    <div className={styles.field}>
                                        <label>Company Name <span className={styles.req}>*</span></label>
                                        <input name="companyName" value={form.companyName} onChange={handleChange} placeholder="JSK Innovative Technology Pvt Ltd" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Company Type</label>
                                        <select name="companyType" value={form.companyType} onChange={handleChange}>
                                            {['Pvt Ltd', 'Partnership', 'Proprietorship', 'LLP', 'Other'].map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Legal Name</label>
                                        <input name="legalName" value={form.legalName} onChange={handleChange} placeholder="As per MCA / GSTIN" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Brand Name</label>
                                        <input name="brandName" value={form.brandName} onChange={handleChange} placeholder="Trade / Brand Name" />
                                    </div>
                                </div>
                            </div>

                            {/* Section: Address */}
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Address</h3>
                                <div className={styles.formGrid}>
                                    <div className={`${styles.field} ${styles.span2}`}>
                                        <label>Address</label>
                                        <textarea name="address" value={form.address} onChange={handleChange} rows={2} placeholder="Street, Building, Area" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>City</label>
                                        <input name="city" value={form.city} onChange={handleChange} placeholder="City" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>State</label>
                                        <input name="state" value={form.state} onChange={handleChange} placeholder="State" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Pincode</label>
                                        <input name="pincode" value={form.pincode} onChange={handleChange} placeholder="Pincode" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Country</label>
                                        <input name="country" value={form.country} onChange={handleChange} placeholder="Country" />
                                    </div>
                                </div>
                            </div>

                            {/* Section: Legal */}
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Legal Information</h3>
                                <div className={styles.formGrid}>
                                    <div className={styles.field}>
                                        <label>GST Number</label>
                                        <input name="gstNumber" value={form.gstNumber} onChange={handleChange} placeholder="27AAABC1234D1ZE" style={{ textTransform: 'uppercase' }} />
                                    </div>
                                    <div className={styles.field}>
                                        <label>PAN Number</label>
                                        <input name="panNumber" value={form.panNumber} onChange={handleChange} placeholder="AAABC1234D" style={{ textTransform: 'uppercase' }} />
                                    </div>
                                    <div className={styles.field}>
                                        <label>CIN / Registration No</label>
                                        <input name="cinNumber" value={form.cinNumber} onChange={handleChange} placeholder="U12345MH2024PTC123456" />
                                    </div>
                                </div>
                            </div>

                            {/* Section: Contact */}
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Contact Details</h3>
                                <div className={styles.formGrid}>
                                    <div className={styles.field}>
                                        <label>Contact Person</label>
                                        <input name="contactPerson" value={form.contactPerson} onChange={handleChange} placeholder="Name" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Mobile</label>
                                        <input name="mobile" value={form.mobile} onChange={handleChange} placeholder="+91 9876543210" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Email</label>
                                        <input name="email" value={form.email} onChange={handleChange} placeholder="info@company.com" type="email" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Website</label>
                                        <input name="website" value={form.website} onChange={handleChange} placeholder="https://www.company.com" />
                                    </div>
                                </div>
                            </div>

                            {/* Section: Bank */}
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Bank Details</h3>
                                <div className={styles.formGrid}>
                                    <div className={styles.field}>
                                        <label>Bank Name</label>
                                        <input name="bankDetails.bankName" value={form.bankDetails.bankName} onChange={handleChange} placeholder="Bank Name" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Account No</label>
                                        <input name="bankDetails.accountNo" value={form.bankDetails.accountNo} onChange={handleChange} placeholder="Account Number" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Account Type</label>
                                        <input name="bankDetails.accountType" value={form.bankDetails.accountType} onChange={handleChange} placeholder="Current / Savings" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>Branch</label>
                                        <input name="bankDetails.branchName" value={form.bankDetails.branchName} onChange={handleChange} placeholder="Branch Name" />
                                    </div>
                                    <div className={styles.field}>
                                        <label>IFSC Code</label>
                                        <input name="bankDetails.ifscCode" value={form.bankDetails.ifscCode} onChange={handleChange} placeholder="HDFC0001234" style={{ textTransform: 'uppercase' }} />
                                    </div>
                                </div>
                            </div>

                            {/* Section: Logo */}
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Logo & Signature</h3>
                                <div className={styles.formGrid}>
                                    <div className={styles.field}>
                                        <label>Company Logo</label>
                                        <div className={styles.logoUpload}>
                                            {logoPreview && <img src={logoPreview} alt="preview" className={styles.logoPreview} />}
                                            <label className={styles.uploadBtn}>
                                                <Upload size={14} /> Upload Logo
                                                <input type="file" accept="image/*" onChange={handleLogoChange} style={{ display: 'none' }} />
                                            </label>
                                        </div>
                                    </div>
                                    <div className={styles.field}>
                                        <label>Default Financial Year</label>
                                        <input name="defaultFinancialYear" value={form.defaultFinancialYear} onChange={handleChange} placeholder="e.g. 26-27" />
                                    </div>
                                </div>
                            </div>

                            {/* Section: T&C */}
                            <div className={styles.section}>
                                <h3 className={styles.sectionTitle}>Terms & Conditions</h3>
                                <div className={styles.field}>
                                    <textarea name="termsAndConditions" value={form.termsAndConditions} onChange={handleChange} rows={4} placeholder="Default terms & conditions for this company (shown on invoices, orders, etc.)" className={styles.fullWidth} />
                                </div>
                            </div>
                        </div>

                        <div className={styles.formFooter}>
                            <button className={styles.btnCancel} onClick={handleCancel} disabled={saving}>
                                <X size={14} /> Cancel
                            </button>
                            <button className={styles.btnSave} onClick={handleSave} disabled={saving}>
                                <Save size={14} /> {saving ? 'Saving…' : 'Save Company'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
