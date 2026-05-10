import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, Edit2, Download, CheckCircle, Info, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import * as hrApi from '@/services/hrApi';
import moment from 'moment';

const HolidayListPage = () => {
    const [holidays, setHolidays] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        date: '',
        type: 'Public',
        description: ''
    });
    const [editingId, setEditingId] = useState(null);

    const fetchHolidays = async () => {
        setLoading(true);
        try {
            const res = await hrApi.getHolidays();
            setHolidays(res.data || []);
        } catch (error) {
            toast.error('Failed to load holiday list');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHolidays();
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingId) {
                await hrApi.updateHoliday(editingId, formData);
                toast.success('Holiday updated successfully');
            } else {
                await hrApi.createHoliday(formData);
                toast.success('Holiday added successfully');
            }
            setIsModalOpen(false);
            setFormData({ name: '', date: '', type: 'Public', description: '' });
            setEditingId(null);
            fetchHolidays();
        } catch (error) {
            toast.error(error.response?.data?.message || 'Action failed');
        }
    };

    const handleEdit = (holiday) => {
        setFormData({
            name: holiday.name,
            date: moment(holiday.date).format('YYYY-MM-DD'),
            type: holiday.type,
            description: holiday.description || ''
        });
        setEditingId(holiday._id);
        setIsModalOpen(true);
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to remove this holiday?')) {
            try {
                await hrApi.deleteHoliday(id);
                toast.success('Holiday removed');
                fetchHolidays();
            } catch (error) {
                toast.error('Failed to delete holiday');
            }
        }
    };

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ width: '40px', height: '40px', background: '#4f46e5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyCenter: 'center', color: '#fff' }}>
                            <Calendar size={20} />
                        </span>
                        Holiday List
                    </h1>
                    <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Manage official company holidays and public observances</p>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => { setEditingId(null); setFormData({ name: '', date: '', type: 'Public', description: '' }); setIsModalOpen(true); }}
                        style={{ height: '44px', padding: '0 20px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)' }}
                    >
                        <Plus size={18} /> Add Holiday
                    </button>
                </div>
            </div>

            {/* List Section */}
            <div style={{ background: '#fff', borderRadius: '24px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>Loading holidays...</div>
                ) : holidays.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center' }}>
                        <div style={{ width: '64px', height: '64px', background: '#f1f5f9', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#94a3b8' }}>
                            <Calendar size={32} />
                        </div>
                        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>No Holidays Defined</h3>
                        <p style={{ fontSize: '14px', color: '#64748b' }}>Start by adding a holiday for the current financial year.</p>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                                <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Holiday Name</th>
                                <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Type</th>
                                <th style={{ padding: '16px 24px', fontSize: '12px', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {holidays.map((holiday) => (
                                <tr key={holiday._id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.2s' }}>
                                    <td style={{ padding: '20px 24px', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>
                                        {moment(holiday.date).format('DD MMM (ddd)')}
                                    </td>
                                    <td style={{ padding: '20px 24px' }}>
                                        <div style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>{holiday.name}</div>
                                        {holiday.description && <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>{holiday.description}</div>}
                                    </td>
                                    <td style={{ padding: '20px 24px' }}>
                                        <span style={{ 
                                            padding: '4px 10px', 
                                            borderRadius: '20px', 
                                            fontSize: '11px', 
                                            fontWeight: '800', 
                                            textTransform: 'uppercase',
                                            background: holiday.type === 'National' ? '#fee2e2' : holiday.type === 'Public' ? '#e1f5fe' : '#f1f5f9',
                                            color: holiday.type === 'National' ? '#991b1b' : holiday.type === 'Public' ? '#01579b' : '#475569'
                                        }}>
                                            {holiday.type}
                                        </span>
                                    </td>
                                    <td style={{ padding: '20px 24px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button onClick={() => handleEdit(holiday)} style={{ width: '32px', height: '32px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Edit2 size={14} /></button>
                                            <button onClick={() => handleDelete(holiday._id)} style={{ width: '32px', height: '32px', border: '1px solid #fee2e2', borderRadius: '8px', background: '#fff', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', width: '480px', borderRadius: '24px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: '900', color: '#0f172a', margin: 0 }}>{editingId ? 'Edit Holiday' : 'Add New Holiday'}</h2>
                            <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={24} /></button>
                        </div>
                        
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Holiday Name</label>
                                <input required type="text" name="name" value={formData.name} onChange={handleInputChange} style={{ width: '100%', height: '44px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0 16px', fontSize: '14px', outline: 'none' }} placeholder="e.g. Independence Day" />
                            </div>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Date</label>
                                <input required type="date" name="date" value={formData.date} onChange={handleInputChange} style={{ width: '100%', height: '44px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0 16px', fontSize: '14px', outline: 'none' }} />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Holiday Type</label>
                                <select name="type" value={formData.type} onChange={handleInputChange} style={{ width: '100%', height: '44px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '0 16px', fontSize: '14px', outline: 'none' }}>
                                    <option value="National">National Holiday</option>
                                    <option value="Public">Public/Gazetted</option>
                                    <option value="Company">Company Specific</option>
                                    <option value="Optional">Optional/Restricted</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Description (Optional)</label>
                                <textarea name="description" value={formData.description} onChange={handleInputChange} style={{ width: '100%', minHeight: '80px', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', outline: 'none', resize: 'vertical' }} placeholder="Any additional notes..."></textarea>
                            </div>

                            <button type="submit" style={{ width: '100%', height: '48px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '800', cursor: 'pointer', marginTop: '12px', boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)' }}>
                                {editingId ? 'Update Holiday' : 'Save Holiday'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default HolidayListPage;
