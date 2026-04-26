import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Save, User, Briefcase, IndianRupee, Landmark, Camera, MapPin, Loader2 } from 'lucide-react';
import { getEmployee, createEmployee, updateEmployee, getShifts, generateEmployeeCode } from '@/services/hrApi';
import { fetchGeocodeAddress } from '@/services/locationApi';
import { getDepartments } from '@/services/userApi';
import { getUsers } from '@/services/userApi';
import { useToast } from '@/components/ui/Toast';

const TABS = [
    { id: 'personal', label: '1. Personal Info', icon: <User size={14} /> },
    { id: 'employment', label: '2. Employment', icon: <Briefcase size={14} /> },
    { id: 'salary', label: '3. Salary Structure', icon: <IndianRupee size={14} /> },
    { id: 'bank', label: '4. Bank & Identification', icon: <Landmark size={14} /> },
];

const f = {
    label: { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.02em' },
    input: { width: '100%', height: 36, fontSize: 14, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' },
    sel: { width: '100%', height: 36, fontSize: 14, padding: '0 30px 0 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', outline: 'none', appearance: 'none', cursor: 'pointer', backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center', backgroundSize: '1.1em', boxSizing: 'border-box' },
    textarea: { width: '100%', fontSize: 14, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', outline: 'none', resize: 'vertical', boxSizing: 'border-box' },
    sectionTitle: { fontSize: 13, fontWeight: 800, color: '#1e293b', borderBottom: '1px solid #e2e8f0', paddingBottom: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 },
    row: (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: 16, marginBottom: 16 }),
};

const Field = ({ label, children, required }) => (
    <div style={{ marginBottom: 12 }}>
        <label style={f.label}>{label} {required && <span style={{ color: '#ef4444' }}>*</span>}</label>
        {children}
    </div>
);

const DEFAULT = {
    employeeCode: '', employeeName: '', department: '', designation: '', branch: 'Main Branch', reportingManager: '',
    mobileNumber: '', email: '', address: '', dateOfJoining: new Date().toISOString().split('T')[0], dateOfLeaving: '',
    employmentStatus: 'Active', employmentType: 'Permanent', shiftType: '', weeklyOff: ['Sunday'],
    salaryType: 'Monthly', basicSalary: 0, hra: 0, conveyance: 0, specialAllowance: 0, incentive: 0, overtimeRate: 0,
    pfApplicable: false, esicApplicable: false, bankName: '', bankAccountNumber: '', ifscCode: '',
    uan: '', aadhaarNo: '', panNo: '', remarks: '', employeePhoto: '', userId: null,
    pincode: '', city: '', state: '', country: 'India'
};

const EmployeeForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToast } = useToast();
    const isEdit = !!id;
    
    const [activeTab, setActiveTab] = useState('personal');
    const [form, setForm] = useState({ ...DEFAULT });
    const [loading, setLoading] = useState(isEdit);
    const [saving, setSaving] = useState(false);
    const [generatingCode, setGeneratingCode] = useState(false);
    const [isFetchingPin, setIsFetchingPin] = useState(false);

    const handleFetchPin = async () => {
        const addressText = form.address;
        if (!addressText || !addressText.trim()) {
            addToast('Please enter an address first', 'error');
            return;
        }

        setIsFetchingPin(true);
        try {
            const data = await fetchGeocodeAddress(addressText);
            let updatedPin = false;
            
            setForm(prev => {
                const newForm = { ...prev };
                if (data.postalCode && (!newForm.pincode || !newForm.pincode.trim())) {
                    newForm.pincode = data.postalCode;
                    updatedPin = true;
                }
                if (data.city && (!newForm.city || !newForm.city.trim())) {
                    newForm.city = data.city;
                }
                if (data.state && (!newForm.state || !newForm.state.trim())) {
                    newForm.state = data.state;
                }
                if (data.country && (!newForm.country || !newForm.country.trim())) {
                    newForm.country = data.country;
                }
                return newForm;
            });

            if (updatedPin) {
                addToast('PIN code fetched successfully!', 'success');
            } else if (!data.postalCode) {
                addToast('PIN code not found from Google for this address.', 'info');
            } else {
                addToast('Address data fetched. Existing fields were not overwritten.', 'info');
            }
        } catch (error) {
            addToast(error?.response?.data?.message || error.message || 'Failed to fetch PIN from Google', 'error');
        } finally {
            setIsFetchingPin(false);
        }
    };
    
    // Masters for dropdowns
    const [departments, setDepartments] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [managers, setManagers] = useState([]);

    useEffect(() => {
        // Load Masters
        getDepartments().then(res => setDepartments(res.data || []));
        getShifts().then(res => setShifts(res.data || []));
        getUsers().then(res => setManagers(res.users || []));

        if (isEdit) {
            getEmployee(id)
                .then(res => {
                    const data = res.data; // The actual employee object is inside res.data
                    setForm({ 
                        ...DEFAULT, 
                        ...data,
                        dateOfJoining: data?.dateOfJoining ? new Date(data.dateOfJoining).toISOString().split('T')[0] : '',
                        dateOfLeaving: data?.dateOfLeaving ? new Date(data.dateOfLeaving).toISOString().split('T')[0] : '',
                        department: data?.department?._id || data?.department,
                        shiftType: data?.shiftType?._id || data?.shiftType,
                        reportingManager: data?.reportingManager?._id || data?.reportingManager
                    });
                })
                .catch(err => addToast('Failed to load employee', 'error'))
                .finally(() => setLoading(false));
        }
    }, [id, isEdit, addToast]);

    const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));
    const num = (key, val) => set(key, val === '' ? 0 : Number(val));

    const handleSave = async () => {
        // Basic Validation
        if (!form.employeeCode && isEdit) { addToast('Employee Code is required', 'error'); setActiveTab('employment'); return; }
        if (!form.employeeName) { addToast('Employee Name is required', 'error'); setActiveTab('personal'); return; }
        if (!form.department) { addToast('Department is required', 'error'); setActiveTab('employment'); return; }
        if (!form.shiftType) { addToast('Shift is required', 'error'); setActiveTab('employment'); return; }

        setSaving(true);
        try {
            if (isEdit) await updateEmployee(id, form);
            else await createEmployee(form);
            addToast(isEdit ? 'Employee updated!' : 'Employee created!', 'success');
            navigate('/hr/employees');
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save employee', 'error');
        } finally {
            setSaving(true); // Don't reset saving on success to prevent double clicks during nav
            if (!isEdit) setSaving(false); // Reset if it's new so they can try again on error
        }
    };

    const handleGenerateCode = async () => {
        setGeneratingCode(true);
        try {
            const res = await generateEmployeeCode();
            set('employeeCode', res.data?.employeeCode || res.employeeCode || '');
            addToast('Code generated successfully', 'success');
        } catch { 
            addToast('Could not generate code', 'error'); 
        } finally { 
            setGeneratingCode(false); 
        }
    };

    if (loading) return <BrandedLoader size={120} />;

    return (
        <div style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => navigate('/hr/employees')} style={{ width: '32px', height: '32px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ChevronLeft size={18} />
                    </button>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                        {isEdit ? 'Edit Employee Record' : 'New Employee Master'}
                    </h2>
                </div>
                <button 
                    onClick={handleSave} 
                    disabled={saving}
                    style={{ height: '36px', padding: '0 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.1)' }}
                >
                    <Save size={16} /> {saving ? 'Saving...' : 'Save Employee'}
                </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '4px', gap: '4px' }}>
                {TABS.map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id)}
                        style={{ 
                            flex: 1, 
                            padding: '8px 16px', 
                            fontSize: '13px', 
                            fontWeight: '600', 
                            borderRadius: '7px', 
                            border: 'none', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            gap: '8px',
                            background: activeTab === tab.id ? '#eff6ff' : 'transparent', 
                            color: activeTab === tab.id ? '#2563eb' : '#64748b',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </div>

            {/* Form Content */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', flex: 1, boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                {activeTab === 'personal' && (
                    <div>
                        <div style={f.sectionTitle}>Personal Information</div>
                        <div style={{ display: 'flex', gap: '32px', marginBottom: '24px' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ width: '120px', height: '120px', background: '#f1f5f9', border: '2px dashed #cbd5e1', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                                    {form.employeePhoto ? (
                                        <img src={form.employeePhoto} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <>
                                            <Camera size={24} style={{ color: '#94a3b8', marginBottom: '4px' }} />
                                            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600' }}>PHOTO</span>
                                        </>
                                    )}
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="Photo URL" 
                                    style={{ ...f.input, marginTop: '8px', fontSize: '11px', height: '28px' }} 
                                    value={form.employeePhoto}
                                    onChange={(e) => set('employeePhoto', e.target.value)}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={f.row(2)}>
                                    <div style={{ marginBottom: 12 }}>
                                        <label style={f.label}>Employee Code</label>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <input 
                                                style={{ ...f.input, flex: 1, fontFamily: 'monospace', fontWeight: '700' }} 
                                                value={form.employeeCode} 
                                                onChange={e => set('employeeCode', e.target.value.toUpperCase())} 
                                                placeholder="Leave empty to auto-generate" 
                                            />
                                            <button 
                                                type="button" 
                                                onClick={handleGenerateCode} 
                                                disabled={generatingCode} 
                                                title="Auto-generate code"
                                                style={{ height: 36, width: 36, border: '1px solid #cbd5e1', borderRadius: 6, background: '#f8fafc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: generatingCode ? 'spin 1s linear infinite' : 'none' }}>
                                                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                                    <path d="M3 3v5h5"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <Field label="Full Name" required><input style={f.input} value={form.employeeName} onChange={e => set('employeeName', e.target.value)} placeholder="e.g. John Doe" /></Field>
                                </div>
                                <div style={f.row(2)}>
                                    <Field label="Gender">
                                        <select style={f.sel} value={form.gender} onChange={e => set('gender', e.target.value)}>
                                            <option value="">Select Gender</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </Field>
                                    <Field label="Contact Number" required><input style={f.input} value={form.mobileNumber} onChange={e => set('mobileNumber', e.target.value)} placeholder="10 Digit Mobile" /></Field>
                                </div>
                                <div style={f.row(1)}>
                                    <Field label="Personal Email"><input style={f.input} value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@example.com" /></Field>
                                </div>
                            </div>
                        </div>

                        <div style={f.row(1)}>
                            <Field label="Permanent Address">
                                <textarea style={{ ...f.textarea, minHeight: '60px' }} value={form.address} onChange={e => set('address', e.target.value)} placeholder="Full residential address..." />
                            </Field>
                        </div>
                        <div style={f.row(4)}>
                            <Field label="Pincode">
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input style={{...f.input, flex: 1}} value={form.pincode} onChange={e => set('pincode', e.target.value)} placeholder="PIN Code" />
                                    <button 
                                        type="button" 
                                        onClick={handleFetchPin}
                                        disabled={isFetchingPin}
                                        title="Fetch PIN from Google"
                                        style={{ height: '36px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '4px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', color: '#334155' }}
                                    >
                                        {isFetchingPin ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                                    </button>
                                </div>
                            </Field>
                            <Field label="City"><input style={f.input} value={form.city} onChange={e => set('city', e.target.value)} placeholder="City" /></Field>
                            <Field label="State"><input style={f.input} value={form.state} onChange={e => set('state', e.target.value)} placeholder="State" /></Field>
                            <Field label="Country"><input style={f.input} value={form.country} onChange={e => set('country', e.target.value)} placeholder="Country" /></Field>
                        </div>
                    </div>
                )}

                {activeTab === 'employment' && (
                    <div>
                        <div style={f.sectionTitle}>Employment Details</div>
                        <div style={f.row(2)}>
                            <Field label="Department" required>
                                <select style={f.sel} value={form.department} onChange={e => set('department', e.target.value)}>
                                    <option value="">-- Select Department --</option>
                                    {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                                </select>
                            </Field>
                        </div>
                        <div style={f.row(2)}>
                            <Field label="Designation" required><input style={f.input} value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="e.g. Senior Technician" /></Field>
                            <Field label="Branch / Location" required><input style={f.input} value={form.branch} onChange={e => set('branch', e.target.value)} /></Field>
                        </div>
                        <div style={f.row(2)}>
                            <Field label="Shift Type" required>
                                <select style={f.sel} value={form.shiftType} onChange={e => set('shiftType', e.target.value)}>
                                    <option value="">-- Select Shift --</option>
                                    {shifts.map(s => <option key={s._id} value={s._id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                                </select>
                            </Field>
                            <Field label="Reporting Manager">
                                <select style={f.sel} value={form.reportingManager} onChange={e => set('reportingManager', e.target.value)}>
                                    <option value="">-- Select Manager --</option>
                                    {managers.map(u => <option key={u._id} value={u._id}>{u.name}</option>)}
                                </select>
                            </Field>
                        </div>
                        <div style={f.row(2)}>
                            <Field label="Date of Joining" required><input type="date" style={f.input} value={form.dateOfJoining} onChange={e => set('dateOfJoining', e.target.value)} /></Field>
                            <Field label="Date of Leaving"><input type="date" style={f.input} value={form.dateOfLeaving} onChange={e => set('dateOfLeaving', e.target.value)} /></Field>
                        </div>
                        <div style={f.row(2)}>
                            <Field label="Employment Status">
                                <select style={f.sel} value={form.employmentStatus} onChange={e => set('employmentStatus', e.target.value)}>
                                    <option value="Active">Active</option>
                                    <option value="Inactive">Inactive</option>
                                    <option value="Resigned">Resigned</option>
                                    <option value="Terminated">Terminated</option>
                                </select>
                            </Field>
                            <Field label="Employment Type">
                                <select style={f.sel} value={form.employmentType} onChange={e => set('employmentType', e.target.value)}>
                                    <option value="Permanent">Permanent</option>
                                    <option value="Temporary">Temporary</option>
                                    <option value="Contract">Contract</option>
                                    <option value="Trainee">Trainee</option>
                                </select>
                            </Field>
                        </div>
                    </div>
                )}

                {activeTab === 'salary' && (
                    <div>
                        <div style={f.sectionTitle}>Monthly Salary Structure</div>
                        <div style={f.row(1)}>
                            <Field label="Salary Calculation Type">
                                <div style={{ display: 'flex', gap: '16px' }}>
                                    {['Monthly', 'Daily', 'Hourly'].map(type => (
                                        <label key={type} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                            <input type="radio" name="salaryType" checked={form.salaryType === type} onChange={() => set('salaryType', type)} /> {type}
                                        </label>
                                    ))}
                                </div>
                            </Field>
                        </div>
                        <div style={f.row(3)}>
                            <Field label="Basic Salary (₹)"><input type="number" style={f.input} value={form.basicSalary} onChange={e => num('basicSalary', e.target.value)} /></Field>
                            <Field label="HRA (₹)"><input type="number" style={f.input} value={form.hra} onChange={e => num('hra', e.target.value)} /></Field>
                            <Field label="Conveyance (₹)"><input type="number" style={f.input} value={form.conveyance} onChange={e => num('conveyance', e.target.value)} /></Field>
                        </div>
                        <div style={f.row(3)}>
                            <Field label="Special Allowance (₹)"><input type="number" style={f.input} value={form.specialAllowance} onChange={e => num('specialAllowance', e.target.value)} /></Field>
                            <Field label="Fixed Incentive (₹)"><input type="number" style={f.input} value={form.incentive} onChange={e => num('incentive', e.target.value)} /></Field>
                            <Field label="Overtime Rate (Per Hr)"><input type="number" style={f.input} value={form.overtimeRate} onChange={e => num('overtimeRate', e.target.value)} /></Field>
                        </div>
                        <div style={{ ...f.row(2), background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input type="checkbox" id="pfApp" checked={form.pfApplicable} onChange={e => set('pfApplicable', e.target.checked)} />
                                <label htmlFor="pfApp" style={{ fontSize: '14px', fontWeight: '600' }}>Deduct Provident Fund (PF)</label>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <input type="checkbox" id="esicApp" checked={form.esicApplicable} onChange={e => set('esicApplicable', e.target.checked)} />
                                <label htmlFor="esicApp" style={{ fontSize: '14px', fontWeight: '600' }}>Deduct ESIC</label>
                            </div>
                        </div>
                        <div style={{ marginTop: '20px', padding: '12px', background: '#eff6ff', borderRadius: '6px', fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>
                            Total Gross Salary: ₹{(Number(form.basicSalary) + Number(form.hra) + Number(form.conveyance) + Number(form.specialAllowance) + Number(form.incentive)).toLocaleString()} per month
                        </div>
                    </div>
                )}

                {activeTab === 'bank' && (
                    <div>
                        <div style={f.sectionTitle}>Bank & Identification Details</div>
                        <div style={f.row(2)}>
                            <Field label="Bank Name"><input style={f.input} value={form.bankName} onChange={e => set('bankName', e.target.value)} placeholder="e.g. HDFC Bank" /></Field>
                            <Field label="Account Number"><input style={f.input} value={form.bankAccountNumber} onChange={e => set('bankAccountNumber', e.target.value)} /></Field>
                        </div>
                        <div style={f.row(2)}>
                            <Field label="IFSC Code"><input style={f.input} value={form.ifscCode} onChange={e => set('ifscCode', e.target.value.toUpperCase())} /></Field>
                            <Field label="UAN Number (PF)"><input style={f.input} value={form.uan} onChange={e => set('uan', e.target.value)} /></Field>
                        </div>
                        <div style={f.row(2)}>
                            <Field label="Aadhaar Card No"><input style={f.input} value={form.aadhaarNo} onChange={e => set('aadhaarNo', e.target.value)} placeholder="12 Digit No" /></Field>
                            <Field label="PAN Card No"><input style={f.input} value={form.panNo} onChange={e => set('panNo', e.target.value.toUpperCase())} /></Field>
                        </div>
                        <div style={f.row(1)}>
                            <Field label="HR Internal Remarks">
                                <textarea style={{ ...f.textarea, minHeight: '60px' }} value={form.remarks} onChange={e => set('remarks', e.target.value)} placeholder="Confidential remarks, disciplinary notes, etc." />
                            </Field>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer Navigation */}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                    {TABS.map((t, i) => {
                        const curIdx = TABS.findIndex(x => x.id === activeTab);
                        if (i === curIdx - 1) return <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ height: '36px', padding: '0 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>← {t.label}</button>;
                        if (i === curIdx + 1) return <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ height: '36px', padding: '0 16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' }}>{t.label} →</button>;
                        return null;
                    })}
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button onClick={() => navigate('/hr/employees')} style={{ height: '36px', padding: '0 20px', background: 'transparent', border: 'none', color: '#64748b', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleSave} disabled={saving} style={{ height: '36px', padding: '0 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.1)' }}>{saving ? 'Saving...' : 'Save Record'}</button>
                </div>
            </div>
        </div>
    );
};

export default EmployeeForm;
