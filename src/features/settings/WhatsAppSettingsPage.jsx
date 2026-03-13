import React, { useState, useEffect } from 'react';
import { Settings, Save, Smartphone, Search, Paperclip, MessageSquare, ShieldCheck } from 'lucide-react';
import { getWhatsAppSettings, updateWhatsAppSettings } from '@/services/whatsappApi';
import toast from 'react-hot-toast';

export default function WhatsAppSettingsPage() {
    const [settings, setSettings] = useState({
        enabled: true,
        defaultCountryCode: '91',
        soTemplate: '',
        poTemplate: '',
        searchDelay: 2000,
        attachDelay: 3000,
        sendDelay: 2000
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        getWhatsAppSettings()
            .then(data => setSettings(data || settings))
            .catch(() => toast.error('Failed to load WhatsApp settings'))
            .finally(() => setLoading(false));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateWhatsAppSettings(settings);
            toast.success('Settings saved successfully');
        } catch (e) {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading Settings...</div>;

    const inputStyle = {
        width: '100%',
        padding: '12px 16px',
        borderRadius: '10px',
        border: '1px solid #e2e8f0',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s',
        marginBottom: '4px'
    };

    const sectionStyle = {
        background: '#fff',
        borderRadius: '16px',
        padding: '24px',
        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
        border: '1px solid #f1f5f9',
        marginBottom: '24px'
    };

    return (
        <div style={{ padding: '32px 40px', maxWidth: '900px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, color: '#1e293b', letterSpacing: '-0.02em' }}>WhatsApp Automation Settings</h1>
                    <p style={{ color: '#64748b', fontSize: '15px', marginTop: '4px' }}>Configure browser-based WhatsApp automation for SO and PO.</p>
                </div>
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', 
                        background: '#7c3aed', color: '#fff', border: 'none', borderRadius: '12px', 
                        fontWeight: 700, cursor: 'pointer', boxShadow: '0 10px 15px -3px rgba(124,58,237,0.3)' 
                    }}
                >
                    {saving ? 'Saving...' : <><Save size={18} /> Save Changes</>}
                </button>
            </div>

            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ padding: '8px', background: '#f5f3ff', color: '#7c3aed', borderRadius: '8px' }}><ShieldCheck size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>General Configuration</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Automation Enabled</label>
                        <select 
                            value={settings.enabled} 
                            onChange={e => setSettings({...settings, enabled: e.target.value === 'true'})}
                            style={inputStyle}
                        >
                            <option value="true">Yes, Enable Automation</option>
                            <option value="false">No, Disable for now</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Default Country Code</label>
                        <input 
                            value={settings.defaultCountryCode} 
                            onChange={e => setSettings({...settings, defaultCountryCode: e.target.value})}
                            style={inputStyle}
                            placeholder="e.g., 91"
                        />
                    </div>
                </div>
            </div>

            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '2px' }}>
                    <div style={{ padding: '8px', background: '#f0fdf4', color: '#16a34a', borderRadius: '8px' }}><MessageSquare size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Message Templates</h2>
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '20px' }}>Placeholders: {'{order_number}'}, {'{order_date}'}, {'{company_name}'}</p>
                
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Sales Order (SO) Template</label>
                    <textarea 
                        value={settings.soTemplate} 
                        onChange={e => setSettings({...settings, soTemplate: e.target.value})}
                        style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                    />
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Purchase Order (PO) Template</label>
                    <textarea 
                        value={settings.poTemplate} 
                        onChange={e => setSettings({...settings, poTemplate: e.target.value})}
                        style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
                    />
                </div>
            </div>

            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                    <div style={{ padding: '8px', background: '#fff7ed', color: '#ea580c', borderRadius: '8px' }}><Smartphone size={20} /></div>
                    <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Automation Timing Delays</h2>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <Search size={14} color="#64748b" />
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Search Delay (ms)</label>
                        </div>
                        <input 
                            type="number"
                            value={settings.searchDelay} 
                            onChange={e => setSettings({...settings, searchDelay: Number(e.target.value)})}
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <Paperclip size={14} color="#64748b" />
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Attach Delay (ms)</label>
                        </div>
                        <input 
                            type="number"
                            value={settings.attachDelay} 
                            onChange={e => setSettings({...settings, attachDelay: Number(e.target.value)})}
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                            <Send size={14} color="#64748b" />
                            <label style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Send Delay (ms)</label>
                        </div>
                        <input 
                            type="number"
                            value={settings.sendDelay} 
                            onChange={e => setSettings({...settings, sendDelay: Number(e.target.value)})}
                            style={inputStyle}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
