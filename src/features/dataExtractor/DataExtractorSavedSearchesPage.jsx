import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';

const field = { display: 'block', width: '100%', marginTop: 4, padding: 10, borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' };
const btn = (bg = '#2563eb') => ({ padding: '8px 12px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 13 });

const SOURCES = [
    { id: 'public_web', label: 'Web' },
    { id: 'indiamart', label: 'IndiaMART' },
    { id: 'facebook', label: 'Facebook' },
    { id: 'instagram', label: 'Instagram' },
    { id: 'linkedin', label: 'LinkedIn' },
    { id: 'x', label: 'X / Twitter' },
];

export default function DataExtractorSavedSearchesPage() {
    const { selectedFY } = useFinancialYear();
    const navigate = useNavigate();
    const [rows, setRows] = useState([]);
    const [form, setForm] = useState({
        name: '', keyword: '', location: '', batchSize: 25, selectedSources: ['public_web'],
        scheduleEnabled: false, frequency: 'weekly', weekday: 1, hour: 9, minute: 0,
    });

    const load = useCallback(async () => {
        try {
            const res = await dataExtractorApi.listOpsSavedSearches();
            setRows(res?.results || res || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load saved searches');
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const toggleSource = (id) => {
        setForm((f) => {
            const set = new Set(f.selectedSources);
            if (set.has(id)) set.delete(id); else set.add(id);
            if (!set.size) set.add('public_web');
            return { ...f, selectedSources: [...set] };
        });
    };

    const onSave = async (e) => {
        e.preventDefault();
        try {
            await dataExtractorApi.createOpsSavedSearch({
                name: form.name,
                keyword: form.keyword,
                location: form.location,
                batchSize: Number(form.batchSize) || 25,
                selectedSources: form.selectedSources,
                financialYear: selectedFY,
                schedule: {
                    enabled: form.scheduleEnabled === true,
                    frequency: form.scheduleEnabled ? form.frequency : 'off',
                    weekday: Number(form.weekday),
                    hour: Number(form.hour),
                    minute: Number(form.minute),
                    timezone: 'Asia/Kolkata',
                },
            });
            toast.success('Saved search created. Schedule stays off unless you enabled it.');
            setForm((f) => ({ ...f, name: '', keyword: '' }));
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Save failed');
        }
    };

    const runAgain = async (id) => {
        try {
            const res = await dataExtractorApi.runOpsSavedSearch(id);
            toast.success(`Started. Previous unique companies: ${res.previousUnique ?? 0}. Repeat run classifies Known / Updated / New.`);
            const jobId = res.job?._id || res.job?.id;
            if (jobId) navigate(PATHS.DATA_EXTRACTOR.DISCOVERY_JOB(jobId));
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Run failed');
        }
    };

    const setSchedule = async (row, enabled) => {
        try {
            await dataExtractorApi.updateOpsSavedSearch(row._id, {
                schedule: {
                    enabled,
                    frequency: enabled ? (row.schedule?.frequency && row.schedule.frequency !== 'off' ? row.schedule.frequency : 'weekly') : 'off',
                    weekday: row.schedule?.weekday ?? 1,
                    hour: row.schedule?.hour ?? 9,
                    minute: row.schedule?.minute ?? 0,
                    timezone: 'Asia/Kolkata',
                },
            });
            toast.success(enabled ? 'Schedule enabled' : 'Schedule disabled');
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || 'Schedule update failed');
        }
    };

    return (
        <div>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>Saved Searches</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                Run Again uses company identity to classify Known / Updated / New. Schedule is optional and defaults OFF. Credentials are never stored.
            </p>
            <form onSubmit={onSave} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, maxWidth: 720, marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>Name
                    <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Home Automation — India" style={field} />
                </label>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>Keyword
                    <input required value={form.keyword} onChange={(e) => setForm((f) => ({ ...f, keyword: e.target.value }))} placeholder="Home Automation" style={field} />
                </label>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>Location
                    <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="India / Mumbai" style={field} />
                </label>
                <div style={{ fontSize: 13, marginBottom: 8 }}>Sources (do not force all)</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                    {SOURCES.map((s) => (
                        <label key={s.id} style={{ fontSize: 13 }}>
                            <input type="checkbox" checked={form.selectedSources.includes(s.id)} onChange={() => toggleSource(s.id)} /> {s.label}
                        </label>
                    ))}
                </div>
                <label style={{ display: 'block', marginBottom: 10, fontSize: 13 }}>Batch size (operational only — does not cap total collection)
                    <input type="number" min={1} max={250} value={form.batchSize} onChange={(e) => setForm((f) => ({ ...f, batchSize: Number(e.target.value) }))} style={field} />
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
                    <input type="checkbox" checked={form.scheduleEnabled} onChange={(e) => setForm((f) => ({ ...f, scheduleEnabled: e.target.checked }))} />
                    Enable schedule (default off)
                </label>
                {form.scheduleEnabled ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        <select value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} style={field}>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                        {form.frequency === 'weekly' ? (
                            <select value={form.weekday} onChange={(e) => setForm((f) => ({ ...f, weekday: Number(e.target.value) }))} style={field}>
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => <option key={d} value={i}>{d}</option>)}
                            </select>
                        ) : null}
                        <input type="number" min={0} max={23} value={form.hour} onChange={(e) => setForm((f) => ({ ...f, hour: Number(e.target.value) }))} style={field} />
                        <input type="number" min={0} max={59} value={form.minute} onChange={(e) => setForm((f) => ({ ...f, minute: Number(e.target.value) }))} style={field} />
                    </div>
                ) : null}
                <button type="submit" style={btn()}>Save search</button>
            </form>

            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                            {['Name', 'Keyword', 'Sources', 'Schedule', 'Actions'].map((h) => <th key={h} style={{ padding: 8 }}>{h}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r._id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                <td style={{ padding: 8 }}>{r.name}</td>
                                <td style={{ padding: 8 }}>{r.keyword}{r.location ? ` · ${r.location}` : ''}</td>
                                <td style={{ padding: 8 }}>{(r.selectedSources || []).join(', ')}</td>
                                <td style={{ padding: 8 }}>{r.schedule?.enabled ? `${r.schedule.frequency} ${r.schedule.hour}:00` : 'OFF'}</td>
                                <td style={{ padding: 8 }}>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                        <button type="button" style={btn()} onClick={() => runAgain(r._id)}>Run again</button>
                                        <button type="button" style={btn('#0f766e')} onClick={() => setSchedule(r, !r.schedule?.enabled)}>
                                            {r.schedule?.enabled ? 'Disable schedule' : 'Enable schedule'}
                                        </button>
                                        <button
                                            type="button"
                                            style={btn('#b91c1c')}
                                            onClick={async () => {
                                                if (!window.confirm('Archive this saved search?')) return;
                                                try {
                                                    await dataExtractorApi.archiveOpsSavedSearch(r._id);
                                                    await load();
                                                } catch (err) {
                                                    toast.error(err?.response?.data?.message || 'Archive failed');
                                                }
                                            }}
                                        >
                                            Archive
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
