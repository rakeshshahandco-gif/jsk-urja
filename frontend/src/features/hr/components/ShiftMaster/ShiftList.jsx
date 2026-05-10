import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Clock, RefreshCw } from 'lucide-react';
import { getShifts, deleteShift } from '@/services/hrApi';
import { useToast } from '@/components/ui/Toast';
import ShiftForm from './ShiftForm';

const s = {
    th: { padding: '12px 16px', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', textAlign: 'left' },
    td: { padding: '14px 16px', fontSize: '14px', color: '#1e293b', borderBottom: '1px solid #f1f5f9', verticalAlign: 'middle' },
};

const ShiftList = () => {
    const [shifts, setShifts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [selectedShift, setSelectedShift] = useState(null);
    const { addToast } = useToast();

    const loadShifts = useCallback(async () => {
        setLoading(true);
        try {
            const res = await getShifts();
            setShifts(res.data || []);
        } catch (err) {
            addToast('Failed to load shifts', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadShifts();
    }, [loadShifts]);

    const handleDelete = async (id, name) => {
        if (!window.confirm(`Are you sure you want to delete shift "${name}"?`)) return;
        try {
            await deleteShift(id);
            addToast('Shift deleted successfully', 'success');
            loadShifts();
        } catch (err) {
            addToast('Failed to delete shift', 'error');
        }
    };

    const handleEdit = (shift) => {
        setSelectedShift(shift);
        setShowForm(true);
    };

    const handleAddNew = () => {
        setSelectedShift(null);
        setShowForm(true);
    };

    return (
        <div style={{ padding: '20px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#0f172a', margin: 0 }}>Shift Master</h2>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>Manage working hours and attendance rules</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={loadShifts}
                        style={{ height: '36px', width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', color: '#64748b', cursor: 'pointer' }}
                        title="Refresh"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button 
                        onClick={handleAddNew}
                        style={{ height: '36px', padding: '0 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                    >
                        <Plus size={16} /> New Shift
                    </button>
                </div>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ width: '32px', height: '32px', border: '3px solid #f1f5f9', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                        Loading shifts...
                    </div>
                ) : shifts.length === 0 ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                        <Clock size={48} style={{ margin: '0 auto 16px', opacity: 0.2 }} />
                        <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#475569' }}>No shifts found</h3>
                        <p style={{ fontSize: '14px', margin: '8px 0 20px' }}>Start by creating your first working shift</p>
                        <button onClick={handleAddNew} style={{ color: '#2563eb', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}>+ Add Shift</button>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={s.th}>Shift Name</th>
                                    <th style={s.th}>Working Hours</th>
                                    <th style={s.th}>Grace Time</th>
                                    <th style={s.th}>Full/Half Day Min</th>
                                    <th style={s.th}>Weekly Off</th>
                                    <th style={{ ...s.th, textAlign: 'center' }}>Status</th>
                                    <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shifts.map(shift => (
                                    <tr key={shift._id} style={{ transition: 'background 0.2s' }}>
                                        <td style={s.td}>
                                            <div style={{ fontWeight: '700', color: '#1e293b' }}>{shift.name}</div>
                                        </td>
                                        <td style={s.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>{shift.startTime}</span>
                                                <span style={{ color: '#94a3b8' }}>to</span>
                                                <span style={{ padding: '2px 6px', background: '#f1f5f9', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>{shift.endTime}</span>
                                            </div>
                                        </td>
                                        <td style={s.td}>
                                            <span style={{ color: '#64748b' }}>{shift.graceMinutes} mins</span>
                                        </td>
                                        <td style={s.td}>
                                            <div style={{ fontSize: '12px' }}>
                                                <span style={{ color: '#10b981', fontWeight: '600' }}>{shift.fullDayMinHours}h</span>
                                                <span style={{ color: '#94a3b8', margin: '0 4px' }}>/</span>
                                                <span style={{ color: '#f59e0b', fontWeight: '600' }}>{shift.halfDayMinHours}h</span>
                                            </div>
                                        </td>
                                        <td style={s.td}>
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {shift.weeklyOff?.map(day => (
                                                    <span key={day} style={{ fontSize: '11px', background: '#fef2f2', color: '#dc2626', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>{day}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'center' }}>
                                            <span style={{ 
                                                fontSize: '11px', 
                                                padding: '2px 8px', 
                                                borderRadius: '20px', 
                                                background: shift.isActive ? '#dcfce7' : '#fee2e2', 
                                                color: shift.isActive ? '#166534' : '#991b1b',
                                                fontWeight: '700'
                                            }}>
                                                {shift.isActive ? 'ACTIVE' : 'INACTIVE'}
                                            </span>
                                        </td>
                                        <td style={{ ...s.td, textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button 
                                                    onClick={() => handleEdit(shift)}
                                                    style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e0f2fe', borderRadius: '6px', background: '#f0f9ff', color: '#0369a1', cursor: 'pointer' }}
                                                    title="Edit"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(shift._id, shift.name)}
                                                    style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #fee2e2', borderRadius: '6px', background: '#fef2f2', color: '#b91c1c', cursor: 'pointer' }}
                                                    title="Delete"
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

            {showForm && (
                <ShiftForm 
                    onClose={() => setShowForm(false)} 
                    onSuccess={() => { setShowForm(false); loadShifts(); }}
                    editData={selectedShift}
                />
            )}
        </div>
    );
};

export default ShiftList;
