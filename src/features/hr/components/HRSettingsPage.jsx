import React, { useState, useEffect } from 'react';
import { Save, Settings, Clock, Calendar, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';

const HRSettingsPage = () => {
    const [settings, setSettings] = useState({
        officeStartTime: '10:00',
        graceMinutes: 10,
        halfDayThresholdHours: 4,
        isSundayPaid: true,
        isHolidayPaid: true,
        singlePunchIsPresent: true,
        missingCheckoutHandling: 'Mark as Missing'
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            const response = await api.get('/hr/settings');
            if (response.data.data) {
                setSettings(response.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch HR settings:', error);
            toast.error('Failed to load HR settings');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await api.patch('/hr/settings', settings);
            toast.success('HR Settings updated successfully');
        } catch (error) {
            console.error('Failed to update HR settings:', error);
            toast.error('Failed to update HR settings');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader className="animate-spin text-blue-600" size={32} />
            </div>
        );
    }

    return (
        <div style={{ padding: '32px', background: '#f8fafc', minHeight: '100%' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#0f172a', margin: 0 }}>HR Attendance Settings</h1>
                <p style={{ fontSize: '14px', color: '#64748b', marginTop: '6px' }}>Configure global rules for attendance, late coming, and salary working</p>
            </div>

            <form onSubmit={handleSave} style={{ maxWidth: '800px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                    {/* Timing & Grace */}
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Clock size={18} className="text-blue-600" /> Timing & Grace Period
                        </h3>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Office / Shift Start Time</label>
                            <input 
                                type="time" 
                                value={settings.officeStartTime}
                                onChange={(e) => setSettings({...settings, officeStartTime: e.target.value})}
                                style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }} 
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Grace Period (Minutes)</label>
                            <input 
                                type="number" 
                                value={settings.graceMinutes}
                                onChange={(e) => setSettings({...settings, graceMinutes: parseInt(e.target.value)})}
                                style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }} 
                            />
                            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Extra minutes allowed before marking as 'Late'</p>
                        </div>
                    </div>

                    {/* Half Day & Punch Rules */}
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Settings size={18} className="text-indigo-600" /> Attendance Rules
                        </h3>
                        
                        <div style={{ marginBottom: '16px' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#475569', marginBottom: '8px' }}>Half Day Threshold (Hours)</label>
                            <input 
                                type="number" 
                                value={settings.halfDayThresholdHours}
                                onChange={(e) => setSettings({...settings, halfDayThresholdHours: parseFloat(e.target.value)})}
                                style={{ width: '100%', height: '42px', padding: '0 12px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '14px', outline: 'none' }} 
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <input 
                                type="checkbox" 
                                id="singlePunch"
                                checked={settings.singlePunchIsPresent}
                                onChange={(e) => setSettings({...settings, singlePunchIsPresent: e.target.checked})}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                            <label htmlFor="singlePunch" style={{ fontSize: '14px', fontWeight: '600', color: '#334155', cursor: 'pointer' }}>Single Punch counts as Present</label>
                        </div>
                    </div>

                    {/* Salary Calculations */}
                    <div style={{ gridColumn: 'span 2', background: '#fff', padding: '24px', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: '800', color: '#1e293b', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Calendar size={18} className="text-emerald-600" /> Salary / Payable Days Rules
                        </h3>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                                <input 
                                    type="checkbox" 
                                    id="sunPaid"
                                    checked={settings.isSundayPaid}
                                    onChange={(e) => setSettings({...settings, isSundayPaid: e.target.checked})}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="sunPaid" style={{ fontSize: '15px', fontWeight: '700', color: '#166534', cursor: 'pointer' }}>Sundays are Paid (Present)</label>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: '#f0f9ff', borderRadius: '12px', border: '1px solid #e0f2fe' }}>
                                <input 
                                    type="checkbox" 
                                    id="holPaid"
                                    checked={settings.isHolidayPaid}
                                    onChange={(e) => setSettings({...settings, isHolidayPaid: e.target.checked})}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <label htmlFor="holPaid" style={{ fontSize: '15px', fontWeight: '700', color: '#075985', cursor: 'pointer' }}>Holidays are Paid (Present)</label>
                            </div>
                        </div>
                        
                        <div style={{ marginTop: '20px', padding: '16px', background: '#fff7ed', borderRadius: '12px', border: '1px solid #ffedd5' }}>
                            <label style={{ display: 'block', fontSize: '13px', fontWeight: '800', color: '#9a3412', marginBottom: '8px' }}>Missing Checkout Handling</label>
                            <select 
                                value={settings.missingCheckoutHandling}
                                onChange={(e) => setSettings({...settings, missingCheckoutHandling: e.target.value})}
                                style={{ width: '100%', height: '42px', padding: '0 12px', background: '#fff', border: '1px solid #fdba74', borderRadius: '10px', fontSize: '14px', fontWeight: '600', color: '#9a3412', outline: 'none' }}
                            >
                                <option value="Mark as Missing">Mark status as 'Present' but flag as 'Missing Checkout'</option>
                                <option value="Mark as Absent">Mark status as 'Absent'</option>
                                <option value="Mark as Present">Mark status as 'Present' (Ignore missing out time)</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button 
                        type="submit"
                        disabled={isSaving}
                        style={{ 
                            height: '50px', 
                            padding: '0 32px', 
                            background: '#0f172a', 
                            color: '#fff', 
                            border: 'none', 
                            borderRadius: '12px', 
                            fontSize: '15px', 
                            fontWeight: '700', 
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                        }}
                    >
                        {isSaving ? <Loader size={20} className="animate-spin" /> : <Save size={20} />}
                        {isSaving ? 'Saving Changes...' : 'Save Settings'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default HRSettingsPage;
