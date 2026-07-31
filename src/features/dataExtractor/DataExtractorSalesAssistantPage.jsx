import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { useAuth } from '@/hooks/useAuth';
import { PATHS } from '@/routes/paths';

const btn = { padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnPrimary = { ...btn, background: '#1d4ed8', color: '#fff', border: 'none' };
const field = { padding: 8, borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' };
const card = { border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 10, background: '#fff' };

function can(hasPermission, key) {
    try { return hasPermission?.(key) === true; } catch { return false; }
}

export default function DataExtractorSalesAssistantPage() {
    const { hasPermission } = useAuth();
    const canView = can(hasPermission, 'data_extractor.ai_sales_assistant.view')
        || can(hasPermission, 'data_extractor.ai_sales_assistant.ask');
    const canAsk = can(hasPermission, 'data_extractor.ai_sales_assistant.ask');
    const canExport = can(hasPermission, 'data_extractor.ai_sales_assistant.export');
    const canPrompts = can(hasPermission, 'data_extractor.ai_sales_assistant.saved_prompts');
    const canAudit = can(hasPermission, 'data_extractor.ai_sales_assistant.audit');
    const canLearningFeedback = can(hasPermission, 'data_extractor.ai_learning.submit_feedback');

    const [sessions, setSessions] = useState([]);
    const [suggested, setSuggested] = useState([]);
    const [sessionId, setSessionId] = useState('');
    const [messages, setMessages] = useState([]);
    const [question, setQuestion] = useState('');
    const [mode, setMode] = useState('HYBRID');
    const [busy, setBusy] = useState('');
    const [lastAnswer, setLastAnswer] = useState(null);
    const [evidenceOpen, setEvidenceOpen] = useState(false);
    const [prompts, setPrompts] = useState([]);
    const [promptTitle, setPromptTitle] = useState('');
    const [promptText, setPromptText] = useState('');
    const [audit, setAudit] = useState([]);

    const loadSessions = useCallback(async () => {
        if (!canView) return;
        try {
            const data = await dataExtractorApi.listAssistantSessions();
            setSessions(data?.items || []);
            setSuggested(data?.suggestedQuestions || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load sessions');
        }
    }, [canView]);

    const loadMessages = useCallback(async (id) => {
        if (!id) return;
        try {
            const data = await dataExtractorApi.listAssistantMessages(id);
            setMessages(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load messages');
        }
    }, []);

    useEffect(() => { loadSessions(); }, [loadSessions]);
    useEffect(() => { if (sessionId) loadMessages(sessionId); }, [sessionId, loadMessages]);

    const newSession = async () => {
        if (!canAsk) return;
        setBusy('new');
        try {
            const s = await dataExtractorApi.createAssistantSession({ title: 'New conversation', mode });
            setSessionId(s._id || s.id);
            setMessages([]);
            setLastAnswer(null);
            await loadSessions();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to create session');
        } finally {
            setBusy('');
        }
    };

    const ask = async (text) => {
        const q = (text ?? question).trim();
        if (!q || !sessionId || !canAsk) return;
        setBusy('ask');
        try {
            const data = await dataExtractorApi.askAssistant(sessionId, { question: q, mode });
            setLastAnswer(data?.answer || null);
            setQuestion('');
            await loadMessages(sessionId);
            await loadSessions();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Ask failed');
        } finally {
            setBusy('');
        }
    };

    const copyAnswer = async () => {
        const text = lastAnswer?.text || '';
        try {
            await navigator.clipboard.writeText(text);
            toast.success('Answer copied');
        } catch {
            toast.error('Copy failed');
        }
    };

    const doExport = async () => {
        if (!canExport || !sessionId) return;
        try {
            const data = await dataExtractorApi.exportAssistantSession(sessionId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `assistant-session-${sessionId}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Export failed');
        }
    };

    const loadPrompts = async () => {
        if (!canPrompts) return;
        try {
            const data = await dataExtractorApi.listAssistantPrompts();
            setPrompts(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Failed to load prompts');
        }
    };

    const savePrompt = async () => {
        if (!canPrompts) return;
        try {
            await dataExtractorApi.createAssistantPrompt({ title: promptTitle || 'Prompt', promptText, scope: 'PERSONAL' });
            setPromptTitle('');
            setPromptText('');
            await loadPrompts();
            toast.success('Prompt saved');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Save failed');
        }
    };

    const loadAudit = async () => {
        if (!canAudit) return;
        try {
            const data = await dataExtractorApi.getAssistantAudit();
            setAudit(data?.items || []);
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Audit load failed');
        }
    };

    if (!canView) {
        return <div style={card}>You do not have permission to view the AI Sales Assistant.</div>;
    }

    const chips = Object.entries(lastAnswer?.filters || {}).filter(([, v]) => v != null && v !== '');

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: 18 }}>AI Sales Assistant</h2>
                    <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
                        Read-only grounded search and sales copilot. No create / assign / send / execute actions.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select value={mode} onChange={(e) => setMode(e.target.value)} style={field}>
                        <option value="RULE_ONLY">RULE_ONLY</option>
                        <option value="TEMPLATE_ONLY">TEMPLATE_ONLY</option>
                        <option value="AI_ASSISTED">AI_ASSISTED</option>
                        <option value="HYBRID">HYBRID</option>
                    </select>
                    <button type="button" style={btnPrimary} disabled={!canAsk || busy === 'new'} onClick={newSession}>New conversation</button>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 12 }}>
                <div style={card}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}>Sessions</div>
                    <div style={{ maxHeight: 360, overflow: 'auto' }}>
                        {(sessions || []).map((s) => (
                            <button
                                key={s._id}
                                type="button"
                                style={{
                                    ...btn,
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    marginBottom: 6,
                                    background: sessionId === s._id ? '#eff6ff' : '#fff',
                                }}
                                onClick={() => { setSessionId(s._id); setLastAnswer(null); }}
                            >
                                <div style={{ fontWeight: 600 }}>{s.title || 'Conversation'}</div>
                                <div style={{ fontSize: 11, color: '#94a3b8' }}>{s.status} · {s.messageCount || 0} msgs</div>
                            </button>
                        ))}
                    </div>
                    {sessionId && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            <button type="button" style={btn} onClick={() => dataExtractorApi.clearAssistantContext(sessionId).then(loadSessions)}>Clear context</button>
                            <button type="button" style={btn} onClick={() => dataExtractorApi.archiveAssistantSession(sessionId).then(loadSessions)}>Archive</button>
                            <button type="button" style={btn} onClick={() => dataExtractorApi.deleteAssistantSession(sessionId).then(() => { setSessionId(''); loadSessions(); })}>Delete</button>
                            {canExport && <button type="button" style={btn} onClick={doExport}>Export</button>}
                        </div>
                    )}
                </div>

                <div>
                    {!sessionId && (
                        <div style={card}>Start or select a conversation to ask grounded questions.</div>
                    )}

                    {sessionId && (
                        <>
                            <div style={{ ...card, maxHeight: 280, overflow: 'auto' }}>
                                {(messages || []).map((m) => (
                                    <div key={m._id} style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{m.role} · {m.intent || ''}</div>
                                        <div style={{ fontSize: 13 }}>{m.content}</div>
                                        {m.role === 'assistant' && canLearningFeedback && (
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                                {[
                                                    ['HELPFUL', 'Helpful'],
                                                    ['NOT_HELPFUL', 'Not helpful'],
                                                    ['INCORRECT', 'Incorrect'],
                                                    ['INCOMPLETE', 'Incomplete'],
                                                    ['PRIVACY_CONCERN', 'Privacy concern'],
                                                ].map(([type, label]) => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        style={btn}
                                                        onClick={async () => {
                                                            try {
                                                                await dataExtractorApi.submitLearningFeedback({
                                                                    sourceModule: 'sales_assistant',
                                                                    sourceRecordId: m._id,
                                                                    feedbackType: type,
                                                                    comment: type === 'HELPFUL' ? '' : `Assistant feedback: ${label}`,
                                                                    outputType: 'assistant_response',
                                                                });
                                                                toast.success('Feedback recorded (answer not regenerated)');
                                                            } catch (err) {
                                                                toast.error(err?.response?.data?.message || 'Feedback failed');
                                                            }
                                                        }}
                                                    >
                                                        {label}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {!!suggested.length && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                                    {suggested.map((q) => (
                                        <button key={q} type="button" style={btn} disabled={!canAsk || !!busy} onClick={() => ask(q)}>{q}</button>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                                <input
                                    style={field}
                                    value={question}
                                    disabled={!canAsk}
                                    placeholder="Ask a read-only question…"
                                    onChange={(e) => setQuestion(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
                                />
                                <button type="button" style={btnPrimary} disabled={!canAsk || busy === 'ask'} onClick={() => ask()}>Ask</button>
                            </div>

                            {lastAnswer && (
                                <div style={card}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <div style={{ fontWeight: 700 }}>{lastAnswer.headline}</div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button type="button" style={btn} onClick={copyAnswer}>Copy answer</button>
                                            <button type="button" style={btn} onClick={() => setEvidenceOpen((v) => !v)}>
                                                {evidenceOpen ? 'Hide evidence' : 'Why this answer / sources'}
                                            </button>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: 13 }}>{lastAnswer.text}</p>

                                    {lastAnswer.clarificationRequired && (
                                        <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                                            Clarification required — the Assistant will not silently guess.
                                        </div>
                                    )}

                                    {lastAnswer.type === 'unsupported_action' && (
                                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                                            Unsupported action blocked. Assistant remains read-only.
                                        </div>
                                    )}

                                    {(lastAnswer.providerStatus === 'PROVIDER_UNAVAILABLE' || String(lastAnswer.providerMode || '').includes('FALLBACK')) && (
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: 8, borderRadius: 6, marginBottom: 8, fontSize: 12 }}>
                                            AI unavailable / fallback — deterministic search and templates still work. {lastAnswer.aiNote || ''}
                                        </div>
                                    )}

                                    {!!chips.length && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                            {chips.map(([k, v]) => (
                                                <span key={k} style={{ fontSize: 11, background: '#eff6ff', borderRadius: 999, padding: '2px 8px' }}>
                                                    {k}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {lastAnswer.aggregateOnly && (
                                        <div style={{ fontSize: 12, color: '#b45309', marginBottom: 8 }}>
                                            Aggregate-only notice: identifiable company/contact details are restricted.
                                        </div>
                                    )}

                                    {!!(lastAnswer.results || []).length && (
                                        <div style={{ overflow: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                                <thead>
                                                    <tr>
                                                        <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>Company / Item</th>
                                                        <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>Score / Status</th>
                                                        <th style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', padding: 4 }}>Freshness</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(lastAnswer.results || []).slice(0, 50).map((r, idx) => (
                                                        <tr key={r.id || idx}>
                                                            <td style={{ padding: 4, borderBottom: '1px solid #f1f5f9' }}>{r.companyName || r.title || r.product || r.id || '—'}</td>
                                                            <td style={{ padding: 4, borderBottom: '1px solid #f1f5f9' }}>{r.finalScore ?? r.priority ?? r.status ?? r.handoffStatus ?? '—'}</td>
                                                            <td style={{ padding: 4, borderBottom: '1px solid #f1f5f9' }}>
                                                                <span>{r.outdated || r.freshness === 'OUTDATED' ? 'OUTDATED' : (r.freshness || 'CURRENT')}</span>
                                                                {r.locked || r.lockStatus === 'LOCKED' ? ' · LOCKED' : ''}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}

                                    {!!(lastAnswer.limitations || []).length && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600 }}>Limitations</div>
                                            <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 12, color: '#64748b' }}>
                                                {(lastAnswer.limitations || []).map((l) => <li key={l}>{l}</li>)}
                                            </ul>
                                        </div>
                                    )}

                                    {!!(lastAnswer.navigationSuggestions || []).length && (
                                        <div style={{ marginTop: 8 }}>
                                            <div style={{ fontSize: 12, fontWeight: 600 }}>Navigation suggestions (executable: false)</div>
                                            <ul style={{ margin: '4px 0', paddingLeft: 18, fontSize: 12 }}>
                                                {(lastAnswer.navigationSuggestions || []).map((n) => (
                                                    <li key={n.label}>
                                                        {n.navigationRoute
                                                            ? <Link to={n.navigationRoute}>{n.label}</Link>
                                                            : n.label}
                                                        {' — '}{n.reason}
                                                        <span style={{ color: '#94a3b8' }}> · not executable</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {evidenceOpen && (
                                        <div style={{ marginTop: 8, background: '#f8fafc', padding: 8, borderRadius: 6, fontSize: 12 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 4 }}>Source evidence</div>
                                            <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{JSON.stringify(lastAnswer.evidence || [], null, 2)}</pre>
                                            <div style={{ marginTop: 6 }}>
                                                Confidence: {lastAnswer.confidence ?? '—'} · {lastAnswer.whyThisAnswer || ''}
                                            </div>
                                            <div style={{ marginTop: 4 }}>
                                                <Link to={PATHS.DATA_EXTRACTOR.ANALYTICS}>Open Analytics</Link>
                                                {' · '}
                                                <Link to={PATHS.DATA_EXTRACTOR.LEAD_SCORING}>Open Lead Scores</Link>
                                                {' · '}
                                                <Link to={PATHS.DATA_EXTRACTOR.SALES_WORKFLOW}>Open Sales Workflow</Link>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {canPrompts && (
                        <div style={card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong>Saved prompts</strong>
                                <button type="button" style={btn} onClick={loadPrompts}>Refresh</button>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, marginTop: 8 }}>
                                <input style={field} placeholder="Title" value={promptTitle} onChange={(e) => setPromptTitle(e.target.value)} />
                                <input style={field} placeholder="Prompt text" value={promptText} onChange={(e) => setPromptText(e.target.value)} />
                                <button type="button" style={btnPrimary} onClick={savePrompt}>Save</button>
                            </div>
                            <ul style={{ fontSize: 12 }}>
                                {(prompts || []).map((p) => (
                                    <li key={p._id}>
                                        <button type="button" style={btn} disabled={!sessionId || !canAsk} onClick={() => ask(p.promptText)}>{p.title}</button>
                                        <span style={{ marginLeft: 6, color: '#94a3b8' }}>{p.scope}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {canAudit && (
                        <div style={card}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <strong>Audit / query history</strong>
                                <button type="button" style={btn} onClick={loadAudit}>Load audit</button>
                            </div>
                            <ul style={{ fontSize: 12, maxHeight: 180, overflow: 'auto' }}>
                                {(audit || []).map((a) => (
                                    <li key={a._id}>
                                        {a.intent} · blocked={String(!!a.blocked)} · {a.questionPreview}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
