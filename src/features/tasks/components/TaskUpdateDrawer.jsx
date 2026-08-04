import React, { useState, useEffect, useCallback } from 'react';
import { X, Save, Clock3, CheckCircle, RotateCcw } from 'lucide-react';
import { getTask, addTaskUpdate, extendTask, closeTask } from '@/services/taskApi';
import { useToast } from '@/components/ui/Toast';
import { format } from 'date-fns';
import { BrandedLoader } from '@/components/ui';

export const TaskUpdateDrawer = ({ taskId, isOpen, onClose, onUpdate }) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [task, setTask] = useState(null);
    const [note, setNote] = useState('');
    const [resolvingId, setResolvingId] = useState(null);
    const [resolutionText, setResolutionText] = useState('');
    const [isExtending, setIsExtending] = useState(false);
    const [extensionData, setExtensionData] = useState({ newDueDate: '', reason: '' });
    const [extendSubmitting, setExtendSubmitting] = useState(false);

    const loadTask = useCallback(async () => {
        if (!taskId) return;
        setLoading(true);
        try {
            const data = await getTask(taskId);
            setTask(data);
        } catch (err) {
            addToast('Failed to load task details.', 'error');
        } finally {
            setLoading(false);
        }
    }, [taskId, addToast]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            loadTask();
            setIsExtending(false);
            setResolvingId(null);
        } else {
            document.body.style.overflow = 'unset';
            setTask(null);
        }
        return () => { document.body.style.overflow = 'unset'; };
    }, [isOpen, loadTask]);

    if (!isOpen) return null;

    const handleSave = async () => {
        if (!note.trim()) return;
        try {
            await addTaskUpdate(taskId, { text: note });
            setNote('');
            addToast('Progress update saved.', 'success');
            loadTask(); // Reload to get the new history
            if (onUpdate) onUpdate();
        } catch (err) {
            addToast('Failed to save update.', 'error');
        }
    };

    const handleResolve = async (parentId) => {
        if (!resolutionText.trim()) return;
        try {
            await addTaskUpdate(taskId, { 
                text: resolutionText, 
                isResolution: true, 
                parentId 
            });
            setResolutionText('');
            setResolvingId(null);
            addToast('Follow-up resolved.', 'success');
            loadTask();
            if (onUpdate) onUpdate();
        } catch (err) {
            addToast('Failed to save resolution.', 'error');
        }
    };

    const handleExtend = async () => {
        if (extendSubmitting) return;
        if (!extensionData.newDueDate) return addToast('Please select a new due date.', 'warning');
        if (task?.dueDate) {
            const currentDay = new Date(task.dueDate);
            currentDay.setHours(0, 0, 0, 0);
            const nextDay = new Date(extensionData.newDueDate);
            nextDay.setHours(0, 0, 0, 0);
            if (nextDay.getTime() <= currentDay.getTime()) {
                return addToast('Extended date must be later than the current due date.', 'warning');
            }
        }
        setExtendSubmitting(true);
        try {
            await extendTask(taskId, {
                newDueDate: extensionData.newDueDate,
                reason: extensionData.reason?.trim() || '',
            });
            // Close route-aware drawer FIRST (same handler as X), then refresh list.
            // Do not call closeTask — task status stays unchanged.
            addToast('Task due date extended successfully.', 'success');
            setIsExtending(false);
            setExtensionData({ newDueDate: '', reason: '' });
            if (onClose) onClose();
            if (onUpdate) onUpdate();
        } catch (err) {
            // Keep panel open; preserve entered new date + optional reason for retry.
            addToast(err?.response?.data?.message || 'Failed to extend task.', 'error');
        } finally {
            setExtendSubmitting(false);
        }
    };

    const handleConclude = async () => {
        if (!window.confirm('Task Closed: Are you sure you want to mark this task as completed?')) return;
        try {
            await closeTask(taskId);
            addToast('Task completed successfully.', 'success');
            if (onUpdate) onUpdate();
            onClose(); // Auto-close original screen/drawer
        } catch (err) {
            addToast('Failed to close task.', 'error');
        }
    };

    const s = {
        overlay: { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'flex-end' },
        drawer: { width: '480px', background: '#fff', height: '100%', boxShadow: '-5px 0 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', animation: 'slideIn 0.3s ease-out' },
        header: { padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
        body: { flex: 1, overflowY: 'auto', padding: '20px' },
        footer: { padding: '16px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', gap: '10px' },
        sectionTitle: { fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.05em' },
        historyItem: { padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '10px', position: 'relative' },
        input: { width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', fontSize: '13px', minHeight: '80px', transition: 'border-color 0.2s' },
        btn: (bg, color) => ({ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', border: 'none', borderRadius: '6px', background: bg, color: color, fontWeight: 700, cursor: 'pointer', fontSize: '13px' })
    };

    const sortedHistory = (() => {
        const updates = (task?.updates || []).map((h) => ({
            ...h,
            _sortDate: new Date(h.date),
            _kind: 'update',
        }));
        const extensions = (task?.extensionHistory || []).map((h, i) => {
            const oldLabel = h.oldDate ? format(new Date(h.oldDate), 'dd/MM/yyyy') : '—';
            const newLabel = h.newDate ? format(new Date(h.newDate), 'dd/MM/yyyy') : '—';
            const reasonLabel = h.reason && String(h.reason).trim()
                ? String(h.reason).trim()
                : 'No reason provided';
            return {
                _id: `ext-${h._id || i}-${h.extendedAt || i}`,
                date: h.extendedAt || h.newDate,
                _sortDate: new Date(h.extendedAt || h.newDate || 0),
                _kind: 'extension',
                userName: h.extendedBy?.name || 'User',
                text: `Due date extended: ${oldLabel} → ${newLabel}\nReason: ${reasonLabel}`,
                status: 'OPEN',
                isResolution: false,
            };
        });
        return [...updates, ...extensions].sort((a, b) => b._sortDate - a._sortDate);
    })();
    const isCompleted = task?.status === 'COMPLETED';

    return (
        <div style={s.overlay} onClick={onClose}>
            <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
            <div style={s.drawer} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{ ...s.header, background: isCompleted ? '#f0fdf4' : '#fff' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: isCompleted ? '#16a34a' : '#0d9488', textTransform: 'uppercase' }}>
                            {isCompleted ? 'Task Completed' : 'Task Progress Update'}
                        </div>
                        <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#1e293b', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isCompleted ? 'line-through' : 'none' }}>
                            {task?.title || (loading ? <BrandedLoader size={16} inline /> : 'Task Details')}
                        </h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 5 }}><X size={20} /></button>
                </div>

                {/* Body */}
                <div style={s.body}>
                    {loading ? (
                        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px 0' }}><BrandedLoader size={80} /></div>
                    ) : (
                        <>
                            {!isCompleted && !isExtending && (
                                <div style={{ marginBottom: '24px', background: '#fff', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}>
                                    <div style={s.sectionTitle}>New Progress Update</div>
                                    <textarea
                                        style={s.input}
                                        placeholder="Add a progress note..."
                                        value={note}
                                        onFocus={e => e.target.style.borderColor = '#0d9488'}
                                        onBlur={e => e.target.style.borderColor = '#cbd5e1'}
                                        onChange={e => setNote(e.target.value)}
                                    />
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                        <button onClick={handleSave} style={{ ...s.btn('#0d9488', '#fff'), flex: 'none', padding: '8px 20px' }}>
                                            <Save size={16} /> Save Note
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isExtending && (
                                <div style={{ marginBottom: '24px', background: '#fef2f2', borderRadius: '10px', padding: '16px', border: '1px solid #fee2e2' }}>
                                    <div style={{ ...s.sectionTitle, color: '#991b1b' }}>Extend Due Date</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#7f1d1d', marginBottom: 4 }}>New Due Date</label>
                                            <input type="date" style={{ ...s.input, minHeight: 'unset' }} value={extensionData.newDueDate} onChange={e => setExtensionData({...extensionData, newDueDate: e.target.value})} />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#7f1d1d', marginBottom: 4 }}>Reason for extension (Optional)</label>
                                            <input type="text" style={{ ...s.input, minHeight: 'unset' }} placeholder="Reason for extension (Optional)" value={extensionData.reason} onChange={e => setExtensionData({...extensionData, reason: e.target.value})} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                type="button"
                                                onClick={handleExtend}
                                                disabled={extendSubmitting}
                                                style={{
                                                    ...s.btn('#dc2626', '#fff'),
                                                    opacity: extendSubmitting ? 0.7 : 1,
                                                    cursor: extendSubmitting ? 'not-allowed' : 'pointer',
                                                }}
                                            >
                                                {extendSubmitting ? 'Extending...' : 'Confirm Extension'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsExtending(false)}
                                                disabled={extendSubmitting}
                                                style={{ ...s.btn('#fff', '#475569'), border: '1px solid #d1d5db', opacity: extendSubmitting ? 0.7 : 1 }}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <div style={s.sectionTitle}>History & Follow-ups</div>
                                {sortedHistory.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '12px', padding: '20px 0' }}>No progress updates yet.</div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        {sortedHistory.map((h) => (
                                            <div key={h._id} style={{ 
                                                ...s.historyItem, 
                                                borderLeft: h.text.includes('✅') ? '4px solid #16a34a' : h.status === 'RESOLVED' ? '4px solid #94a3b8' : '1px solid #e2e8f0',
                                                marginLeft: h.isResolution ? '24px' : '0',
                                                opacity: h.status === 'RESOLVED' ? 0.7 : 1
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155' }}>{h.userName || 'User'}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        {h.status === 'RESOLVED' && <span style={{ fontSize: '9px', background: '#f1f5f9', padding: '1px 4px', borderRadius: '3px', color: '#64748b' }}>Resolved</span>}
                                                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>{format(new Date(h.date), 'dd/MM HH:mm')}</span>
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, wordBreak: 'break-word' }}>{h.text}</div>
                                                
                                                {!isCompleted && h._kind !== 'extension' && h.status !== 'RESOLVED' && !h.isResolution && (
                                                    <div style={{ marginTop: '8px' }}>
                                                        {resolvingId === h._id ? (
                                                            <div style={{ display: 'flex', gap: '6px', flexDirection: 'column', background: '#fff', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                <input 
                                                                    style={{ ...s.input, minHeight: '34px', fontSize: '12px' }}
                                                                    placeholder="Follow-up resolution text..."
                                                                    value={resolutionText}
                                                                    onChange={e => setResolutionText(e.target.value)}
                                                                    autoFocus
                                                                />
                                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                                    <button onClick={() => handleResolve(h._id)} style={{ padding: '4px 10px', fontSize: '11px', background: '#0d9488', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}>Resolve</button>
                                                                    <button onClick={() => setResolvingId(null)} style={{ padding: '4px 10px', fontSize: '11px', background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button  onClick={() => setResolvingId(h._id)} style={{ border: 'none', background: 'none', color: '#0d9488', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                                                                + Post Follow-up
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                <div style={s.footer}>
                    {isCompleted ? (
                        <div style={{ flex: 1, textAlign: 'center', color: '#16a34a', fontWeight: 800, fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <CheckCircle size={18} /> Task Completed on {task?.completedAt ? format(new Date(task.completedAt), 'dd MMM yyyy') : 'Recently'}
                        </div>
                    ) : (
                        <>
                            <button style={s.btn('#eff6ff', '#2563eb')} onClick={() => setIsExtending(true)}>
                                <Clock3 size={16} /> Extend Date
                            </button>
                            <button style={s.btn('#f0fdf4', '#166534')} onClick={handleConclude}>
                                <CheckCircle size={16} /> Task Closed
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
