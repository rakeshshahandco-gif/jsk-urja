import React, { useState } from 'react';
import { useNotification } from '@/contexts/NotificationContext';
import { Bell, Monitor, Volume2, Calendar, MessageSquare, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export const NotificationSettingsForm = ({ onClose }) => {
    const { preferences, updatePreferences } = useNotification();
    const [loading, setLoading] = useState(false);
    
    // Create a local copy to allow discarding changes before save
    const [localPrefs, setLocalPrefs] = useState({ ...preferences });

    const handleToggle = (key) => {
        setLocalPrefs(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await updatePreferences(localPrefs);
            toast.success('Notification settings saved');
            if (onClose) onClose();
        } catch (error) {
            toast.error('Failed to save settings');
        } finally {
            setLoading(false);
        }
    };

    const ToggleRow = ({ icon: Icon, label, description, prefKey }) => (
        <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 px-2 rounded transition-colors">
            <div className="flex items-start gap-3">
                <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
                    <Icon size={18} />
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-gray-800">{label}</h4>
                    <p className="text-xs text-gray-500 mt-0.5">{description}</p>
                </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={localPrefs[prefKey]} 
                    onChange={() => handleToggle(prefKey)}
                    disabled={loading}
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
            </label>
        </div>
    );

    return (
        <form onSubmit={handleSave} className="p-2">
            <div className="mb-6 space-y-1">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-2">Delivery Methods</h3>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2">
                    <ToggleRow 
                        icon={Bell} 
                        label="In-App Pop-ups" 
                        description="Show real-time toasts at the bottom-right corner." 
                        prefKey="inApp" 
                    />
                    <ToggleRow 
                        icon={Monitor} 
                        label="Desktop Notifications" 
                        description="Show native Windows pop-ups when app is minimized." 
                        prefKey="desktop" 
                    />
                    <ToggleRow 
                        icon={Volume2} 
                        label="Sound Alerts" 
                        description="Play a subtle 'ting' sound for incoming alerts." 
                        prefKey="sound" 
                    />
                </div>
            </div>

            <div className="mb-6 space-y-1">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider pl-2">Alert Types</h3>
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-2">
                    <ToggleRow 
                        icon={Calendar} 
                        label="Task Notifications" 
                        description="Alert me when tasks are assigned, completed, or updated." 
                        prefKey="taskAlerts" 
                    />
                    <ToggleRow 
                        icon={MessageSquare} 
                        label="Messenger Sync" 
                        description="Alert me for new incoming chats and mentions." 
                        prefKey="messageAlerts" 
                    />
                    <ToggleRow 
                        icon={AlertCircle} 
                        label="Reminders" 
                        description="Alert me for scheduled & overdue follow-up reminders." 
                        prefKey="reminderAlerts" 
                    />
                </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none"
                    disabled={loading}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700 focus:outline-none disabled:opacity-50"
                    disabled={loading}
                >
                    {loading ? 'Saving...' : 'Save Preferences'}
                </button>
            </div>
        </form>
    );
};
