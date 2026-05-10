import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Filter, Pencil, Trash2, User, Phone, Mail, Building2, MapPin } from 'lucide-react';
import { getEmployees, deleteEmployee } from '@/services/hrApi';
import { getDepartments } from '@/services/userApi';
import { useToast } from '@/components/ui/Toast';

const STATUS_COLORS = {
    Active: { bg: '#dcfce7', color: '#166534' },
    Inactive: { bg: '#f3f4f6', color: '#374151' },
    Resigned: { bg: '#fee2e2', color: '#991b1b' },
    Terminated: { bg: '#fef2f2', color: '#dc2626' }
};

const s = {
    th: { padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', whiteSpace: 'nowrap' },
    td: { padding: '12px 16px', fontSize: '14px', color: '#1e293b', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
    sel: { height: '36px', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', background: '#fff', outline: 'none' },
    inp: { height: '36px', padding: '0 12px 0 36px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', flex: 1, outline: 'none' }
};

const EmployeeList = () => {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const [employees, setEmployees] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [deptFilter, setDeptFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('Active');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                search: search || undefined,
                department: deptFilter || undefined,
                status: statusFilter || undefined
            };
            const [empRes, deptRes] = await Promise.all([
                getEmployees(params),
                getDepartments()
            ]);
            setEmployees(empRes.data || []);
            setDepartments(deptRes.data || []);
        } catch (err) {
            addToast('Failed to load employee records', 'error');
        } finally {
            setLoading(false);
        }
    }, [search, deptFilter, statusFilter, addToast]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to deactivate employee "${name}"?`)) return;
        try {
            await deleteEmployee(id);
            addToast('Employee record deactivated', 'success');
            loadData();
        } catch (err) {
            addToast('Failed to deactivate employee', 'error');
        }
    };

    return (
        <div style={{ padding: '20px', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '24px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Employee Master</h2>
                    <p style={{ fontSize: '14px', color: '#64748b', margin: '4px 0 0' }}>Manage staff profiles and employment details</p>
                </div>
                <button 
                    onClick={() => navigate('/hr/employees/new')}
                    style={{ height: '40px', padding: '0 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 2px 4px rgba(37, 99, 235, 0.1)' }}
                >
                    <Plus size={18} /> Add Employee
                </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: '300px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input 
                        type="text" 
                        placeholder="Search by name, code, email, mobile..." 
                        style={s.inp}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                
                <select style={s.sel} value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                    <option value="">All Departments</option>
                    {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
                </select>

                <select style={s.sel} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Resigned">Resigned</option>
                    <option value="Terminated">Terminated</option>
                </select>

                <button 
                    onClick={() => { setSearch(''); setDeptFilter(''); setStatusFilter('Active'); }}
                    style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', color: '#64748b', fontSize: '13px', cursor: 'pointer' }}
                >
                    Clear
                </button>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                {loading ? (
                    <div style={{ padding: '80px', textAlign: 'center', color: '#94a3b8' }}>Loading employees...</div>
                ) : employees.length === 0 ? (
                    <div style={{ padding: '100px', textAlign: 'center', color: '#94a3b8' }}>
                        <User size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                        <h3 style={{ fontSize: '18px', fontWeight: '600', color: '#475569' }}>No employees found</h3>
                        <p style={{ fontSize: '14px', marginTop: '8px' }}>Refine your search or add a new employee profile.</p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={s.th}>Code</th>
                                    <th style={s.th}>Employee Name</th>
                                    <th style={s.th}>Contact</th>
                                    <th style={s.th}>Department / Role</th>
                                    <th style={s.th}>Shift</th>
                                    <th style={s.th}>DOJ</th>
                                    <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                                    <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => (
                                    <tr key={emp._id} style={{ transition: 'background 0.2s' }}>
                                        <td style={s.td}>
                                            <span style={{ fontFamily: 'monospace', fontWeight: '700', color: '#2563eb' }}>{emp.employeeCode}</span>
                                        </td>
                                        <td style={s.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb', fontWeight: '800', fontSize: '14px', overflow: 'hidden' }}>
                                                    {emp.employeePhoto ? (
                                                        <img src={emp.employeePhoto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    ) : (
                                                        emp.employeeName.charAt(0)
                                                    )}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '700', color: '#1e293b' }}>{emp.employeeName}</div>
                                                    <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <MapPin size={10} /> {emp.branch}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={s.td}>
                                            <div style={{ fontSize: '13px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b' }}><Phone size={12} /> {emp.mobileNumber}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', marginTop: '2px' }} title={emp.email}><Mail size={12} /> {emp.email?.substring(0, 20)}...</div>
                                            </div>
                                        </td>
                                        <td style={s.td}>
                                            <div style={{ fontWeight: '600' }}>{emp.department?.name || '—'}</div>
                                            <div style={{ fontSize: '12px', color: '#64748b' }}>{emp.designation}</div>
                                        </td>
                                        <td style={s.td}>
                                            <span style={{ fontSize: '12px', color: '#1e293b' }}>{emp.shiftType?.name || '—'}</span>
                                        </td>
                                        <td style={s.td}>
                                            <span style={{ fontSize: '13px' }}>{new Date(emp.dateOfJoining).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'center' }}>
                                            <span style={{ 
                                                fontSize: '11px', 
                                                fontWeight: '800', 
                                                padding: '2px 8px', 
                                                borderRadius: '20px', 
                                                background: STATUS_COLORS[emp.employmentStatus]?.bg || '#f3f4f6', 
                                                color: STATUS_COLORS[emp.employmentStatus]?.color || '#374151'
                                            }}>
                                                {emp.employmentStatus.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button 
                                                    onClick={() => navigate(`/hr/employees/${emp._id}`)}
                                                    style={{ width: '32px', height: '32px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#334155' }}
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(emp._id, emp.employeeName)}
                                                    style={{ width: '32px', height: '32px', border: '1px solid #fee2e2', borderRadius: '6px', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EmployeeList;
