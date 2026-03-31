import React, { useState, useEffect } from 'react';
import { Modal, Button } from '@/components/ui';
import { createShift, updateShift } from '@/services/hrApi';
import { useToast } from '@/components/ui/Toast';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const ShiftForm = ({ onClose, onSuccess, editData }) => {
    const isEdit = !!editData;
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        name: '',
        startTime: '09:30',
        endTime: '18:30',
        graceMinutes: 15,
        fullDayMinHours: 8,
        halfDayMinHours: 4,
        otStartAfterMinutes: 0,
        weeklyOff: ['Sunday'],
        isActive: true
    });

    useEffect(() => {
        if (editData) {
            setFormData({
                ...editData,
                weeklyOff: editData.weeklyOff || []
            });
        }
    }, [editData]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleDayToggle = (day) => {
        setFormData(prev => {
            const current = prev.weeklyOff || [];
            if (current.includes(day)) {
                return { ...prev, weeklyOff: current.filter(d => d !== day) };
            } else {
                return { ...prev, weeklyOff: [...current, day] };
            }
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (isEdit) {
                await updateShift(editData._id, formData);
                addToast('Shift updated successfully', 'success');
            } else {
                await createShift(formData);
                addToast('Shift created successfully', 'success');
            }
            onSuccess();
        } catch (err) {
            addToast(err?.response?.data?.message || 'Failed to save shift', 'error');
        } finally {
            setLoading(false);
        }
    };

    const s = {
        label: { display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' },
        input: { width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' },
        row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' },
        dayBtn: (active) => ({
            padding: '4px 8px',
            fontSize: '11px',
            fontWeight: '600',
            borderRadius: '4px',
            border: active ? '1px solid #2563eb' : '1px solid #e2e8f0',
            background: active ? '#eff6ff' : '#fff',
            color: active ? '#2563eb' : '#64748b',
            cursor: 'pointer',
            transition: 'all 0.2s'
        })
    };

    return (
        <Modal 
            title={isEdit ? 'Edit Shift' : 'Create New Shift'} 
            onClose={onClose}
            size="md"
        >
            <form onSubmit={handleSubmit} style={{ padding: '4px' }}>
                <div style={{ marginBottom: '16px' }}>
                    <label style={s.label}>Shift Name *</label>
                    <input 
                        type="text" 
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="e.g. Regular Morning Shift"
                        required
                        style={s.input}
                    />
                </div>

                <div style={s.row}>
                    <div>
                        <label style={s.label}>Start Time (Punch In)</label>
                        <input 
                            type="time" 
                            name="startTime"
                            value={formData.startTime}
                            onChange={handleChange}
                            required
                            style={s.input}
                        />
                    </div>
                    <div>
                        <label style={s.label}>End Time (Punch Out)</label>
                        <input 
                            type="time" 
                            name="endTime"
                            value={formData.endTime}
                            onChange={handleChange}
                            required
                            style={s.input}
                        />
                    </div>
                </div>

                <div style={s.row}>
                    <div>
                        <label style={s.label}>Grace Time (Minutes)</label>
                        <input 
                            type="number" 
                            name="graceMinutes"
                            value={formData.graceMinutes}
                            onChange={handleChange}
                            min="0"
                            style={s.input}
                        />
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Allowed late entry without penalty</span>
                    </div>
                    <div>
                        <label style={s.label}>OT Starts After (Mins)</label>
                        <input 
                            type="number" 
                            name="otStartAfterMinutes"
                            value={formData.otStartAfterMinutes}
                            onChange={handleChange}
                            min="0"
                            style={s.input}
                        />
                    </div>
                </div>

                <div style={s.row}>
                    <div>
                        <label style={s.label}>Full Day Min Hours</label>
                        <input 
                            type="number" 
                            name="fullDayMinHours"
                            value={formData.fullDayMinHours}
                            onChange={handleChange}
                            min="1"
                            step="0.5"
                            style={s.input}
                        />
                    </div>
                    <div>
                        <label style={s.label}>Half Day Min Hours</label>
                        <input 
                            type="number" 
                            name="halfDayMinHours"
                            value={formData.halfDayMinHours}
                            onChange={handleChange}
                            min="1"
                            step="0.5"
                            style={s.input}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={s.label}>Weekly Off Days</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {DAYS.map(day => (
                            <button 
                                key={day}
                                type="button"
                                onClick={() => handleDayToggle(day)}
                                style={s.dayBtn(formData.weeklyOff.includes(day))}
                            >
                                {day.substring(0, 3)}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <input 
                        type="checkbox" 
                        id="isActive"
                        name="isActive"
                        checked={formData.isActive}
                        onChange={handleChange}
                        style={{ cursor: 'pointer' }}
                    />
                    <label htmlFor="isActive" style={{ fontSize: '14px', fontWeight: '500', color: '#475569', cursor: 'pointer' }}>Shift is active</label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                    <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button 
                        type="submit" 
                        disabled={loading}
                        variant="primary"
                    >
                        {loading ? 'Saving...' : isEdit ? 'Update Shift' : 'Create Shift'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default ShiftForm;
