import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams, useNavigate } from 'react-router-dom';
import { PATHS } from '@/routes/paths';
import { useFinancialYear } from '@/contexts/FinancialYearContext';
import { useAuth } from '@/hooks/useAuth';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import {
    formatOwnerBanner,
    isLiveRunStatus,
    readLocalDeviceId,
    resolveStartNewDecision,
    writeLocalDeviceId,
} from './simpleLeadSearchOwnershipUi';
import {
    Rocket, Info, PlayCircle, ShieldAlert, Search, Database, Sparkles,
    CheckCircle2, AlertTriangle, XCircle, RefreshCw, ChevronRight, Layers, Ban,
} from 'lucide-react';
import styles from './DataExtractorSimpleLeadSearchPage.module.css';
import {
    AUTO_RESUME_BACKLOG_MESSAGE,
    CAMPAIGN_LOAD_ERROR_MESSAGE,
    formatSimpleSearchLabel,
    formatBusinessTypeField,
    nextSimpleBusinessTypes,
    reconcileBucketsFromCounts,
    safeGeneratedQueries,
    safeQueryIndex,
    lastVisibleRunError,
    safeQueryTotal,
    shouldKeepPollingForAutoProcessing,
    formatQueryProgressLabel,
    pendingQueryCount,
    formatProviderState,
    formatDiscoveryOwnerStatus,
    isWaitingForDiscoveryAgent,
    isLongAgentOfflinePause,
    isOwnerManualPause,
    campaignHasUnfinishedDiscovery,
    isAuthoritativeCollectionComplete,
    AGENT_SLEEP_PAUSE_MESSAGE,
    isBrowserRequestTimeout,
    BROWSER_REQUEST_TIMEOUT_MESSAGE,
    isOwnerStoppedSearch,
    isAlreadyStoppedMessage,
    isOwnerStopCopy,
    alreadyStoppedUserMessage,
    allProcessingAlreadyStoppedMessage,
    searchStoppedSuccessMessage,
    RUN_LOAD,
    RUN_LOAD_MESSAGES,
    nextSessionLoadRetryMs,
    isRetryableSessionLoadError,
    isConfirmedSessionAbsent,
    shouldHideStartExtraction,
} from './simpleLeadSearchUi.js';
import SimpleLeadSearchCapturedDataPanel from './SimpleLeadSearchCapturedDataPanel.jsx';
import SimpleLeadSearchLiveActivityPanel from './SimpleLeadSearchLiveActivityPanel.jsx';
import DataExtractorActiveRunsPanel from './DataExtractorActiveRunsPanel.jsx';
import DataExtractorRegisterThisPcPanel from './DataExtractorRegisterThisPcPanel';

class SimpleLeadSearchErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch() {
        /* soft — owner sees friendly recovery UI, not stack traces */
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className={styles.page}>
                    <div className={styles.card}>
                        <p style={{ marginTop: 0, color: '#9a3412', fontWeight: 600 }}>{CAMPAIGN_LOAD_ERROR_MESSAGE}</p>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button type="button" className={styles.howBtn} onClick={() => this.setState({ hasError: false })}>
                                Retry
                            </button>
                            <button
                                type="button"
                                className={styles.primaryBtn}
                                style={{ width: 'auto', padding: '10px 16px', boxShadow: 'none' }}
                                onClick={() => {
                                    this.setState({ hasError: false });
                                    if (typeof this.props.onStartNew === 'function') this.props.onStartNew();
                                }}
                            >
                                Start New Search
                            </button>
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

const fieldStyle = {
    display: 'block',
    width: '100%',
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    boxSizing: 'border-box',
};
const labelStyle = { display: 'block', marginBottom: 12, fontSize: 13, fontWeight: 500 };
const btn = (bg, disabled) => ({
    padding: '10px 16px',
    background: disabled ? '#94a3b8' : bg,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 13,
    fontWeight: 600,
});

const INACTIVE = new Set(['completed', 'cancelled', 'expired', 'failed']);
const GOOGLE_READY = new Set(['awaiting_user', 'ready_to_capture']);
const OPENING = new Set(['queued', 'agent_assigned', 'opening']);
const INDIA_DEFAULT_BUSINESS_TYPES = ['Manufacturer'];
const SIMPLE_BUSINESS_TYPES = ['Manufacturer', 'Supplier', 'Distributor', 'Dealer', 'Exporter', 'Importer', 'Wholesaler', 'Service Provider', 'Any Business'];
const CHINA_DEFAULT_BUSINESS_TYPES = ['Manufacturer', 'OEM / ODM', 'Supplier'];
const CHINA_DEFAULT_SOURCES = ['1688', 'baidu', 'sogou', 'so360', 'alibaba', 'made_in_china', 'global_sources', 'google_global'];
const CHINA_SOURCE_BADGES = [
    { id: '1688', label: '1688 Direct', status: 'Ready' },
    { id: 'baidu', label: 'Baidu', status: 'Ready' },
    { id: 'sogou', label: 'Sogou', status: 'Ready' },
    { id: 'so360', label: '360 Search', status: 'Ready' },
    { id: 'alibaba', label: 'Alibaba Indexed', status: 'Ready' },
    { id: 'made_in_china', label: 'Made-in-China Indexed', status: 'Ready' },
    { id: 'global_sources', label: 'Global Sources Indexed', status: 'Ready' },
    { id: 'google_global', label: 'Google Web', status: 'Secondary' },
];

function chinaSourcePreviewLabel(platform) {
    const p = String(platform || '').toLowerCase();
    if (p === '1688') return '1688';
    if (p === 'baidu') return 'Baidu';
    if (p === 'sogou') return 'Sogou';
    if (p === 'so360') return '360';
    if (p === 'alibaba') return 'Alibaba Indexed';
    if (p === 'made_in_china') return 'Made-in-China Indexed';
    if (p === 'global_sources') return 'Global Sources Indexed';
    if (p === 'google_global' || p === 'google') return 'Google';
    return platform || '—';
}

function openingSourceLabel(session) {
    const s = String(session?.source || session?.sourceHint || '').toLowerCase();
    if (s === '1688') return '1688';
    if (s === 'baidu') return 'Baidu';
    if (s === 'sogou') return 'Sogou';
    if (s === 'so360' || s === '360') return '360 Search';
    return 'Google';
}

function manualActionCopy(session) {
    const name = openingSourceLabel(session);
    if (name !== 'Google') {
        return {
            title: `${name} requires verification.`,
            detail: 'Complete verification in the Discovery Agent browser, then click Continue After Manual Action.',
        };
    }
    return {
        title: 'Manual action required in the Google window.',
        detail: 'Resolve consent or CAPTCHA in the managed Google window, then click Continue After Manual Action.',
    };
}
const CAPTURE_OK = new Set(['awaiting_user', 'ready_to_capture', 'manual_action_required', 'capturing']);

function isChinaCountryInput(country) {
    const c = String(country || '').trim().toLowerCase();
    return c === 'china' || c === 'cn' || c === 'prc' || c === "people's republic of china";
}

function agentLabel(status) {
    if (!status) return { text: 'Checking agent...', color: '#64748b', online: false, canStart: false };
    const raw = String(status.displayStatus || status.status || '').toLowerCase();
    const deviceName = status.deviceName || status.assignedDeviceName || '';
    const labeled = String(status.displayLabel || '').trim();
    if (raw === 'busy') {
        return { text: labeled || (deviceName ? `Discovery Agent: Busy — ${deviceName}` : 'Discovery Agent: Busy'), color: '#b45309', online: true, canStart: false };
    }
    if (raw === 'error') {
        return { text: labeled || 'Discovery Agent: Error', color: '#b91c1c', online: false, canStart: false };
    }
    if (status.online || raw === 'ready' || raw === 'connected' || status.connected) {
        return {
            text: labeled || (deviceName ? `Discovery Agent: Ready — ${deviceName}` : 'Discovery Agent: Ready'),
            color: '#15803d',
            online: true,
            canStart: status.canStartOnThisDevice !== false,
        };
    }
    return {
        text: labeled || (deviceName ? 'Discovery Agent: Offline on this device' : 'Discovery Agent: Offline'),
        color: '#b45309',
        online: false,
        canStart: false,
    };
}

function sessionBanner(session, uiLabel, manualMessage, opts = {}) {
    const status = session?.status || '';
    if (status === 'manual_action_required') {
        const copy = manualActionCopy(session);
        return {
            tone: 'warn',
            title: copy.title,
            detail: manualMessage || copy.detail,
        };
    }
    if (GOOGLE_READY.has(status)) {
        return {
            tone: 'ready',
            title: opts.fullAuto
                ? 'Google Ready — Automatic Process starting…'
                : 'Google Ready — Click Capture Visible Results',
            detail: 'Stay on this CRM page. Open the Google window only for scroll, consent, or CAPTCHA.',
        };
    }
    if (status === 'queued') {
        return {
            tone: 'info',
            title: 'Waiting for discovery service',
            detail: 'Campaign is queued. It starts automatically when the Discovery Agent is Ready. You can leave this page.',
        };
    }
    if (OPENING.has(status)) {
        return {
            tone: 'info',
            title: uiLabel || 'Opening Google',
            detail: 'Discovery Agent is opening managed Google Search. Remain on this page.',
        };
    }
    if (status === 'capturing') {
        return {
            tone: 'info',
            title: 'Capture in Progress',
            detail: 'Capturing visible Google organic results...',
        };
    }
    if (status === 'capture_completed_ui') {
        return {
            tone: 'ready',
            title: 'Capture Completed',
            detail: 'Results are in the table. Capture Again, Stop Search, or Stop & Export when ready.',
        };
    }
    if (status === 'failed') {
        return {
            tone: 'warn',
            title: 'Google did not open — click Retry',
            detail: manualMessage
                || 'Discovery Agent could not claim/open managed Google Search. Fix the agent (listen on 5100), then Retry.',
        };
    }
    if (status === 'cancelled' || opts.ownerStopped) {
        return {
            tone: 'done',
            title: 'STOPPED BY USER',
            detail: 'This search is stopped. Collected results remain viewable and exportable. Start a new search to continue.',
        };
    }
    if (INACTIVE.has(status)) {
        if (opts.campaignActive && !opts.ownerStopped) {
            return {
                tone: 'info',
                title: 'Continuing next source',
                detail: 'This query finished. The campaign is still running on the next source.',
            };
        }
        return {
            tone: 'done',
            title: opts.ownerStopped ? 'STOPPED BY USER' : 'Campaign ended',
            detail: uiLabel && !INACTIVE.has(uiLabel) ? uiLabel : 'This campaign is no longer active. Export is still available for preserved captures.',
        };
    }
    return { tone: 'info', title: uiLabel || status || 'Working...', detail: '' };
}

const toneStyle = {
    ready: { background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46' },
    warn: { background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e' },
    info: { background: '#eff6ff', border: '1px solid #93c5fd', color: '#1e3a8a' },
    done: { background: '#f8fafc', border: '1px solid #e2e8f0', color: '#334155' },
};

function softSessionError(err) {
    if (isBrowserRequestTimeout(err)) return BROWSER_REQUEST_TIMEOUT_MESSAGE;
    const apiMsg = String(err?.response?.data?.message || '').trim();
    const msg = apiMsg || String(err?.message || '').trim();
    if (/session ended\. start a new search/i.test(msg) && /before auto collection|then use open next/i.test(msg)) {
        return msg;
    }
    if (/campaign validation failed/i.test(msg)) return msg.slice(0, 500);
    if (isAlreadyStoppedMessage(apiMsg || msg)) {
        return alreadyStoppedUserMessage();
    }
    if (/request failed with status code/i.test(msg)) {
        return apiMsg || 'Request failed';
    }
    return msg || 'Request failed';
}

/** Owner-facing start/preview errors — never show only a blank generic failure when backend sent detail. */
function ownerFacingSearchError(err, fallback = 'Search & Start Automatic Process failed') {
    if (isBrowserRequestTimeout(err)) return BROWSER_REQUEST_TIMEOUT_MESSAGE;
    const status = err?.response?.status;
    const data = err?.response?.data;
    const msg = String(data?.message || err?.message || '').trim();
    if (msg && !/^request failed$/i.test(msg) && !/^network error$/i.test(msg)) return msg.slice(0, 500);
    if (!err?.response) {
        return 'China supplier search could not be started because the backend is unavailable.';
    }
    if (status === 403) return 'You do not have permission to start this search.';
    if (status >= 500) {
        return 'The Discovery Agent is connected, but campaign creation failed. Check Advanced/Admin logs or retry.';
    }
    return msg || fallback;
}

function downloadBlobFromAxios(response, fallbackName = 'simple-lead-search.xlsx') {
    const blob = response?.data instanceof Blob
        ? response.data
        : new Blob([response?.data], {
            type: response?.headers?.['content-type'] || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
    let filename = fallbackName;
    const cd = response?.headers?.['content-disposition'] || response?.headers?.['Content-Disposition'] || '';
    const star = /filename\*=(?:UTF-8''|utf-8'')([^;\n]+)/i.exec(cd);
    const plain = /filename="?([^";\n]+)"?/i.exec(cd);
    const raw = (star && star[1]) || (plain && plain[1]) || '';
    if (raw) {
        try {
            filename = decodeURIComponent(raw.trim());
        } catch {
            filename = raw.trim();
        }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return filename;
}

function isManualCollectionLimit(options) {
    const mode = String(options?.collectionMode || '').toLowerCase();
    const target = Number(options?.requestedCaptureTarget || 0);
    return (mode === 'fixed_target' || mode === 'manual' || mode === 'manual_limit') && target > 0;
}

function collectionModeStartPayload(options) {
    const manual = isManualCollectionLimit(options);
    const target = manual ? Math.max(1, Math.round(Number(options.requestedCaptureTarget))) : 0;
    return {
        collectionMode: manual ? 'fixed_target' : 'unlimited',
        requestedCaptureTarget: target,
        captureTarget: target,
    };
}

function collectionModeResetPatch() {
    return { collectionMode: 'unlimited', requestedCaptureTarget: 0 };
}

function socialStatusLabel(social) {
    if (social?.url) return '';
    if (social?.matchConfidence === 'possible_match') return 'Possible Match';
    if (social?.matchConfidence === 'review_required') return 'Review Required';
    return 'Not Found';
}

function SocialCell({ social, network }) {
    if (!social?.url) {
        return <span style={{ color: '#64748b' }}>{socialStatusLabel(social)}</span>;
    }
    const handle = social.handle ? `@${String(social.handle).replace(/^@/, '')}` : (social.pageName || network);
    return (
        <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
            <span title={social.url}>{handle}</span>
            <span>
                <a href={social.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Open</a>
                {social.sourceUrl ? (
                    <a href={social.sourceUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 8, color: '#64748b', fontSize: 11 }}>src</a>
                ) : null}
            </span>
        </span>
    );
}

function pageCaptureKey(session) {
    if (!session) return '';
    return [String(session.queryId || ''), String(session.googlePageIndex || 1), String(session.searchUrl || '')].join('|');
}

function formatPhoneCell(phone) {
    if (!phone) return '-';
    const conf = phone.confidence ? ` (${phone.confidence})` : '';
    return `${phone.normalized || phone.original}${conf}`;
}

function inferUiLocationScope(form) {
    if (form.locationScope === 'worldwide' && !form.city?.trim() && !form.state?.trim() && !form.country?.trim()) {
        return 'worldwide';
    }
    if (String(form.city || '').trim()) return 'city';
    if (String(form.state || '').trim()) return 'state';
    if (String(form.country || '').trim()) return 'country';
    return 'worldwide';
}

export default function DataExtractorSimpleLeadSearchPage({ initialSessionId = null, runMode = false } = {}) {
    const params = useParams();
    const navigate = useNavigate();
    const resumeSessionId = initialSessionId || params.sessionId || null;
    const { selectedFY } = useFinancialYear();
    const { user } = useAuth();
    const [startNewPrompt, setStartNewPrompt] = useState(false);
    const [form, setForm] = useState({
        product: '',
        relatedKeywords: '',
        businessTypes: ['Manufacturer'],
        locationScope: 'country',
        city: '',
        state: '',
        country: '',
        searchMarket: 'india_global_web',
        selectedSources: ['google_web'],
        expandStateSearch: false,
        expandCountrySearch: false,
        expandCities: [],
        expandStates: [],
    });
    const [queryPreview, setQueryPreview] = useState(null);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [agentStatus, setAgentStatus] = useState(null);
    const [selectedDeviceId, setSelectedDeviceId] = useState(() => readLocalDeviceId());
    const [busy, setBusy] = useState('');
    const [result, setResult] = useState(null);
    const [session, setSession] = useState(null);
    const [rows, setRows] = useState([]);
    const [captureStats, setCaptureStats] = useState(null);
    const [campaignProgress, setCampaignProgress] = useState(null);
    const [sessionUiLabel, setSessionUiLabel] = useState('');
    const [captureCompletedFlash, setCaptureCompletedFlash] = useState(false);
    const [ownerErrorMessage, setOwnerErrorMessage] = useState('');
    const [enrichmentJob, setEnrichmentJob] = useState(null);
    const [enrichmentRows, setEnrichmentRows] = useState([]);
    const [selectedRawIds, setSelectedRawIds] = useState([]);
    const [detailEnrichment, setDetailEnrichment] = useState(null);
    const [expandedEnrichId, setExpandedEnrichId] = useState('');
    const [qualificationJob, setQualificationJob] = useState(null);
    const [qualificationRows, setQualificationRows] = useState([]);
    const [selectedEnrichIds, setSelectedEnrichIds] = useState([]);
    const [detailQualification, setDetailQualification] = useState(null);
    const [reviewNote, setReviewNote] = useState('');
    const [businessTypeCorrection, setBusinessTypeCorrection] = useState('');
    const [genuinenessJob, setGenuinenessJob] = useState(null);
    const [genuinenessRows, setGenuinenessRows] = useState([]);
    const [genuinenessCounters, setGenuinenessCounters] = useState(null);
    const [evidenceCompanyId, setEvidenceCompanyId] = useState('');
    const [selectedGenuinenessIds, setSelectedGenuinenessIds] = useState([]);
    const [detailGenuineness, setDetailGenuineness] = useState(null);
    const [genuinenessReviewNote, setGenuinenessReviewNote] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const captureCountRef = useRef(0);
    const lastCapturedPageKeyRef = useRef('');
    const [samePageCaptureLocked, setSamePageCaptureLocked] = useState(false);
    const [autoCollection, setAutoCollection] = useState(null);
    const [showAutoOptions, setShowAutoOptions] = useState(false);
    const [autoCollectionOptions, setAutoCollectionOptions] = useState({
        mode: 'auto',
        collectionMode: 'unlimited',
        pageCollectionMode: 'until_no_more',
        maxPagesPerQuery: 3, maxQueries: 24, delayMinSec: 20, delayMaxSec: 40,
        pagesPerBatch: 10, maxSafetyPagesPerQuery: 30, pauseAfterEachBatch: false,
        stopAtUnique: '', stopOnNoNewUniquePages: false, autoEnrichAfter: false, autoQualifyAfterEnrich: false,
        autoVerifyAfterQualify: false,
        requestedCaptureTarget: 0,
    });
    const [autoProcessing, setAutoProcessing] = useState(null);
    const [liveActivity, setLiveActivity] = useState(null);
    const [liveActivityFilter, setLiveActivityFilter] = useState('all');
    const [liveActivityLimit, setLiveActivityLimit] = useState(50);
    const [liveActivityLoading, setLiveActivityLoading] = useState(false);
    const [showManualStages, setShowManualStages] = useState(false);
    const [autoProcessingOptions, setAutoProcessingOptions] = useState({
        enabled: true,
        batchSize: 10,
        autoEnrich: true,
        autoQualify: true,
        autoVerify: true,
        continueWhileCollecting: true,
        retryTemporaryFailures: true,
        maxRetryAttempts: 2,
    });
    const [showAdminControls, setShowAdminControls] = useState(false);
    const [archiveInfo, setArchiveInfo] = useState(null);
    const [verifiedContactExpand, setVerifiedContactExpand] = useState(''); // `${rowId}:phone|email|whatsapp`
    const [showHowItWorks, setShowHowItWorks] = useState(false);
    const [workflowHash, setWorkflowHash] = useState(() => (typeof window !== 'undefined' ? window.location.hash : ''));
    const [showBtPicker, setShowBtPicker] = useState(false);
    const verifiedSectionRef = useRef(null);
    const lastUpdatedRef = useRef(Date.now());
    const [ownerFullAuto, setOwnerFullAuto] = useState(true);
    const autoBootPendingRef = useRef(false);
    const autoBootInFlightRef = useRef(false);
    const startInFlightRef = useRef(false);
    const stopInFlightRef = useRef(false);
    const bootFullAutomaticProcessRef = useRef(null);
    const lastRowCountRef = useRef(0);
    const pollBusyRef = useRef(false);
    const wasCapturingRef = useRef(false);
    const lastErrorToastRef = useRef({ key: '', at: 0 });
    const boundRunIdRef = useRef(resumeSessionId || '');
    const [campaignActive, setCampaignActive] = useState(true);
    const [runLoadStatus, setRunLoadStatus] = useState(
        resumeSessionId ? RUN_LOAD.LOADING : RUN_LOAD.IDLE,
    );
    const [connectionDegraded, setConnectionDegraded] = useState(false);
    const resultRef = useRef(null);
    const connectionDegradedRef = useRef(false);
    const restoredToastRef = useRef(false);
    const lastSessionLoadKindRef = useRef('');

    const toastErrorOnce = useCallback((key, message) => {
        const msg = String(message || '').trim() || 'Request failed';
        if (lastErrorToastRef.current.key === key) return;
        lastErrorToastRef.current = { key, at: Date.now() };
        toast.error(msg);
    }, []);

    const bindRunId = useCallback((sid) => {
        const id = String(sid || '').trim();
        if (!id || boundRunIdRef.current === id) return;
        boundRunIdRef.current = id;
        const target = PATHS.DATA_EXTRACTOR.RUN(id);
        if (params.sessionId !== id) {
            navigate(target, { replace: true });
        }
    }, [navigate, params.sessionId]);

    const onChange = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const toggleBusinessType = (id) => {
        setForm((f) => ({ ...f, businessTypes: nextSimpleBusinessTypes(f.businessTypes, id) }));
        setQueryPreview(null);
    };

    const buildPreviewPayload = () => {
        const locationScope = inferUiLocationScope(form);
        return {
            product: form.product.trim(),
            relatedKeywords: form.relatedKeywords.trim() || undefined,
            businessTypes: form.businessTypes,
            locationScope,
            city: form.city.trim() || undefined,
            state: form.state.trim() || undefined,
            country: form.country.trim() || undefined,
            searchMarket: form.searchMarket,
            selectedSources: form.selectedSources,
            expandStateSearch: form.expandStateSearch,
            expandCountrySearch: form.expandCountrySearch,
            expandCities: form.expandCities,
            expandStates: form.expandStates,
            worldwide: locationScope === 'worldwide',
        };
    };

    const onGenerateQueries = async () => {
        if (!form.product.trim()) {
            toast.error('Enter Product / Industry');
            return;
        }
        setPreviewBusy(true);
        try {
            const data = await dataExtractorApi.simpleLeadSearchPreviewQueries(buildPreviewPayload());
            setQueryPreview({
                ...data,
                queries: (data.queries || []).map((q) => ({ ...q, enabled: q.enabled !== false })),
            });
            toast.success(`${data.estimatedQueryCount || 0} queries generated`);
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Query preview failed');
        } finally {
            setPreviewBusy(false);
        }
    };

    const togglePreviewQuery = (index) => {
        setQueryPreview((prev) => {
            if (!prev) return prev;
            const list = Array.isArray(prev.queries) ? prev.queries : [];
            const queries = list.map((q, i) => (i === index ? { ...q, enabled: !q.enabled } : q));
            return { ...prev, queries };
        });
    };

    const markPreviewRecommended = (index) => {
        setQueryPreview((prev) => {
            if (!prev) return prev;
            const list = Array.isArray(prev.queries) ? prev.queries : [];
            const queries = list.map((q, i) => ({ ...q, recommended: i === index }));
            return { ...prev, queries, recommendedQuery: queries[index] || null };
        });
    };

    const applyStatusPayload = useCallback((data) => {
        if (!data) return;
        if (data.agentStatus) setAgentStatus(data.agentStatus);
        if (data.session) setSession(data.session);
        if (data.sessionUiLabel) setSessionUiLabel(data.sessionUiLabel);
        if (data.captureStats) setCaptureStats(data.captureStats);
        if (data.campaignProgress) setCampaignProgress(data.campaignProgress);
        if (data.autoCollection !== undefined) setAutoCollection(data.autoCollection);
                lastUpdatedRef.current = Date.now();
        if (data.autoProcessing !== undefined) setAutoProcessing(data.autoProcessing);
        if (data.campaignActive !== undefined) setCampaignActive(Boolean(data.campaignActive));
        if (data.sessionEnded && data.campaignActive === false && data.sessionEndedMessage) {
            const ownerStopped = data.alreadyStopped
                || isOwnerStoppedSearch(data.session, data.autoCollection)
                || isAlreadyStoppedMessage(data.sessionEndedMessage)
                || isOwnerStopCopy(data.sessionEndedMessage);
            if (!ownerStopped) {
                const sid = data.session?._id || '';
                toastErrorOnce(`ended:${sid}`, data.sessionEndedMessage);
            }
        }
        if (data.autoCollectionSessionId) {
            const newSid = data.autoCollectionSessionId;
            setSession((prev) => {
                const base = data.session || prev;
                return base ? { ...base, _id: newSid } : { _id: newSid };
            });
            setResult((prev) => ({
                ...(prev || {}),
                session: {
                    ...((data.session || prev?.session) || {}),
                    _id: newSid,
                },
                ...(data.autoCollectionSelectedQuery
                    ? { selectedQuery: data.autoCollectionSelectedQuery }
                    : {}),
            }));
            bindRunId(newSid);
        }
        if (data.session) {
            const key = pageCaptureKey(data.session);
            if (key && lastCapturedPageKeyRef.current && key !== lastCapturedPageKeyRef.current) {
                setSamePageCaptureLocked(false);
            }
        }
        if (data.ownerErrorMessage) setOwnerErrorMessage(data.ownerErrorMessage);
        else if (data.session?.failMessage) setOwnerErrorMessage(data.session.failMessage);
        else if (data.session && data.session.status !== 'failed') setOwnerErrorMessage('');
        if (Array.isArray(data.recentRawCaptures) && data.recentRawCaptures.length) {
            setRows((prev) => (prev.length >= data.recentRawCaptures.length ? prev : data.recentRawCaptures));
        }
    }, [toastErrorOnce, bindRunId]);

    const refreshAgent = useCallback(async (sessionId) => {
        try {
            const preferred = selectedDeviceId || readLocalDeviceId();
            const params = {
                ...(sessionId ? { sessionId } : {}),
                ...(preferred ? { preferredDeviceId: preferred } : {}),
            };
            const data = await dataExtractorApi.simpleLeadSearchAgentStatus(params);
            const next = data?.agentStatus || data || null;
            setAgentStatus(next);
            if (next?.deviceId && !selectedDeviceId) {
                setSelectedDeviceId(next.deviceId);
                writeLocalDeviceId(next.deviceId);
            }
            if (data?.sessionLabel) setSessionUiLabel(data.sessionLabel);
        } catch {
            setAgentStatus({ connected: false, canStartOnThisDevice: false });
        }
    }, [selectedDeviceId]);

    const refreshSession = useCallback(async (sessionId, opts = {}) => {
        if (!sessionId || (pollBusyRef.current && !opts.ignoreBusy)) return null;
        pollBusyRef.current = true;
        try {
            const data = await dataExtractorApi.simpleLeadSearchSessionStatus(sessionId);
            lastSessionLoadKindRef.current = 'ok';
            applyStatusPayload(data);
            if (connectionDegradedRef.current && !restoredToastRef.current) {
                restoredToastRef.current = true;
                toast.success(RUN_LOAD_MESSAGES.RESTORED);
            }
            connectionDegradedRef.current = false;
            setConnectionDegraded(false);
            if (resumeSessionId) setRunLoadStatus(RUN_LOAD.READY);
            return data;
        } catch (err) {
            if (isConfirmedSessionAbsent(err)) {
                lastSessionLoadKindRef.current = 'absent';
                if (Number(err?.response?.status || 0) === 403) {
                    toast.error('Permission denied: this extraction belongs to another user');
                }
                if (!resultRef.current) {
                    setRunLoadStatus(RUN_LOAD.NOT_FOUND);
                    setSession((prev) => (prev ? {
                        ...prev,
                        status: prev.status && INACTIVE.has(prev.status) ? prev.status : 'expired',
                    } : prev));
                }
            } else {
                lastSessionLoadKindRef.current = isRetryableSessionLoadError(err) ? 'retryable' : 'retryable';
                connectionDegradedRef.current = true;
                setConnectionDegraded(true);
                if (resumeSessionId && !resultRef.current) setRunLoadStatus(RUN_LOAD.RETRYING);
            }
            return null;
        } finally {
            pollBusyRef.current = false;
        }
    }, [applyStatusPayload, resumeSessionId]);

    const refreshResults = useCallback(async (sessionId) => {
        if (!sessionId) return [];
        try {
            const data = await dataExtractorApi.simpleLeadSearchSessionResults(sessionId, { limit: 100 });
            const items = data?.items || [];
            setRows(items);
            return items;
        } catch {
            return [];
        }
    }, []);

    const refreshLiveActivity = useCallback(async (sessionId) => {
        if (!sessionId) return;
        try {
            setLiveActivityLoading(true);
            const data = await dataExtractorApi.simpleLeadSearchLiveActivity(sessionId, {
                limit: liveActivityLimit,
                filter: liveActivityFilter,
            });
            setLiveActivity(data || null);
        } catch {
            /* keep last snapshot */
        } finally {
            setLiveActivityLoading(false);
        }
    }, [liveActivityFilter, liveActivityLimit]);

    // Resume persistent run from dedicated /runs/:sessionId tab (or initialSessionId prop)
    useEffect(() => {
        if (!resumeSessionId) {
            setRunLoadStatus(RUN_LOAD.IDLE);
            return undefined;
        }
        let cancelled = false;
        let timer = 0;
        let attempt = 0;
        if (!resultRef.current) setRunLoadStatus(RUN_LOAD.LOADING);

        const load = async () => {
            if (cancelled) return;
            const data = await refreshSession(resumeSessionId, { ignoreBusy: true });
            if (cancelled) return;
            if (data) {
                const nextResult = {
                    ...(resultRef.current || {}),
                    session: data.session || { _id: resumeSessionId },
                    campaign: data.campaign || resultRef.current?.campaign,
                };
                resultRef.current = nextResult;
                setResult((prev) => ({
                    ...(prev || {}),
                    session: data.session || { _id: resumeSessionId },
                    campaign: data.campaign || prev?.campaign,
                }));
                setSession(data.session || { _id: resumeSessionId });
                if (ownerFullAuto) autoBootPendingRef.current = true;
                const liveSid = data.autoCollectionSessionId || data.session?._id || resumeSessionId;
                bindRunId(liveSid);
                await refreshResults(liveSid);
                return;
            }
            if (lastSessionLoadKindRef.current === 'absent') return;
            const delay = nextSessionLoadRetryMs(attempt);
            attempt += 1;
            timer = window.setTimeout(load, delay);
        };
        load();
        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resumeSessionId]);

    useEffect(() => {
        refreshAgent(session?._id);
        const t = setInterval(() => refreshAgent(session?._id), 5000);
        return () => clearInterval(t);
    }, [refreshAgent, session?._id]);

    useEffect(() => {
        if (!isChinaCountryInput(form.country)) return;
        setForm((f) => {
            const alreadyChina = f.searchMarket === 'china_suppliers'
                && Array.isArray(f.selectedSources)
                && f.selectedSources.includes('baidu')
                && f.selectedSources.includes('1688')
                && f.selectedSources.includes('sogou')
                && f.selectedSources.includes('so360');
            const indiaDefaults = INDIA_DEFAULT_BUSINESS_TYPES.every((bt) => f.businessTypes.includes(bt))
                && f.businessTypes.length === INDIA_DEFAULT_BUSINESS_TYPES.length;
            if (alreadyChina && !indiaDefaults) return f;
            return {
                ...f,
                searchMarket: 'china_suppliers',
                selectedSources: CHINA_DEFAULT_SOURCES,
                ...(indiaDefaults || !alreadyChina ? { businessTypes: CHINA_DEFAULT_BUSINESS_TYPES } : {}),
            };
        });
    }, [form.country]);

    useEffect(() => {
        const apply = () => {
            const hash = String(window.location.hash || '');
            setWorkflowHash(hash);
            const id = hash === '#verified' ? 'de-verified' : (hash === '#live' || hash === '#leads' ? 'de-live-results' : '');
            if (id) {
                window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }
        };
        apply();
        window.addEventListener('hashchange', apply);
        return () => window.removeEventListener('hashchange', apply);
    }, []);

    useEffect(() => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return undefined;
        const keepForAp = shouldKeepPollingForAutoProcessing(autoProcessing, ownerFullAuto);
        const backlog = Number(autoProcessing?.counts?.processingBacklog || 0);
        if (INACTIVE.has(session?.status) && campaignActive === false && backlog <= 0 && !keepForAp) return undefined;
        if (INACTIVE.has(session?.status) && campaignActive === false && backlog <= 0 && autoProcessing?.status !== 'running') return undefined;

        let stopped = false;
        const tick = async () => {
            if (stopped) return;
            const data = await refreshSession(sid);
            const st = data?.session?.status || session?.status;
            const unique = data?.captureStats?.uniqueResultCount ?? 0;
            const acSt = data?.autoCollection?.status || '';
            const autoRefreshing = acSt === 'running' || (typeof acSt === 'string' && acSt.startsWith('paused_'));
            const shouldRefreshResults = st === 'capturing'
                || wasCapturingRef.current
                || unique > lastRowCountRef.current
                || (data?.recentRawCaptures || []).length > lastRowCountRef.current
                || autoRefreshing
                || Number(data?.autoProcessing?.counts?.processingBacklog || 0) > 0;
            const pollSid = data?.autoCollectionSessionId || data?.session?._id || sid;
            if (pollSid && String(pollSid) !== String(sid)) bindRunId(pollSid);

            if (st === 'capturing') wasCapturingRef.current = true;
            if (wasCapturingRef.current && st !== 'capturing') {
                wasCapturingRef.current = false;
                const items = await refreshResults(pollSid);
                lastRowCountRef.current = items.length;
            } else if (shouldRefreshResults) {
                const items = await refreshResults(pollSid);
                lastRowCountRef.current = Math.max(items.length, unique);
            } else if ((data?.recentRawCaptures || []).length) {
                lastRowCountRef.current = data.recentRawCaptures.length;
            }

            const ownerStoppedPoll = isOwnerStoppedSearch(data?.session, data?.autoCollection)
                || st === 'cancelled';
            if (ownerStoppedPoll) autoBootPendingRef.current = false;
            // One-click full auto: start Auto Collection + CP6→CP8 when Google Ready
            if (
                ownerFullAuto
                && autoBootPendingRef.current
                && !autoBootInFlightRef.current
                && !ownerStoppedPoll
                && GOOGLE_READY.has(st)
                && !INACTIVE.has(st)
                && acSt !== 'running'
                && !String(acSt || '').startsWith('paused_')
            ) {
                if (bootFullAutomaticProcessRef.current) {
                    await bootFullAutomaticProcessRef.current(pollSid);
                }
            }
            if (ownerFullAuto && (acSt === 'running' || data?.autoProcessing?.status === 'running')) {
                // stage tables refresh via their own intervals when jobs active; nudge here too
            }
            await refreshLiveActivity(pollSid);
        };
        tick();
        const t = setInterval(tick, 2000);
        return () => {
            stopped = true;
            clearInterval(t);
        };
    }, [session?._id, session?.status, result?.session?._id, refreshSession, refreshResults, refreshLiveActivity, ownerFullAuto, autoProcessing?.status, autoProcessing?.enabled, autoProcessing?.counts?.processingBacklog, campaignActive, bindRunId]);

    useEffect(() => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return undefined;
        refreshLiveActivity(sid);
        return undefined;
    }, [session?._id, result?.session?._id, refreshLiveActivity]);

    useEffect(() => {
        const campaignId = result?.campaign?._id;
        if (!campaignId) {
            setArchiveInfo(null);
            return undefined;
        }
        let cancelled = false;
        dataExtractorApi.simpleLeadSearchCampaignArchive(campaignId)
            .then((data) => { if (!cancelled) setArchiveInfo(data); })
            .catch(() => { /* archive status is optional metadata */ });
        return () => { cancelled = true; };
    }, [result?.campaign?._id]);

    const refreshEnrichment = useCallback(async (sessionId) => {
        if (!sessionId) return;
        try {
            const [jobData, listData] = await Promise.all([
                dataExtractorApi.simpleLeadSearchEnrichmentJob(sessionId),
                dataExtractorApi.simpleLeadSearchEnrichmentList(sessionId),
            ]);
            setEnrichmentJob(jobData?.job || null);
            setEnrichmentRows(listData?.items || []);
        } catch {
            /* soft */
        }
    }, []);

    useEffect(() => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return undefined;
        refreshEnrichment(sid);
        const t = setInterval(() => {
            if (enrichmentJob?.status === 'processing' || enrichmentJob?.status === 'queued') {
                refreshEnrichment(sid);
            }
        }, 2500);
        return () => clearInterval(t);
    }, [session?._id, result?.session?._id, enrichmentJob?.status, refreshEnrichment]);

    const refreshQualification = useCallback(async (sessionId) => {
        if (!sessionId) return;
        try {
            const [jobData, listData] = await Promise.all([
                dataExtractorApi.simpleLeadSearchQualificationJob(sessionId),
                dataExtractorApi.simpleLeadSearchQualificationList(sessionId),
            ]);
            setQualificationJob(jobData?.job || null);
            setQualificationRows(listData?.items || []);
        } catch {
            /* soft */
        }
    }, []);

    useEffect(() => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return undefined;
        refreshQualification(sid);
        const t = setInterval(() => {
            if (qualificationJob?.status === 'processing' || qualificationJob?.status === 'queued') {
                refreshQualification(sid);
            }
        }, 2500);
        return () => clearInterval(t);
    }, [session?._id, result?.session?._id, qualificationJob?.status, refreshQualification]);

    const refreshGenuineness = useCallback(async (sessionId) => {
        if (!sessionId) return;
        try {
            const [jobData, listData] = await Promise.all([
                dataExtractorApi.simpleLeadSearchGenuinenessJob(sessionId),
                dataExtractorApi.simpleLeadSearchGenuinenessList(sessionId),
            ]);
            setGenuinenessJob(jobData?.job || null);
            setGenuinenessRows(listData?.items || []);
            setGenuinenessCounters(listData?.counters || null);
        } catch {
            /* soft */
        }
    }, []);

    useEffect(() => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return undefined;
        refreshGenuineness(sid);
        const t = setInterval(() => {
            if (genuinenessJob?.status === 'processing' || genuinenessJob?.status === 'queued') {
                refreshGenuineness(sid);
            }
        }, 2500);
        return () => clearInterval(t);
    }, [session?._id, result?.session?._id, genuinenessJob?.status, refreshGenuineness]);

    resultRef.current = result;
    const isRunRoute = Boolean(runMode && resumeSessionId);
    const hideStartExtraction = shouldHideStartExtraction({
        isRunRoute,
        runLoadStatus,
        hasResult: Boolean(result),
    });

    const onSearch = async (e) => {
        e.preventDefault();
        if (busy || startInFlightRef.current) return;
        if (hideStartExtraction) return;
        if (agentStatus && agentStatus.canStartOnThisDevice === false) {
            toast.error(agentStatus.startBlockedReason || 'Discovery Agent is not connected on this computer. Start the Discovery Agent on this PC to begin extraction.');
            return;
        }
        if (!form.product.trim()) {
            toast.error('Enter Product / Industry');
            return;
        }
        const acStatus = autoCollection?.status || '';
        if (acStatus === 'running' || acStatus === 'paused' || acStatus === 'paused_owner' || acStatus === 'paused_manual' || acStatus === 'paused_batch') {
            const ok = window.confirm(
                'A new search will stop the current Auto Collection. Completed captures remain saved. Continue?',
            );
            if (!ok) return;
        }
        startInFlightRef.current = true;
        setBusy('start');
        setCaptureCompletedFlash(false);
        setSamePageCaptureLocked(false);
        lastCapturedPageKeyRef.current = '';
        try {
            const enabledQueryTexts = (queryPreview?.queries || [])
                .filter((q) => q.enabled !== false)
                .map((q) => q.queryText);
            const locationScope = inferUiLocationScope(form);
            const data = await dataExtractorApi.simpleLeadSearchStart({
                product: form.product.trim(),
                relatedKeywords: form.relatedKeywords.trim() || undefined,
                businessTypes: form.businessTypes,
                locationScope,
                city: form.city.trim() || undefined,
                state: form.state.trim() || undefined,
                country: form.country.trim() || undefined,
                searchMarket: form.searchMarket,
                selectedSources: form.selectedSources,
                expandStateSearch: form.expandStateSearch,
                expandCountrySearch: form.expandCountrySearch,
                expandCities: form.expandCities,
                expandStates: form.expandStates,
                worldwide: locationScope === 'worldwide',
                enabledQueryTexts: enabledQueryTexts.length ? enabledQueryTexts : undefined,
                financialYear: selectedFY,
                idempotencyKey: `sls-ui-${Date.now()}`,
                preferredDeviceId: selectedDeviceId || readLocalDeviceId() || undefined,
            });
            const sid = data?.session?._id;
            if (!sid) {
                throw new Error('Start API failed: session was not created');
            }
            const sourceKey = String(data.session?.source || data.selectedQuery?.sourcePlatform || 'google').toLowerCase();
            const sourceLabel = sourceKey.includes('baidu') ? 'Baidu' : (sourceKey.includes('1688') ? '1688' : 'Google');
            const launchUrl = String(data.session?.searchUrl || '').trim();
            setResult(data);
            setSession(data.session || null);
            lastErrorToastRef.current = { key: '', at: 0 };
            bindRunId(sid);
            if (!launchUrl || launchUrl === 'about:blank') {
                toast.error(`Source launch failed: ${sourceLabel} — Source URL unavailable`);
                return;
            }
            setCaptureStats(null);
            setAutoCollection(null);
            setAutoProcessing(null);
            setSessionUiLabel(data.agentStatus?.sessionLabel || `Opening ${sourceLabel}`);
            captureCountRef.current = 0;
            lastRowCountRef.current = 0;
            wasCapturingRef.current = false;
            setRows([]);
            if (data?.agentStatus) setAgentStatus(data.agentStatus);
            if (ownerFullAuto) {
                autoBootPendingRef.current = true;
                setAutoCollectionOptions((o) => ({ ...o, mode: 'auto' }));
                setAutoProcessingOptions((o) => ({
                    ...o,
                    enabled: true,
                    autoEnrich: true,
                    autoQualify: true,
                    autoVerify: true,
                    continueWhileCollecting: true,
                    retryTemporaryFailures: true,
                    maxRetryAttempts: 2,
                    batchSize: Number(o.batchSize || 10),
                }));
            } else {
                autoBootPendingRef.current = false;
            }
            const agentOnline = data?.agentStatus?.online !== false
                && data?.agentStatus?.agentOnline !== false
                && data?.agentStatus?.connected !== false;
            if (!agentOnline) {
                toast('Waiting for discovery service');
            } else {
                toast.success(
                    `Started ${sourceLabel}. Discovery Agent opens the search in its browser. This CRM page is the run.`,
                );
            }
            if (data.autoCollectionStoppedWarning) {
                toast.warning(data.autoCollectionStoppedWarning);
            }
        } catch (err) {
            if (isBrowserRequestTimeout(err)) {
                toast(BROWSER_REQUEST_TIMEOUT_MESSAGE);
                const existingSid = session?._id || result?.session?._id;
                try {
                    if (existingSid) {
                        await refreshSession(existingSid);
                    } else {
                        const runs = await dataExtractorApi.simpleLeadSearchListRuns({ limit: 5 });
                        const latest = (runs?.active || [])[0] || (runs?.recent || [])[0];
                        const recovered = latest?.sessionId || latest?.runId;
                        if (recovered) {
                            bindRunId(recovered);
                            await refreshSession(recovered);
                        }
                    }
                } catch {
                    /* status poll continues */
                }
            } else {
                toast.error(ownerFacingSearchError(err, 'Source launch failed: Start API failed'));
            }
        } finally {
            startInFlightRef.current = false;
            setBusy('');
        }
    };

    const goCleanWorkspace = useCallback(() => {
        setStartNewPrompt(false);
        setResult(null);
        resultRef.current = null;
        setSession(null);
        setRows([]);
        setCaptureStats(null);
        setSessionUiLabel('');
        setCaptureCompletedFlash(false);
        captureCountRef.current = 0;
        lastRowCountRef.current = 0;
        wasCapturingRef.current = false;
        setAutoCollectionOptions((o) => ({ ...o, ...collectionModeResetPatch() }));
        if (resumeSessionId || runMode) {
            navigate(PATHS.DATA_EXTRACTOR.SIMPLE_LEAD_SEARCH, { replace: true });
        }
    }, [navigate, resumeSessionId, runMode, setAutoCollectionOptions]);

    const onStartNew = () => {
        if (hideStartExtraction) return;
        const live = isLiveRunStatus({
            status: session?.status || result?.session?.status,
            autoCollectionStatus: session?.autoCollection?.status || result?.autoCollection?.status,
            autoProcessingStatus: session?.autoProcessing?.status || result?.autoProcessing?.status,
        });
        const decision = resolveStartNewDecision({
            hasOpenRun: Boolean(resumeSessionId || session || result),
            runIsLive: live,
        });
        if (decision === 'CONFIRM_LIVE') {
            setStartNewPrompt(true);
            return;
        }
        goCleanWorkspace();
    };

    const pauseAndStartNew = async () => {
        const sid = session?._id || result?.session?._id || resumeSessionId;
        setStartNewPrompt(false);
        if (sid) {
            try {
                await dataExtractorApi.simpleLeadSearchAutoCollectionPause(sid);
            } catch {
                /* workspace still resets; backend blocks a second live start if pause failed */
            }
        }
        goCleanWorkspace();
    };

    const waitForCaptureSettle = async (sessionId, baselineUnique) => {
        for (let i = 0; i < 20; i += 1) {
            await new Promise((r) => setTimeout(r, 1000));
            const data = await refreshSession(sessionId);
            const items = await refreshResults(sessionId);
            const unique = data?.captureStats?.uniqueResultCount ?? items.length;
            const pending = data?.pending;
            const capturing = data?.session?.status === 'capturing';
            if (!pending && !capturing && (unique > baselineUnique || items.length > baselineUnique || GOOGLE_READY.has(data?.session?.status))) {
                if (unique > baselineUnique || items.length > 0) return { data, items };
            }
            if (INACTIVE.has(data?.session?.status)) return { data, items };
        }
        const data = await refreshSession(sessionId);
        const items = await refreshResults(sessionId);
        return { data, items };
    };

    
    const onOpenNextPage = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('nextPage');
        setCaptureCompletedFlash(false);
        try {
            const data = await dataExtractorApi.simpleLeadSearchOpenNextPage(sid);
            if (data?.session) setSession(data.session);
            if (data?.campaignProgress) setCampaignProgress(data.campaignProgress);
            setSamePageCaptureLocked(false);
            lastCapturedPageKeyRef.current = '';
            toast.success(data?.message || 'Opening next Google page');
            await refreshSession(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onOpenNextQuery = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('nextQuery');
        setCaptureCompletedFlash(false);
        try {
            const data = await dataExtractorApi.simpleLeadSearchOpenNextQuery(sid);
            if (data?.session) {
                setSession(data.session);
                setResult((prev) => ({
                    ...(prev || {}),
                    session: data.session,
                    selectedQuery: data.selectedQuery || prev?.selectedQuery,
                    campaign: data.campaign || prev?.campaign,
                    queries: data.campaignProgress?.queries?.map((q) => ({
                        id: q.id,
                        queryText: q.queryText,
                        status: q.status,
                        slsCaptureStatus: q.slsCaptureStatus,
                        recommended: q.isCurrent,
                    })) || prev?.queries,
                }));
            }
            if (data?.campaignProgress) setCampaignProgress(data.campaignProgress);
            setSamePageCaptureLocked(false);
            lastCapturedPageKeyRef.current = '';
            toast.success(data?.message || 'Opening next generated query');
            const newSid = data?.session?._id;
            if (newSid) {
                await refreshAgent(newSid);
                await refreshSession(newSid);
                await refreshResults(newSid);
            }
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onSkipQuery = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('skipQuery');
        try {
            const data = await dataExtractorApi.simpleLeadSearchSkipQuery(sid);
            if (data?.campaignProgress) setCampaignProgress(data.campaignProgress);
            toast.success(data?.message || 'Query skipped');
            await refreshSession(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onMarkQueryComplete = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('completeQuery');
        try {
            const data = await dataExtractorApi.simpleLeadSearchCompleteQuery(sid);
            if (data?.campaignProgress) setCampaignProgress(data.campaignProgress);
            toast.success(data?.message || 'Query marked complete');
            await refreshSession(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };



    const pipeActive = autoProcessing?.enabled && ['running', 'paused_owner'].includes(autoProcessing?.status);
    const pipeRunning = autoProcessing?.status === 'running';
    const pipePaused = autoProcessing?.status === 'paused_owner';

    const onEnableCompleteAutomaticProcessing = () => {
        setAutoProcessingOptions((o) => ({
            ...o,
            enabled: true,
            batchSize: o.batchSize || 10,
            autoEnrich: true,
            autoQualify: true,
            autoVerify: true,
            continueWhileCollecting: true,
            retryTemporaryFailures: true,
            maxRetryAttempts: 2,
        }));
        toast.success('Complete Automatic Processing enabled (Capture → Enrich → Qualify → Verify). CRM Lead creation stays OFF.');
    };

    const onEnableAutoProcessing = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('pipeEnable');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoProcessingEnable(sid, {
                batchSize: Number(autoProcessingOptions.batchSize) || 10,
                autoEnrich: !!autoProcessingOptions.autoEnrich,
                autoQualify: !!autoProcessingOptions.autoQualify,
                autoVerify: !!autoProcessingOptions.autoVerify,
                continueWhileCollecting: !!autoProcessingOptions.continueWhileCollecting,
                retryTemporaryFailures: !!autoProcessingOptions.retryTemporaryFailures,
                maxRetryAttempts: Number(autoProcessingOptions.maxRetryAttempts) || 2,
            });
            setAutoProcessing(data.autoProcessing || null);
            setAutoProcessingOptions((o) => ({ ...o, enabled: true }));
            toast.success('Automatic Processing After Capture is ON');
            await refreshSession(sid);
            refreshEnrichment(sid);
            refreshQualification(sid);
            refreshGenuineness(sid);
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Failed to enable automatic processing');
        } finally {
            setBusy('');
        }
    };

    const onPauseAutoProcessing = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('pipePause');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoProcessingPause(sid);
            setAutoProcessing(data.autoProcessing || null);
            toast.success('Automatic processing paused');
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Pause failed');
        } finally {
            setBusy('');
        }
    };

    const onResumeAutoProcessing = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('pipeResume');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoProcessingResume(sid);
            setAutoProcessing(data.autoProcessing || null);
            toast.success('Automatic processing resumed');
            await refreshSession(sid);
        } catch (err) {
            if (isBrowserRequestTimeout(err)) {
                toast(BROWSER_REQUEST_TIMEOUT_MESSAGE);
                try { await refreshSession(sid); } catch { /* poll continues */ }
            } else {
                toast.error(err?.response?.data?.message || err?.message || 'Resume failed');
            }
        } finally {
            setBusy('');
        }
    };

    const onStopAutoProcessing = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        if (stopInFlightRef.current) return;
        const apStopped = autoProcessing?.status === 'stopped' && autoProcessing?.enabled === false;
        if (apStopped && isOwnerStoppedSearch(session || result?.session, autoCollection)) {
            toast.success(allProcessingAlreadyStoppedMessage());
            return;
        }
        stopInFlightRef.current = true;
        setBusy('pipeStop');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoProcessingStop(sid, { stopJobs: true });
            setAutoProcessing(data.autoProcessing || null);
            setAutoProcessingOptions((o) => ({ ...o, enabled: false }));
            toast.success(data?.alreadyStopped
                ? allProcessingAlreadyStoppedMessage()
                : 'Automatic processing stopped. Completed work is preserved.');
        } catch (err) {
            const msg = err?.response?.data?.message || err?.message || '';
            if (isAlreadyStoppedMessage(msg)) {
                toast.success(allProcessingAlreadyStoppedMessage());
            } else {
                toast.error(msg || 'Stop failed');
            }
        } finally {
            stopInFlightRef.current = false;
            setBusy('');
        }
    };


    const bootFullAutomaticProcess = useCallback(async (sessionId) => {
        if (!sessionId || autoBootInFlightRef.current) return false;
        autoBootInFlightRef.current = true;
        try {
            const acBody = {
                ...collectionModeStartPayload(autoCollectionOptions),
                pageCollectionMode: autoCollectionOptions.pageCollectionMode || 'until_no_more',
                maxPagesPerQuery: Number(autoCollectionOptions.maxPagesPerQuery) || 3,
                pagesPerBatch: Number(autoCollectionOptions.pagesPerBatch) || 10,
                maxSafetyPagesPerQuery: Number(autoCollectionOptions.maxSafetyPagesPerQuery) || 30,
                pauseAfterEachBatch: false,
                maxQueries: Math.max(
                    Number(autoCollectionOptions.maxQueries) || 24,
                    Number(campaignProgress?.queryTotal) || 0,
                ) || 24,
                delayMinSec: Number(autoCollectionOptions.delayMinSec) || 20,
                delayMaxSec: Number(autoCollectionOptions.delayMaxSec) || 40,
                stopAtUnique: 0,
                stopOnNoNewUniquePages: false,
                autoEnrichAfter: false,
                autoQualifyAfterEnrich: false,
                autoVerifyAfterQualify: false,
            };
            const acData = await dataExtractorApi.simpleLeadSearchAutoCollectionStart(sessionId, acBody);
            applyStatusPayload(acData);
            if (acData?.autoCollection) setAutoCollection(acData.autoCollection);
            const pipeSid = acData?.session?._id || sessionId;
            try {
                const pipe = await dataExtractorApi.simpleLeadSearchAutoProcessingEnable(pipeSid, {
                    batchSize: Number(autoProcessingOptions.batchSize) || 10,
                    autoEnrich: true,
                    autoQualify: true,
                    autoVerify: true,
                    continueWhileCollecting: true,
                    retryTemporaryFailures: true,
                    maxRetryAttempts: Number(autoProcessingOptions.maxRetryAttempts) || 2,
                });
                setAutoProcessing(pipe.autoProcessing || null);
                setAutoProcessingOptions((o) => ({ ...o, enabled: true }));
            } catch (pipeErr) {
                toast.error(pipeErr?.response?.data?.message || pipeErr?.message || 'Auto Collection started; automatic processing enable failed');
            }
            autoBootPendingRef.current = false;
            setAutoCollectionOptions((o) => ({ ...o, ...collectionModeResetPatch() }));
            toast.success('Automatic Process running — collect → enrich → qualify → verify');
            await refreshSession(pipeSid);
            refreshEnrichment(pipeSid);
            refreshQualification(pipeSid);
            refreshGenuineness(pipeSid);
            return true;
        } catch (err) {
            if (isBrowserRequestTimeout(err)) {
                toast(BROWSER_REQUEST_TIMEOUT_MESSAGE);
                try {
                    const data = await refreshSession(sessionId);
                    const acSt = data?.autoCollection?.status || '';
                    if (acSt === 'running' || String(acSt).startsWith('paused_')) {
                        autoBootPendingRef.current = false;
                        return true;
                    }
                } catch {
                    /* poll continues */
                }
                return false;
            }
            const msg = softSessionError(err) || 'Could not start automatic process yet — waiting for Google Ready';
            toastErrorOnce(`boot:${sessionId}:${msg.slice(0, 120)}`, msg);
            if (err?.response?.status === 400 && (/campaign validation failed/i.test(msg) || /session ended/i.test(msg))) {
                autoBootPendingRef.current = false;
            }
            return false;
        } finally {
            autoBootInFlightRef.current = false;
        }
    }, [autoCollectionOptions, autoProcessingOptions, applyStatusPayload, refreshSession, refreshEnrichment, refreshQualification, refreshGenuineness, campaignProgress?.queryTotal, toastErrorOnce]);
    bootFullAutomaticProcessRef.current = bootFullAutomaticProcess;

    const onPauseAutomaticProcess = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('autoPause');
        try {
            if (autoRunning) {
                const data = await dataExtractorApi.simpleLeadSearchAutoCollectionPause(sid);
                applyStatusPayload(data);
                if (data?.autoCollection) setAutoCollection(data.autoCollection);
            }
            if (pipeRunning) {
                const pipe = await dataExtractorApi.simpleLeadSearchAutoProcessingPause(sid);
                setAutoProcessing(pipe.autoProcessing || null);
            }
            toast.success('Automatic Process paused');
            await refreshSession(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onResumeAutomaticProcess = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('autoResume');
        try {
            if (autoPausedOwner || autoCollection?.status === 'paused_owner'
                || isWaitingForDiscoveryAgent(autoCollection) || isLongAgentOfflinePause(autoCollection)) {
                const data = await dataExtractorApi.simpleLeadSearchAutoCollectionResume(sid);
                applyStatusPayload(data);
                if (data?.autoCollection) setAutoCollection(data.autoCollection);
            }
            if (pipePaused || autoProcessing?.status === 'paused_owner') {
                const pipe = await dataExtractorApi.simpleLeadSearchAutoProcessingResume(sid);
                setAutoProcessing(pipe.autoProcessing || null);
            }
            toast.success('Automatic Process resumed');
            await refreshSession(sid);
        } catch (err) {
            if (isBrowserRequestTimeout(err)) {
                toast(BROWSER_REQUEST_TIMEOUT_MESSAGE);
                try { await refreshSession(sid); } catch { /* poll continues */ }
            } else {
                toast.error(softSessionError(err));
            }
        } finally {
            setBusy('');
        }
    };

    const onContinueAutomaticProcess = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('autoContinue');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionContinue(sid);
            applyStatusPayload(data);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            if (autoProcessing?.enabled && autoProcessing?.status !== 'running') {
                try {
                    const pipe = await dataExtractorApi.simpleLeadSearchAutoProcessingResume(sid);
                    setAutoProcessing(pipe.autoProcessing || null);
                } catch { /* soft */ }
            }
            toast.success('Continuing Automatic Process');
            await refreshSession(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onArchiveCampaignToS3 = async () => {
        const campaignId = result?.campaign?._id;
        if (!campaignId) return;
        setBusy('archiveS3');
        try {
            const data = await dataExtractorApi.simpleLeadSearchArchiveCampaign(campaignId, {
                ownerApproved: ownerStoppedUi,
            });
            setArchiveInfo(data);
            toast.success(data?.archiveStatus === 'VERIFIED'
                ? 'Campaign archive copied to S3 and verified. Mongo data was not deleted.'
                : 'Archive finished');
        } catch (err) {
            toast.error(err?.response?.data?.message || err?.message || 'Archive failed. Mongo data was not deleted.');
            try {
                const status = await dataExtractorApi.simpleLeadSearchCampaignArchive(campaignId);
                setArchiveInfo(status);
            } catch { /* keep last */ }
        } finally {
            setBusy('');
        }
    };

    const onStopAllProcessing = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        if (stopInFlightRef.current) return;
        if (isOwnerStoppedSearch(session || result?.session, autoCollection)
            && autoProcessing?.status === 'stopped') {
            toast.success(allProcessingAlreadyStoppedMessage());
            return;
        }
        stopInFlightRef.current = true;
        setBusy('pipeStop');
        autoBootPendingRef.current = false;
        try {
            const data = await dataExtractorApi.simpleLeadSearchStop(sid);
            applyStatusPayload(data);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            toast.success(data?.alreadyStopped
                ? allProcessingAlreadyStoppedMessage()
                : 'Search stopped successfully. Collected results have been preserved.');
            await refreshSession(sid);
            await refreshResults(sid);
        } catch (err) {
            const msg = softSessionError(err);
            if (isAlreadyStoppedMessage(msg)) {
                toast.success(allProcessingAlreadyStoppedMessage());
            } else {
                toast.error(msg);
            }
        } finally {
            stopInFlightRef.current = false;
            setBusy('');
        }
    };

    const onStartAutoCollection = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) {
            toast.error('Start a search first');
            return;
        }
        setBusy('autoStart');
        try {
            const body = {
                ...collectionModeStartPayload(autoCollectionOptions),
                pageCollectionMode: autoCollectionOptions.pageCollectionMode || 'until_no_more',
                maxPagesPerQuery: Number(autoCollectionOptions.maxPagesPerQuery) || 3,
                pagesPerBatch: Number(autoCollectionOptions.pagesPerBatch) || 10,
                maxSafetyPagesPerQuery: Number(autoCollectionOptions.maxSafetyPagesPerQuery) || 30,
                pauseAfterEachBatch: !!autoCollectionOptions.pauseAfterEachBatch,
                maxQueries: Number(autoCollectionOptions.maxQueries) || 3,
                delayMinSec: Number(autoCollectionOptions.delayMinSec) || 20,
                delayMaxSec: Number(autoCollectionOptions.delayMaxSec) || 40,
                stopAtUnique: 0,
                stopOnNoNewUniquePages: false,
                autoEnrichAfter: !!autoCollectionOptions.autoEnrichAfter,
                autoQualifyAfterEnrich: !!autoCollectionOptions.autoQualifyAfterEnrich,
                autoVerifyAfterQualify: !!autoCollectionOptions.autoVerifyAfterQualify,
            };
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionStart(sid, body);
            applyStatusPayload(data);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            setAutoCollectionOptions((o) => ({ ...o, ...collectionModeResetPatch() }));
            toast.success(data?.message || 'Auto Collection started');
            await refreshSession(data?.session?._id || sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onPauseAutoCollection = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('autoPause');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionPause(sid);
            applyStatusPayload(data);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            toast.success(data?.message || 'Auto Collection paused');
            await refreshSession(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onResumeAutoCollection = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('autoResume');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionResume(sid);
            applyStatusPayload(data);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            toast.success(data?.message || 'Auto Collection resumed');
            await refreshSession(sid);
        } catch (err) {
            if (isBrowserRequestTimeout(err)) {
                toast(BROWSER_REQUEST_TIMEOUT_MESSAGE);
                try { await refreshSession(sid); } catch { /* poll continues */ }
            } else {
                toast.error(softSessionError(err));
            }
        } finally {
            setBusy('');
        }
    };

    const onStopAutoCollection = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        if (stopInFlightRef.current) return;
        if (isOwnerStoppedSearch(session || result?.session, autoCollection)) {
            toast.success(alreadyStoppedUserMessage());
            return;
        }
        stopInFlightRef.current = true;
        setBusy('autoStop');
        autoBootPendingRef.current = false;
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionStop(sid);
            applyStatusPayload(data);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            toast.success(data?.alreadyStopped
                ? alreadyStoppedUserMessage()
                : searchStoppedSuccessMessage());
            await refreshSession(sid);
            await refreshResults(sid);
        } catch (err) {
            const msg = softSessionError(err);
            if (isAlreadyStoppedMessage(msg)) {
                toast.success(alreadyStoppedUserMessage());
            } else {
                toast.error(msg);
            }
        } finally {
            stopInFlightRef.current = false;
            setBusy('');
        }
    };

    const onContinueAutoCollection = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('autoContinue');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionContinue(sid);
            applyStatusPayload(data);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            toast.success(data?.message || 'Continuing Auto Collection');
            await refreshSession(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };


    const onContinueNextBatch = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('autoBatch');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionContinueBatch(sid);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            if (data?.session) setSession(data.session);
            if (data?.campaignProgress) setCampaignProgress(data.campaignProgress);
            toast.success(data?.message || 'Continuing next page batch');
            await refreshSession(sid);
            await refreshResults(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onResumeCheckpoint = async (restartQuery = false) => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        if (restartQuery) {
            const ok = window.confirm('Restart current query from Google page 1? Captured records stay saved, but page progress for this query resets.');
            if (!ok) return;
        }
        setBusy('autoResumeCp');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionResumeCheckpoint(sid, { restartQuery });
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            if (data?.session) setSession(data.session);
            toast.success(data?.message || 'Resumed Auto Collection');
            await refreshSession(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onAutoNextQuery = async () => {
        const sid = session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('autoNextQ');
        try {
            const data = await dataExtractorApi.simpleLeadSearchAutoCollectionNextQuery(sid);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            if (data?.session) setSession(data.session);
            if (data?.sessionId) {
                setSession((prev) => ({ ...(data.session || prev || {}), _id: data.sessionId }));
                setResult((prev) => ({
                    ...(prev || {}),
                    session: { ...(data.session || prev?.session || {}), _id: data.sessionId },
                    ...(data.selectedQuery ? { selectedQuery: data.selectedQuery } : {}),
                }));
            }
            if (data?.campaignProgress) setCampaignProgress(data.campaignProgress);
            toast.success(data?.message || 'Opening next generated query');
            const nextSid = data?.sessionId || sid;
            await refreshSession(nextSid);
            await refreshResults(nextSid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onCapture = async () => {
        const activeSession = session || result?.session;
        if (!activeSession?._id || !result?.campaign?._id || !result?.selectedQuery?.id) {
            toast.error('Start a search first');
            return;
        }
        if (INACTIVE.has(activeSession.status)) {
            if (campaignActive) return;
            toastErrorOnce(`ended:${activeSession._id}`, 'Session ended. Start a new search.');
            return;
        }
        setBusy('capture');
        setCaptureCompletedFlash(false);
        try {
            captureCountRef.current += 1;
            const baseline = captureStats?.uniqueResultCount ?? rows.length;
            await dataExtractorApi.requestAssistedCapture({
                campaignId: result.campaign._id,
                queryId: result.selectedQuery.id,
                sessionId: activeSession._id,
                idempotencyKey: `sls-cap-${activeSession._id}-${captureCountRef.current}-${Date.now()}`,
            });
            toast.success(captureCountRef.current === 1 ? 'Capturing visible results...' : 'Capture again requested...');
            wasCapturingRef.current = true;
            const settled = await waitForCaptureSettle(activeSession._id, baseline);
            lastRowCountRef.current = settled.items.length;
            const n = settled.items.length;
            setCaptureCompletedFlash(true);
            lastCapturedPageKeyRef.current = pageCaptureKey(activeSession || session || result?.session);
            setSamePageCaptureLocked(true);
            toast.success(n ? `Capture Completed (${n} unique in table)` : 'Capture Completed - no new organic rows');
        } catch (err) {
            toast.error(softSessionError(err));
            await refreshSession(activeSession._id);
        } finally {
            setBusy('');
        }
    };

    const onContinueAfterManual = async () => {
        const activeSession = session || result?.session;
        if (!activeSession?._id) return;
        setBusy('continue');
        try {
            const data = await dataExtractorApi.simpleLeadSearchContinueAfterManual(activeSession._id);
            applyStatusPayload(data);
            toast.success('Continuing after manual action');
            await refreshSession(activeSession._id);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onStop = async () => {
        const activeSession = session || result?.session;
        if (!activeSession?._id) return;
        if (stopInFlightRef.current) return;
        if (isOwnerStoppedSearch(activeSession, autoCollection)) {
            toast.success(alreadyStoppedUserMessage());
            return;
        }
        stopInFlightRef.current = true;
        setBusy('stop');
        setCaptureCompletedFlash(false);
        autoBootPendingRef.current = false;
        setAutoCollection((prev) => ({
            ...(prev || {}),
            status: 'stopped',
            discoveryStatus: 'stopped',
            stopRequested: true,
            ownerStoppedAt: prev?.ownerStoppedAt || new Date().toISOString(),
        }));
        setSession((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
        try {
            const data = await dataExtractorApi.simpleLeadSearchStop(activeSession._id);
            applyStatusPayload(data);
            if (data?.autoCollection) setAutoCollection(data.autoCollection);
            toast.success(data?.alreadyStopped
                ? alreadyStoppedUserMessage()
                : searchStoppedSuccessMessage());
            await refreshSession(activeSession._id);
            await refreshResults(activeSession._id);
            refreshEnrichment(activeSession._id);
            refreshQualification(activeSession._id);
            refreshGenuineness(activeSession._id);
        } catch (err) {
            const msg = softSessionError(err);
            if (isAlreadyStoppedMessage(msg)) {
                toast.success(alreadyStoppedUserMessage());
            } else {
                toast.error(msg);
            }
        } finally {
            stopInFlightRef.current = false;
            setBusy('');
        }
    };

    const onStopAndExport = async () => {
        const activeSession = session || result?.session;
        if (!activeSession?._id) return;
        setBusy('stopExport');
        setCaptureCompletedFlash(false);
        try {
            const response = await dataExtractorApi.simpleLeadSearchStopAndExport(activeSession._id);
            downloadBlobFromAxios(response, `simple-lead-search-${activeSession._id}.xlsx`);
            toast.success('Stopped and exported current results');
            await refreshSession(activeSession._id);
            await refreshResults(activeSession._id);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onComplete = async () => {
        const activeSession = session || result?.session;
        if (!activeSession?._id) return;
        setBusy('complete');
        try {
            const data = await dataExtractorApi.simpleLeadSearchComplete(activeSession._id);
            applyStatusPayload(data);
            setCaptureCompletedFlash(false);
            toast.success('Session completed');
            await refreshSession(activeSession._id);
            await refreshResults(activeSession._id);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onExportCurrent = async () => {
        const activeSession = session || result?.session;
        if (!activeSession?._id) return;
        setBusy('export');
        try {
            const response = await dataExtractorApi.simpleLeadSearchExport(activeSession._id);
            downloadBlobFromAxios(response, `simple-lead-search-${activeSession._id}.xlsx`);
            toast.success('Exported current results (Unverified / Stage A preliminary)');
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };


    const onEnrichAll = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('enrich');
        try {
            const data = await dataExtractorApi.simpleLeadSearchEnrichmentStart(sid, { mode: 'all_unverified' });
            setEnrichmentJob(data?.job || null);
            toast.success(data?.alreadyRunning ? 'Enrichment already running' : 'Enrichment started');
            await refreshEnrichment(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onEnrichSelected = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !selectedRawIds.length) {
            toast.error('Select one or more captured results first');
            return;
        }
        setBusy('enrich');
        try {
            const data = await dataExtractorApi.simpleLeadSearchEnrichmentStart(sid, {
                mode: 'selected',
                rawCaptureIds: selectedRawIds,
            });
            setEnrichmentJob(data?.job || null);
            toast.success('Enrichment started for selected');
            await refreshEnrichment(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onEnrichRetry = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('enrich');
        try {
            const data = await dataExtractorApi.simpleLeadSearchEnrichmentStart(sid, { mode: 'retry_failed' });
            setEnrichmentJob(data?.job || null);
            toast.success('Retrying failed enrichments');
            await refreshEnrichment(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onStopEnrichment = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('enrichStop');
        try {
            await dataExtractorApi.simpleLeadSearchEnrichmentStop(sid);
            toast.success('Stop enrichment requested');
            await refreshEnrichment(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onExportEnriched = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('enrichExport');
        try {
            const response = await dataExtractorApi.simpleLeadSearchEnrichmentExport(sid);
            downloadBlobFromAxios(response, `enriched-${sid}.xlsx`);
            toast.success('Enriched Excel downloaded');
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onOpenEnrichDetail = async (enrichmentId) => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !enrichmentId) return;
        try {
            const data = await dataExtractorApi.simpleLeadSearchEnrichmentDetail(sid, enrichmentId);
            setDetailEnrichment(data);
        } catch (err) {
            toast.error(softSessionError(err));
        }
    };

    const onReviewEnrichment = async (enrichmentId, reviewStatus) => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !enrichmentId) return;
        try {
            await dataExtractorApi.simpleLeadSearchEnrichmentReview(sid, enrichmentId, { reviewStatus });
            toast.success(`Marked ${reviewStatus}`);
            await refreshEnrichment(sid);
            if (detailEnrichment?.enrichment?._id === enrichmentId) {
                await onOpenEnrichDetail(enrichmentId);
            }
        } catch (err) {
            toast.error(softSessionError(err));
        }
    };

    
    const decisionBadge = (decision) => {
        const map = {
            strong_match: { label: 'Strong Match', bg: '#166534' },
            possible_match: { label: 'Possible Match', bg: '#a16207' },
            rejected: { label: 'Rejected', bg: '#b91c1c' },
            human_review_required: { label: 'Review Required', bg: '#7c3aed' },
        };
        const m = map[decision] || { label: decision || '-', bg: '#64748b' };
        return (
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: m.bg, color: '#fff', fontSize: 11, fontWeight: 600 }}>
                {m.label}
            </span>
        );
    };

    const genuinenessBadge = (decision) => {
        const map = {
            verified_genuine: { label: 'Verified Genuine', bg: '#15803d' },
            likely_genuine: { label: 'Likely Genuine', bg: '#0f766e' },
            human_review_required: { label: 'Review Required', bg: '#7c3aed' },
            directory_or_marketplace_only: { label: 'Directory/Marketplace', bg: '#a16207' },
            suspected_unreliable: { label: 'Suspected Unreliable', bg: '#d97706' },
            rejected_unusable: { label: 'Rejected', bg: '#b91c1c' },
        };
        const m = map[decision] || { label: decision || '-', bg: '#64748b' };
        return (
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: m.bg, color: '#fff', fontSize: 11, fontWeight: 600 }}>
                {m.label}
            </span>
        );
    };

    const onQualifyAll = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('qualify');
        try {
            const data = await dataExtractorApi.simpleLeadSearchQualificationStart(sid, { mode: 'all_enriched' });
            setQualificationJob(data?.job || null);
            toast.success(data?.alreadyRunning ? 'Qualification already running' : 'Qualification started');
            await refreshQualification(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onQualifySelected = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !selectedEnrichIds.length) {
            toast.error('Select one or more enrichment rows first');
            return;
        }
        setBusy('qualify');
        try {
            const data = await dataExtractorApi.simpleLeadSearchQualificationStart(sid, {
                mode: 'selected',
                enrichmentIds: selectedEnrichIds,
            });
            setQualificationJob(data?.job || null);
            toast.success('Qualification started for selected');
            await refreshQualification(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onQualifyRetry = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('qualify');
        try {
            const data = await dataExtractorApi.simpleLeadSearchQualificationStart(sid, { mode: 'retry_failed' });
            setQualificationJob(data?.job || null);
            toast.success('Retrying failed qualifications');
            await refreshQualification(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onStopQualification = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('qualifyStop');
        try {
            await dataExtractorApi.simpleLeadSearchQualificationStop(sid);
            toast.success('Stop qualification requested');
            await refreshQualification(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onExportQualified = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('qualifyExport');
        try {
            const response = await dataExtractorApi.simpleLeadSearchQualificationExport(sid);
            downloadBlobFromAxios(response, 'qualified-' + sid + '.xlsx');
            toast.success('Qualified Excel downloaded');
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onOpenQualifyDetail = async (qualificationId) => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !qualificationId) return;
        try {
            const data = await dataExtractorApi.simpleLeadSearchQualificationDetail(sid, qualificationId);
            setDetailQualification(data);
            setReviewNote(data?.qualification?.ownerReviewNote || '');
            setBusinessTypeCorrection(data?.qualification?.ownerBusinessTypeOverride || data?.qualification?.businessType || '');
        } catch (err) {
            toast.error(softSessionError(err));
        }
    };

    const onOwnerReview = async (qualificationId, action, extra = {}) => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !qualificationId) return;
        try {
            await dataExtractorApi.simpleLeadSearchQualificationReview(sid, qualificationId, {
                action,
                ownerReviewNote: reviewNote,
                ownerBusinessTypeOverride: businessTypeCorrection,
                ...extra,
            });
            toast.success('Review: ' + action);
            await refreshQualification(sid);
            await onOpenQualifyDetail(qualificationId);
        } catch (err) {
            toast.error(softSessionError(err));
        }
    };

    const toggleSelectEnrich = (id) => {
        const key = String(id);
        setSelectedEnrichIds((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
    };

    const toggleSelectGenuineness = (id) => {
        const key = String(id);
        setSelectedGenuinenessIds((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
    };

    const onVerifyAllQualified = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('verify');
        try {
            const data = await dataExtractorApi.simpleLeadSearchGenuinenessStart(sid, { mode: 'all_qualified' });
            setGenuinenessJob(data?.job || null);
            toast.success(data?.alreadyRunning ? 'Genuineness verification already running' : 'Genuineness verification started');
            await refreshGenuineness(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onVerifySelected = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !selectedGenuinenessIds.length) {
            toast.error('Select one or more qualified rows first');
            return;
        }
        setBusy('verify');
        try {
            const data = await dataExtractorApi.simpleLeadSearchGenuinenessStart(sid, {
                mode: 'selected',
                qualificationIds: selectedGenuinenessIds,
            });
            setGenuinenessJob(data?.job || null);
            toast.success('Genuineness verification started for selected');
            await refreshGenuineness(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onVerifyRetryFailed = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('verify');
        try {
            const data = await dataExtractorApi.simpleLeadSearchGenuinenessStart(sid, { mode: 'retry_failed' });
            setGenuinenessJob(data?.job || null);
            toast.success('Retrying failed genuineness verifications');
            await refreshGenuineness(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onStopVerification = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('verifyStop');
        try {
            await dataExtractorApi.simpleLeadSearchGenuinenessStop(sid);
            toast.success('Stop genuineness verification requested');
            await refreshGenuineness(sid);
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onExportVerified = async () => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid) return;
        setBusy('verifyExport');
        try {
            const response = await dataExtractorApi.simpleLeadSearchGenuinenessExport(sid);
            downloadBlobFromAxios(response, 'genuineness-' + sid + '.xlsx');
            toast.success('Genuineness Excel downloaded');
        } catch (err) {
            toast.error(softSessionError(err));
        } finally {
            setBusy('');
        }
    };

    const onOpenGenuinenessDetail = async (genuinenessId) => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !genuinenessId) return;
        try {
            const data = await dataExtractorApi.simpleLeadSearchGenuinenessDetail(sid, genuinenessId);
            setDetailGenuineness(data);
            setGenuinenessReviewNote(data?.genuineness?.ownerReviewNote || '');
        } catch (err) {
            toast.error(softSessionError(err));
        }
    };

    const onGenuinenessOwnerReview = async (genuinenessId, action, extra = {}) => {
        const sid = activeSession?._id || session?._id || result?.session?._id;
        if (!sid || !genuinenessId) return;
        try {
            await dataExtractorApi.simpleLeadSearchGenuinenessReview(sid, genuinenessId, {
                action,
                ownerReviewNote: genuinenessReviewNote,
                ...extra,
            });
            toast.success('Review: ' + action);
            await refreshGenuineness(sid);
            await onOpenGenuinenessDetail(genuinenessId);
        } catch (err) {
            toast.error(softSessionError(err));
        }
    };


    const toggleSelectRaw = (id) => {
        const key = String(id);
        setSelectedRawIds((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
    };

    const connected = agentLabel(agentStatus);
    const activeSession = session || result?.session;
    const status = activeSession?.status || '';
    const inactive = INACTIVE.has(status);
    const isManual = status === 'manual_action_required';
    const ownerStoppedUi = isOwnerStoppedSearch(activeSession, autoCollection) || status === 'cancelled';
    const canCapture = !!activeSession && !inactive && !ownerStoppedUi && CAPTURE_OK.has(status) && !busy;
    const canStop = !!activeSession && !inactive && !ownerStoppedUi && !busy && !stopInFlightRef.current;
    const canComplete = !!activeSession && !inactive && !busy;
    const canExport = !!activeSession && !busy && (rows.length > 0 || (captureStats?.uniqueResultCount || 0) > 0 || inactive);
    const autoStatus = autoCollection?.status || 'idle';
    const autoRunning = autoStatus === 'running';
    const autoPausedOwner = (autoStatus === 'paused_owner' || isOwnerManualPause(autoCollection))
        && !isWaitingForDiscoveryAgent(autoCollection)
        && !isLongAgentOfflinePause(autoCollection);
    const autoPausedManual = autoStatus === 'paused_manual';
    const waitingAgent = isWaitingForDiscoveryAgent(autoCollection);
    const autoActive = ['running', 'paused', 'paused_owner', 'paused_manual', 'paused_batch'].includes(autoCollection?.status);
    const canStartAuto = (autoCollectionOptions.mode === 'auto') && (!!activeSession && !inactive && !busy && !autoActive && GOOGLE_READY.has(status));
    const bannerSession = captureCompletedFlash && !inactive && !isManual && status !== 'capturing'
        ? { ...activeSession, status: 'capture_completed_ui' }
        : activeSession;
    const banner = bannerSession
        ? sessionBanner(bannerSession, sessionUiLabel || agentStatus?.sessionLabel, ownerErrorMessage || activeSession?.failMessage || activeSession?.manualActionMessage, {
            fullAuto: ownerFullAuto,
            campaignActive,
            ownerStopped: ownerStoppedUi,
        })
        : null;

    const capturedUnique = Number(autoProcessing?.counts?.capturedUnique
        ?? captureStats?.uniqueResultCount
        ?? (campaignProgress || result?.campaignProgress)?.uniqueResultsCollected
        ?? 0);
    const enrichingCount = Number(autoProcessing?.counts?.enriching ?? 0);
    const enrichedCount = Number(autoProcessing?.counts?.enriched ?? 0);
    const qualifiedCount = Number(autoProcessing?.counts?.qualified ?? 0);
    const verifiedCount = Number(
        genuinenessCounters?.uniqueVerifiedCompanies
        ?? genuinenessCounters?.independentlyVerifiedCompanies
        ?? autoProcessing?.counts?.verified
        ?? 0,
    );
    const verifiedSourceAppearances = Number(
        genuinenessCounters?.sourceAppearances
        ?? genuinenessCounters?.verifiedSourceAppearances
        ?? 0,
    );
    const duplicatesConsolidated = Number(
        genuinenessCounters?.duplicatesConsolidated
        ?? genuinenessCounters?.duplicateAppearancesConsolidated
        ?? Math.max(0, verifiedSourceAppearances - verifiedCount),
    );
    const reviewCount = Number(autoProcessing?.counts?.reviewRequired ?? 0);
    const failedCount = Number(autoProcessing?.counts?.failed ?? 0);
    const waitingEnrichmentCount = Number(autoProcessing?.counts?.waitingEnrichment ?? 0);
    const processingBacklog = Number(autoProcessing?.counts?.processingBacklog
        ?? (waitingEnrichmentCount + enrichingCount
            + Number(autoProcessing?.counts?.waitingQualification || 0)
            + Number(autoProcessing?.counts?.waitingVerification || 0)));
    const stuckProcessing = Number(
        autoProcessing?.stuckProcessing
        ?? autoProcessing?.counts?.reconcileProcessing
        ?? 0,
    );
    const lastWorkerHeartbeat = autoProcessing?.lastWorkerHeartbeat || autoProcessing?.lastTickAt || null;
    const lastProgressAt = autoProcessing?.lastProcessedAt
        || autoProcessing?.lastBatchCompletedAt
        || lastWorkerHeartbeat;
    const workerStatusMessage = autoProcessing?.workerStatusMessage || '';
    const workerActive = Boolean(autoProcessing?.workerActive);
    const backlogSummary = autoProcessing?.backlogSummary
        || (capturedUnique
            ? `${capturedUnique} captured. ${processingBacklog} waiting for processing.`
            : '');
    const autoResumeBanner = (autoProcessing?.autoResumed || autoProcessing?.autoResumeMessage)
        ? (autoProcessing.autoResumeMessage || AUTO_RESUME_BACKLOG_MESSAGE)
        : '';
    const tickFailedBanner = (autoProcessing?.lastErrorCode === 'pipeline_tick_failed'
        || autoProcessing?.lastErrorCode === 'atlas_collection_limit')
        ? (autoProcessing.lastErrorMessage || 'Automatic processing tick failed.')
        : '';
    const reconcile = reconcileBucketsFromCounts(autoProcessing?.counts || {});
    const queryIndex = safeQueryIndex(campaignProgress, result, autoCollection);
    const queryTotal = safeQueryTotal(campaignProgress, result, autoCollection);
    const visibleRunError = lastVisibleRunError({
        autoProcessing,
        autoCollection,
        session: activeSession,
        status,
    });
    const sourceCaptured = campaignProgress?.capturedBySource
        || result?.campaignProgress?.capturedBySource
        || {};
    const generatedQueries = safeGeneratedQueries(campaignProgress, result);
    const googlePage = autoCollection?.googlePage
        || (campaignProgress || result?.campaignProgress)?.googlePage
        || captureStats?.googlePageIndex
        || 1;
    const campaignName = result?.campaign?.name || '—';
    const s3Archive = archiveInfo || result?.campaign?.s3Archive || {};
    const archiveStatus = String(archiveInfo?.archiveStatus || s3Archive.status || 'NOT_ARCHIVED');
    const archiveSizeBytes = Number(archiveInfo?.archiveSize || s3Archive.size || 0);
    const archiveSizeLabel = archiveSizeBytes
        ? (archiveSizeBytes < 1024 ? `${archiveSizeBytes} B`
            : (archiveSizeBytes < 1024 * 1024 ? `${(archiveSizeBytes / 1024).toFixed(1)} KB`
                : `${(archiveSizeBytes / (1024 * 1024)).toFixed(1)} MB`))
        : '—';
    const processRunning = autoRunning || pipeRunning;
    const processPaused = (autoPausedOwner || pipePaused) && !autoPausedManual && !isManual;
    const processManual = autoPausedManual || isManual;
    const unfinishedDiscovery = campaignHasUnfinishedDiscovery(autoCollection, campaignProgress);
    const longAgentOffline = isLongAgentOfflinePause(autoCollection);
    const processDone = !unfinishedDiscovery
        && !longAgentOffline
        && !waitingAgent
        && isAuthoritativeCollectionComplete(autoCollection, activeSession, campaignProgress)
        && processingBacklog <= 0
        && autoProcessing?.status !== 'running';
    const processFailed = status === 'failed' || autoStatus === 'failed';
    let processTitle = 'Automatic Process';
    let pulseClass = styles.pulseGrey;
    let statusBadge = { text: 'Ready', cls: styles.badgeGrey };
    if (ownerStoppedUi) {
        processTitle = 'STOPPED BY USER';
        pulseClass = styles.pulseGrey;
        statusBadge = { text: 'STOPPED BY USER', cls: styles.badgeGrey };
    } else if (processManual) {
        processTitle = 'Manual Action Required';
        pulseClass = styles.pulseAmber;
        statusBadge = { text: 'Manual action required', cls: styles.badgeAmber };
    } else if (longAgentOffline) {
        processTitle = 'Automatic Process Paused';
        pulseClass = styles.pulseBlue;
        statusBadge = { text: 'Paused — Discovery Agent offline', cls: styles.badgeBlue };
    } else if (waitingAgent) {
        processTitle = 'Automatic Process Waiting';
        pulseClass = styles.pulseBlue;
        statusBadge = { text: 'Waiting for Discovery Agent', cls: styles.badgeBlue };
    } else if (processingBacklog > 0 && (pipeRunning || autoProcessing?.autoResumed || autoProcessing?.enabled)) {
        processTitle = 'Automatic Process Running';
        pulseClass = styles.pulse;
        statusBadge = { text: 'Processing backlog CP6 → CP8', cls: styles.badgeGreen };
    } else if (processRunning) {
        const discoveryOwner = formatDiscoveryOwnerStatus(autoCollection, activeSession);
        const waitingProvider = discoveryOwner === 'Waiting on provider / retrying'
            || formatProviderState(autoCollection, activeSession) === 'Retry';
        processTitle = waitingProvider ? 'Waiting on provider / retrying' : 'Automatic Process Running';
        pulseClass = waitingProvider ? styles.pulseBlue : styles.pulse;
        statusBadge = {
            text: waitingProvider
                ? 'Waiting on provider / retrying'
                : (autoRunning ? 'Auto Collection Running' : 'Processing CP6 → CP8'),
            cls: waitingProvider ? styles.badgeBlue : styles.badgeGreen,
        };
    } else if (processPaused) {
        processTitle = 'Automatic Process Paused';
        pulseClass = styles.pulseBlue;
        statusBadge = { text: 'Paused', cls: styles.badgeBlue };
    } else if (processFailed) {
        processTitle = 'Automatic Process Failed';
        pulseClass = styles.pulseRed;
        statusBadge = { text: 'Failed', cls: styles.badgeRed };
    } else if (processDone) {
        processTitle = 'Automatic Process Completed';
        pulseClass = styles.pulseGrey;
        statusBadge = { text: 'Completed', cls: styles.badgeGreen };
    } else if (inactive && unfinishedDiscovery) {
        processTitle = 'Automatic Process Paused';
        pulseClass = styles.pulseBlue;
        statusBadge = { text: 'Paused — progress saved', cls: styles.badgeBlue };
    } else if (status === 'queued') {
        processTitle = 'Waiting for discovery service';
        pulseClass = styles.pulseBlue;
        statusBadge = { text: 'Waiting for discovery service', cls: styles.badgeBlue };
    } else if (OPENING.has(status)) {
        const srcLabel = openingSourceLabel(activeSession);
        processTitle = `Opening ${srcLabel}`;
        pulseClass = styles.pulseBlue;
        statusBadge = { text: `Opening ${srcLabel}`, cls: styles.badgeBlue };
    } else if (GOOGLE_READY.has(status) && ownerFullAuto) {
        processTitle = 'Automatic Process Starting';
        pulseClass = styles.pulseBlue;
        statusBadge = { text: `${openingSourceLabel(activeSession)} Ready`, cls: styles.badgeBlue };
    }

    const activeStage = (enrichingCount > 0 || autoProcessing?.currentStage === 'enrich')
        ? 'enrich'
        : (autoProcessing?.currentStage === 'qualify' ? 'qualify'
            : (autoProcessing?.currentStage === 'verify' ? 'verify'
                : ((autoRunning || status === 'capturing') ? 'capture'
                    : ((verifiedCount > 0 && !processRunning) ? 'done' : 'capture'))));

    const enrichById = Object.fromEntries((enrichmentRows || []).map((e) => [String(e._id), e]));
    const qualifyById = Object.fromEntries((qualificationRows || []).map((q) => [String(q._id), q]));
    const latestVerified = (genuinenessRows || []).slice(0, 12).map((g, idx) => {
        const cs = g.contactSummary || {};
        const phonesAll = Array.isArray(g.phones) && g.phones.length
            ? g.phones
            : (Array.isArray(cs.phonesAll) ? cs.phonesAll : (Array.isArray(g.allPhones) ? g.allPhones : []));
        const emailsAll = Array.isArray(g.emails) && g.emails.length
            ? g.emails
            : (Array.isArray(cs.emailsAll) ? cs.emailsAll : (Array.isArray(g.allEmails) ? g.allEmails : []));
        const whatsappAll = Array.isArray(g.whatsappNumbers) && g.whatsappNumbers.length
            ? g.whatsappNumbers
            : (Array.isArray(cs.whatsappAll) ? cs.whatsappAll : (Array.isArray(g.allWhatsApp) ? g.allWhatsApp : []));

        const phonePrimary = g.primaryPhone || cs.primaryPhone
            || (phonesAll[0]?.value || phonesAll[0]?.normalized || phonesAll[0]?.original || '');
        const emailPrimary = g.primaryEmail || cs.primaryEmail
            || (typeof emailsAll[0] === 'string' ? emailsAll[0] : (emailsAll[0]?.value || emailsAll[0]?.address || ''));
        const whatsappPrimary = g.primaryWhatsApp || cs.primaryWhatsApp
            || (whatsappAll[0]?.value || whatsappAll[0]?.normalized || whatsappAll[0]?.original || '');

        const genuineness = g.ownerDecision || g.systemDecision || '';
        const statusLabel = g.verificationStatusLabel
            || (g.isDirectoryListing
                ? 'Directory Listing — Business Not Independently Verified'
                : ({
                    verified_genuine: 'Verified Genuine',
                    likely_genuine: 'Likely Genuine',
                    human_review_required: 'Review Required',
                    directory_or_marketplace_only: 'Directory Listing — Business Not Independently Verified',
                    suspected_unreliable: 'Unreliable',
                    rejected_unusable: 'Rejected',
                }[genuineness] || (genuineness ? String(genuineness).replace(/_/g, ' ') : '—')));
        return {
            idx: idx + 1,
            id: g._id || g.canonicalKey || g.genuinenessId,
            companyName: g.uniqueCompany || g.companyName || '—',
            domain: g.canonicalDomain || '',
            websiteUrl: g.primaryWebsite || g.websiteUrl || '',
            businessType: g.businessType || '',
            city: g.city || '',
            state: g.state || form.state || '',
            email: emailPrimary,
            phone: phonePrimary,
            whatsapp: whatsappPrimary,
            emailShort: cs.emailsShort || (emailsAll.length > 1 ? `${emailPrimary} +${emailsAll.length - 1} more` : emailPrimary),
            phoneShort: cs.phonesShort || (phonesAll.length > 1 ? `${phonePrimary} +${phonesAll.length - 1} more` : phonePrimary),
            whatsappShort: cs.whatsappShort || (whatsappAll.length > 1 ? `${whatsappPrimary} +${whatsappAll.length - 1} more` : whatsappPrimary),
            phonesAll: phonesAll.map((p) => ({
                value: p.value || p.normalized || p.original || String(p),
                sourceUrl: p.sourceUrl || '',
                evidenceType: p.evidenceType || p.confidence || 'phone',
                firstCapturedAt: p.firstCapturedAt || null,
                lastVerifiedAt: p.lastVerifiedAt || p.verifiedAt || null,
            })),
            emailsAll: emailsAll.map((e) => ({
                value: typeof e === 'string' ? e : (e.value || e.address || ''),
                sourceUrl: e.sourceUrl || '',
                evidenceType: e.evidenceType || e.kind || 'email',
                firstCapturedAt: e.firstCapturedAt || null,
                lastVerifiedAt: e.lastVerifiedAt || e.verifiedAt || null,
            })),
            whatsappAll: whatsappAll.map((p) => ({
                value: p.value || p.normalized || p.original || String(p),
                sourceUrl: p.sourceUrl || '',
                evidenceType: p.evidenceType || p.confidence || 'whatsapp',
                firstCapturedAt: p.firstCapturedAt || null,
                lastVerifiedAt: p.lastVerifiedAt || p.verifiedAt || null,
            })),
            genuineness,
            statusLabel,
            sourceAppearances: g.sourceAppearances ?? 1,
            queryCount: g.queryCount ?? 0,
            evidenceCount: g.evidenceCount ?? 0,
            evidence: g.evidence || [],
            status: g.independentlyVerified
                ? 'Completed'
                : (g.isDirectoryListing
                    ? 'Directory Listing'
                    : (genuineness === 'human_review_required' ? 'Review Required' : 'Processing')),
            capturedAt: g.verifiedAt || g.updatedAt || g.createdAt,
        };
    });

    const relevanceLabel = (v) => ({
        strong_match: 'Strong Match', possible_match: 'Possible Match',
        human_review_required: 'Review Required', rejected: 'Rejected', rejected_unusable: 'Rejected',
    }[v] || (v ? String(v).replace(/_/g, ' ') : '—'));
    const relevanceCls = (v) => (v === 'strong_match' ? styles.badgeGreen : v === 'possible_match' ? styles.badgeAmber : v === 'human_review_required' ? styles.badgePurple : String(v || '').includes('reject') ? styles.badgeRed : styles.badgeGrey);
    const genuinenessLabelFn = (v) => ({
        verified_genuine: 'Verified Genuine', likely_genuine: 'Likely Genuine',
        human_review_required: 'Review Required',
        directory_or_marketplace_only: 'Directory Listing — Business Not Independently Verified',
        directory_listing_not_independently_verified: 'Directory Listing — Business Not Independently Verified',
        suspected_unreliable: 'Unreliable', rejected_unusable: 'Rejected',
    }[v] || (v ? String(v).replace(/_/g, ' ') : '—'));
    const genuinenessCls = (v) => (v === 'verified_genuine' || v === 'likely_genuine' ? styles.badgeGreen : v === 'human_review_required' || v === 'directory_or_marketplace_only' ? styles.badgeAmber : String(v || '').includes('unreliable') || String(v || '').includes('reject') ? styles.badgeRed : styles.badgeGrey);
    const btCls = (bt) => {
        const t = String(bt || '').toLowerCase();
        if (t.includes('manufacturer')) return styles.badgePurple;
        if (t.includes('provider')) return styles.badgeBlue;
        if (t.includes('supplier')) return styles.badgeAmber;
        if (t.includes('integrator')) return styles.badgeGreen;
        return styles.badgeGrey;
    };
    const secsAgo = Math.max(0, Math.round((Date.now() - (lastUpdatedRef.current || Date.now())) / 1000));
    const ALL_BUSINESS_TYPES = ['Manufacturer', 'OEM / ODM', 'Brand Owner', 'Provider', 'Supplier', 'Dealer', 'Distributor', 'Importer', 'Exporter', 'Wholesaler', 'Retailer', 'System Integrator', 'Service Provider', 'Contractor', 'Consultant', 'Marketplace Seller', 'Other'];
    const formLocked = !!result && !inactive;
    const hideStartForm = hideStartExtraction && !result;
    const formManualLimit = isManualCollectionLimit(autoCollectionOptions);
    const runningManualLimit = String(autoCollection?.collectionMode || '').toLowerCase() === 'fixed_target'
        && Number(autoCollection?.requestedCaptureTarget || 0) > 0;
    const runningModeLabel = runningManualLimit
        ? `Manual Limit — ${Number(autoCollection.requestedCaptureTarget)}`
        : 'Unlimited — Until Exhausted / Stopped';
    const emptyMessage = !result
        ? 'Ready to discover and verify business data.'
        : OPENING.has(status)
            ? 'Discovery Agent is opening the managed Google search.'
            : (longAgentOffline
                ? AGENT_SLEEP_PAUSE_MESSAGE
                : (processRunning
                    ? (capturedUnique ? 'Captured records are moving through Enrichment, Qualification and Verification.' : 'Automatic collection is running.')
                    : (processManual ? manualActionCopy(activeSession).title
                        : (processDone ? ((reviewCount || failedCount) ? 'Some records require review or retry.' : 'Automatic processing completed successfully.')
                            : (capturedUnique ? '' : 'No unique results captured yet.')))));

    return (
        <SimpleLeadSearchErrorBoundary onStartNew={onStartNew}>
        <div className={styles.page}>
            {runMode ? (
                <div style={{ marginBottom: 12, padding: '10px 12px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe', fontSize: 13 }}>
                    Dedicated search run window — closing this tab does <strong>not</strong> stop the backend search.
                    {resumeSessionId ? <> Run ID: <code>{resumeSessionId}</code></> : null}
                    {(() => {
                        const banner = formatOwnerBanner(
                            {
                                createdByName: session?.createdByName,
                                createdBy: session?.createdBy,
                                ownerName: result?.owner?.name,
                                owner: result?.owner,
                                assignedDeviceName: session?.assignedDeviceName || result?.owner?.deviceName,
                                assignedDeviceId: session?.assignedDeviceId || result?.owner?.deviceId,
                            },
                            user?._id || user?.id,
                        );
                        return banner.ownerName && banner.ownerName !== 'Unknown'
                            ? (
                                <div style={{ marginTop: 6, fontWeight: 700 }}>
                                    {banner.label}{banner.monitoring ? ' (monitoring — ownership unchanged)' : ''}
                                    {banner.deviceLine ? <div>{banner.deviceLine}</div> : null}
                                </div>
                            )
                            : null;
                    })()}
                </div>
            ) : null}
            {startNewPrompt ? (
                <div style={{ marginBottom: 16, padding: 14, background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8 }}>
                    <strong>Your current extraction is still running.</strong>
                    <p style={{ margin: '8px 0 12px', fontSize: 13, color: '#9a3412' }}>Do not start a second campaign by accident. Previous results stay in My Searches.</p>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className={styles.howBtn} onClick={() => setStartNewPrompt(false)}>Continue Current Search</button>
                        <button type="button" className={styles.howBtn} onClick={pauseAndStartNew}>Pause &amp; Start New</button>
                        <button type="button" className={styles.howBtn} onClick={() => setStartNewPrompt(false)}>Cancel</button>
                    </div>
                </div>
            ) : null}
            {!runMode ? <DataExtractorActiveRunsPanel /> : null}
            {ownerErrorMessage && !result && (
                <div className={styles.manualBanner} role="alert" style={{ marginBottom: 16 }}>
                    <ShieldAlert size={22} aria-hidden />
                    <div>
                        <h3>{CAMPAIGN_LOAD_ERROR_MESSAGE}</h3>
                        <p style={{ marginTop: 8 }}>
                            <button type="button" className={styles.howBtn} style={{ marginRight: 8 }} onClick={() => { setOwnerErrorMessage(''); refreshAgent(); }}>
                                Retry
                            </button>
                            <button type="button" className={styles.howBtn} onClick={onStartNew}>
                                Start New Search
                            </button>
                        </p>
                    </div>
                </div>
            )}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <div className={styles.titleRow}>
                        <h2 className={styles.title}>Data Extractor</h2>
                        <button
                            type="button"
                            className={styles.infoBtn}
                            aria-label="About Simple Lead Search"
                            title="One-click Capture → Enrich → Qualify → Verify. CRM Leads are never created automatically."
                            onClick={() => setShowHowItWorks(true)}
                        >
                            <Info size={16} aria-hidden />
                        </button>
                    </div>
                    <p className={styles.subtitle}>
                        One-click automatic process: Capture → Enrich → Qualify → Verify
                        <span style={{ marginLeft: 8, color: '#dc2626', fontWeight: 600 }}>(No CRM Leads will be created)</span>
                    </p>
                </div>
                <button type="button" className={styles.howBtn} onClick={() => setShowHowItWorks(true)}>
                    <PlayCircle size={16} aria-hidden />
                    How it works?
                </button>
            </div>

            <div className={styles.agentPill} style={{ color: connected.color }}>
                <span className={styles.agentDot} style={{ background: connected.color }} aria-hidden />
                {connected.text}
            </div>
            {Array.isArray(agentStatus?.devices) && agentStatus.devices.length > 1 && !runMode ? (
                <label style={{ display: 'block', margin: '0 0 12px', fontSize: 13 }}>
                    Run extraction on:
                    <select
                        value={selectedDeviceId || agentStatus.preferredDeviceId || ''}
                        onChange={(e) => {
                            setSelectedDeviceId(e.target.value);
                            writeLocalDeviceId(e.target.value);
                            refreshAgent();
                        }}
                        style={{ display: 'block', marginTop: 6, padding: '6px 8px', minWidth: 240 }}
                    >
                        {agentStatus.devices.map((d) => (
                            <option key={d.deviceId || d.agentTokenId} value={d.deviceId}>
                                {d.deviceName || d.deviceId} — {d.online ? 'Ready' : 'Offline'}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}
            {!connected.online && !runMode ? (
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#9a3412' }}>
                    Discovery Agent is not connected on this computer. Start the Discovery Agent on this PC to begin extraction.
                </p>
            ) : null}
            {!runMode ? <DataExtractorRegisterThisPcPanel compact /> : null}
            {isRunRoute && hideStartForm ? (
                <div className={styles.card} role="status" style={{ marginBottom: 16 }}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#0f172a' }}>
                        {runLoadStatus === RUN_LOAD.RETRYING
                            ? RUN_LOAD_MESSAGES.RETRYING
                            : RUN_LOAD_MESSAGES.LOADING}
                    </p>
                    <p style={{ margin: '8px 0 0', fontSize: 13, color: '#475569' }}>
                        Run ID: <code>{resumeSessionId}</code>
                    </p>
                </div>
            ) : null}
            {isRunRoute && result && connectionDegraded ? (
                <div className={styles.manualBanner} role="status" style={{ marginBottom: 12 }}>
                    <RefreshCw size={18} aria-hidden />
                    <div>
                        <h3>{RUN_LOAD_MESSAGES.DEGRADED}</h3>
                    </div>
                </div>
            ) : null}
            {isChinaCountryInput(form.country) ? (
                <div style={{ margin: '8px 0 12px', padding: '10px 12px', border: '1px solid #c7d2fe', background: '#eef2ff', borderRadius: 8, fontSize: 13 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>China Native Supplier Discovery</div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8, fontSize: 12, color: '#3730a3' }}>
                        <span><strong>SEARCH LANGUAGE:</strong> Chinese Native + English Secondary</span>
                        <span><strong>SOURCE PRIORITY:</strong> Chinese Native First</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        {CHINA_SOURCE_BADGES.map((src) => (
                            <span key={src.id} style={{ border: '1px solid #a5b4fc', borderRadius: 6, padding: '2px 8px', background: '#fff' }}>
                                {src.label}
                                <span style={{ marginLeft: 6, color: src.status === 'Secondary' ? '#b45309' : '#15803d', fontSize: 11 }}>{src.status}</span>
                            </span>
                        ))}
                    </div>
                    <div style={{ color: '#4338ca' }}>
                        China discovery prioritizes Chinese-native sources including 1688, Baidu, Sogou and 360 Search, followed by Google-indexed export marketplaces and Google Web. Login/CAPTCHA may require manual confirmation.
                    </div>
                </div>
            ) : null}

            {showHowItWorks && (
                <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label="How it works">
                    <div className={styles.modal}>
                        <h3>How Simple Lead Search works</h3>
                        <ol>
                            <li>Enter product and location.</li>
                            <li>Click Search &amp; Start Automatic Process.</li>
                            <li>CRM captures and processes results automatically.</li>
                            <li>Handle Google CAPTCHA/consent only when requested.</li>
                            <li>Review or export verified records.</li>
                            <li>Create a Lead from any live result while extraction continues.</li>
                        </ol>
                        <div className={styles.modalLeadOff}>Leads are created only when you click Create Lead. Extraction keeps running.</div>
                        <button type="button" className={styles.modalClose} onClick={() => setShowHowItWorks(false)}>Got it</button>
                    </div>
                </div>
            )}

            {!hideStartForm ? (
            <form className={styles.card} onSubmit={onSearch}>
                {!isChinaCountryInput(form.country) && (form.product.trim() || form.city.trim()) ? (
                    <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 15, fontWeight: 700, color: '#0f172a' }}>
                        {formatSimpleSearchLabel(form.product, form.businessTypes, form.city || form.state)}
                    </div>
                ) : null}
                <div className={styles.formGrid}>
                    <label className={styles.fieldWrap}>
                        <span className={styles.label}>Keyword *</span>
                        <input className={styles.field} value={form.product} onChange={(e) => { onChange('product')(e); setQueryPreview(null); }} placeholder={isChinaCountryInput(form.country) ? '智能触摸开关,玻璃触摸开关' : 'e.g. LED Light Manufacturer'} autoComplete="off" disabled={formLocked} />
                    </label>
                    {isChinaCountryInput(form.country) ? (
                    <label className={styles.fieldWrap}>
                        <span className={styles.label}>Related Keywords</span>
                        <input className={styles.field} value={form.relatedKeywords} onChange={(e) => { onChange('relatedKeywords')(e); setQueryPreview(null); }} placeholder="涂鸦, Zigbee, WiFi, 蓝牙Mesh, 智能家居, 场景开关" autoComplete="off" disabled={formLocked} />
                    </label>
                    ) : (
                    <div className={`${styles.fieldWrap} ${styles.fieldWrapWide}`}>
                        <span className={styles.label}>Business Type</span>
                        <div className={styles.chips}>
                            {form.businessTypes.length === 0 ? (
                                <span style={{ fontSize: 12, color: '#94a3b8', padding: '0 6px' }}>Select one or more</span>
                            ) : form.businessTypes.map((bt) => (
                                <span key={bt} className={styles.chip}>
                                    {bt}
                                    {!formLocked && (
                                        <button type="button" className={styles.chipRemove} aria-label={`Remove ${bt}`} onClick={() => toggleBusinessType(bt)}>×</button>
                                    )}
                                </span>
                            ))}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginTop: 8 }}>
                            {SIMPLE_BUSINESS_TYPES.map((bt) => (
                                <label key={bt} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: formLocked ? '#94a3b8' : '#334155', cursor: formLocked ? 'not-allowed' : 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        disabled={formLocked}
                                        checked={form.businessTypes.includes(bt)}
                                        onChange={() => toggleBusinessType(bt)}
                                    />
                                    {bt}
                                </label>
                            ))}
                        </div>
                    </div>
                    )}
                    {isChinaCountryInput(form.country) ? (
                    <div className={`${styles.fieldWrap} ${styles.fieldWrapWide}`}>
                        <span className={styles.label}>Business Types</span>
                        <div style={{ fontSize: 12, color: '#64748b', margin: '4px 0 6px' }}>
                            For China supplier-manufacturer search, Manufacturer / OEM / ODM / Supplier / Factory vocabulary ranks highest. Consultant, Contractor, Service Provider and System Integrator do not dominate unless you add them.
                        </div>
                        <div className={styles.chips}>
                            {form.businessTypes.map((bt) => (
                                <span key={bt} className={styles.chip}>
                                    {bt}
                                    {!formLocked && (
                                        <button type="button" className={styles.chipRemove} aria-label={`Remove ${bt}`} onClick={() => toggleBusinessType(bt)}>×</button>
                                    )}
                                </span>
                            ))}
                            {!formLocked && (
                                <button type="button" className={`${styles.chip} ${styles.chipAdd}`} onClick={() => setShowBtPicker((v) => !v)}>+ Add</button>
                            )}
                        </div>
                        {showBtPicker && !formLocked && (
                            <div className={styles.chipPicker}>
                                {ALL_BUSINESS_TYPES.filter((bt) => !form.businessTypes.includes(bt)).map((bt) => (
                                    <button key={bt} type="button" className={`${styles.chip} ${styles.chipAdd}`} onClick={() => toggleBusinessType(bt)}>{bt}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    ) : null}
                    <label className={styles.fieldWrap}>
                        <span className={styles.label}>Country</span>
                        <input className={styles.field} value={form.country} onChange={(e) => {
                            const country = e.target.value;
                            const cn = country.trim().toLowerCase();
                            const isChina = cn === 'china' || cn === 'cn' || cn === 'prc';
                            setForm((f) => ({
                                ...f,
                                country,
                                locationScope: inferUiLocationScope({ ...f, country }),
                                ...(isChina ? {
                                    searchMarket: 'china_suppliers',
                                    selectedSources: CHINA_DEFAULT_SOURCES,
                                    businessTypes: CHINA_DEFAULT_BUSINESS_TYPES,
                                } : {}),
                            }));
                            setQueryPreview(null);
                        }} placeholder="e.g. India" autoComplete="off" disabled={formLocked} />
                    </label>
                    <label className={styles.fieldWrap}>
                        <span className={styles.label}>State</span>
                        <input className={styles.field} value={form.state} onChange={(e) => { onChange('state')(e); setQueryPreview(null); }} placeholder="optional" autoComplete="off" disabled={formLocked} />
                    </label>
                    <label className={styles.fieldWrap}>
                        <span className={styles.label}>City</span>
                        <input className={styles.field} value={form.city} onChange={(e) => { onChange('city')(e); setQueryPreview(null); }} placeholder="optional" autoComplete="off" disabled={formLocked} />
                    </label>
                </div>

                <button type="button" className={styles.advancedToggle} onClick={() => setShowAdvanced((v) => !v)}>
                    {showAdvanced ? 'Hide Advanced Search Options' : 'Advanced Search Options'}
                </button>
                {showAdvanced && (
                    <div className={styles.advancedBox}>
                        {!isChinaCountryInput(form.country) ? (
                            <label className={styles.fieldWrap} style={{ marginBottom: 10 }}>
                                <span className={styles.label}>Related Keywords (optional)</span>
                                <input className={styles.field} value={form.relatedKeywords} onChange={(e) => { onChange('relatedKeywords')(e); setQueryPreview(null); }} placeholder="Smart Switch, Tuya, KNX" autoComplete="off" disabled={formLocked} />
                            </label>
                        ) : null}
                        <label className={styles.fieldWrap} style={{ marginBottom: 10 }}>
                            <span className={styles.label}>Search Market / Source Mode</span>
                            <select
                                className={styles.select}
                                value={form.searchMarket}
                                disabled={formLocked}
                                onChange={(e) => {
                                    const searchMarket = e.target.value;
                                    setForm((f) => ({
                                        ...f,
                                        searchMarket,
                                        country: searchMarket === 'china_suppliers' && !f.country ? 'China' : f.country,
                                        selectedSources: searchMarket === 'china_suppliers' ? CHINA_DEFAULT_SOURCES : ['google_web'],
                                        businessTypes: searchMarket === 'china_suppliers' ? CHINA_DEFAULT_BUSINESS_TYPES : INDIA_DEFAULT_BUSINESS_TYPES,
                                    }));
                                    setQueryPreview(null);
                                }}
                            >
                                <option value="india_global_web">India / Global Web</option>
                                <option value="china_suppliers">China Native Supplier Discovery</option>
                                <option value="custom_country_global">Custom Country / Global Suppliers</option>
                            </select>
                        </label>
                        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                            {form.searchMarket === 'china_suppliers' || isChinaCountryInput(form.country)
                                ? 'China discovery is Chinese-native first: 1688, Baidu, Sogou, 360 Search, then indexed B2B, then Google. Login/CAPTCHA may require manual confirmation. Direct Alibaba API is not claimed.'
                                : 'India / Global Web uses Google assisted visible capture. Direct IndiaMART adapters are not claimed complete.'}
                        </div>
                        {form.locationScope === 'state' && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 8 }}>
                                <input type="checkbox" checked={form.expandStateSearch} disabled={formLocked} onChange={(e) => { setForm((f) => ({ ...f, expandStateSearch: e.target.checked })); setQueryPreview(null); }} />
                                Expand State Search into Major Cities (default OFF)
                            </label>
                        )}
                        {form.expandStateSearch && form.locationScope === 'state' && (
                            <label className={styles.fieldWrap} style={{ marginBottom: 8 }}>
                                <span className={styles.label}>Selected cities (comma-separated)</span>
                                <input className={styles.field} value={(form.expandCities || []).join(', ')} disabled={formLocked} onChange={(e) => { setForm((f) => ({ ...f, expandCities: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })); setQueryPreview(null); }} />
                            </label>
                        )}
                        {form.locationScope === 'country' && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 8 }}>
                                <input type="checkbox" checked={form.expandCountrySearch} disabled={formLocked} onChange={(e) => { setForm((f) => ({ ...f, expandCountrySearch: e.target.checked })); setQueryPreview(null); }} />
                                Expand Country Search into States (default OFF)
                            </label>
                        )}
                        {form.expandCountrySearch && form.locationScope === 'country' && (
                            <label className={styles.fieldWrap}>
                                <span className={styles.label}>Selected states (comma-separated)</span>
                                <input className={styles.field} value={(form.expandStates || []).join(', ')} disabled={formLocked} onChange={(e) => { setForm((f) => ({ ...f, expandStates: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })); setQueryPreview(null); }} />
                            </label>
                        )}
                        <label className={styles.fieldWrap} style={{ marginTop: 10, marginBottom: 8 }}>
                            <span className={styles.label}>Collection Mode</span>
                            <select
                                className={styles.select}
                                value={formManualLimit ? 'fixed_target' : 'unlimited'}
                                disabled={formLocked}
                                onChange={(e) => {
                                    const collectionMode = e.target.value;
                                    setAutoCollectionOptions((o) => ({
                                        ...o,
                                        collectionMode,
                                        requestedCaptureTarget: collectionMode === 'fixed_target'
                                            ? (Number(o.requestedCaptureTarget) > 0 ? o.requestedCaptureTarget : '')
                                            : 0,
                                    }));
                                }}
                            >
                                <option value="unlimited">Unlimited — Recommended / Default</option>
                                <option value="fixed_target">Manual Limit</option>
                            </select>
                        </label>
                        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#475569' }}>
                            The system continues through available queries and sources until no more results are available or you stop the campaign.
                        </p>
                        {formManualLimit || String(autoCollectionOptions.collectionMode) === 'fixed_target' ? (
                            <label className={styles.fieldWrap} style={{ marginBottom: 8 }}>
                                <span className={styles.label}>Maximum Results</span>
                                <input
                                    className={styles.field}
                                    type="number"
                                    min={1}
                                    max={500}
                                    placeholder="e.g. 200"
                                    value={autoCollectionOptions.requestedCaptureTarget || ''}
                                    disabled={formLocked}
                                    onChange={(e) => setAutoCollectionOptions((o) => ({
                                        ...o,
                                        collectionMode: 'fixed_target',
                                        requestedCaptureTarget: e.target.value,
                                    }))}
                                />
                            </label>
                        ) : null}
                    </div>
                )}

                <div className={styles.unlimitedMode}>
                    <strong>Collection Mode: {formManualLimit
                        ? `Manual Limit — ${Number(autoCollectionOptions.requestedCaptureTarget)}`
                        : 'Unlimited — Until Exhausted / Stopped'}</strong>
                    <div>
                        {formManualLimit
                            ? 'Campaign may stop when the requested total is reached.'
                            : 'The system continues through available queries and sources until no more results are available or you stop the campaign.'}
                    </div>
                </div>

                {isChinaCountryInput(form.country) ? (
                    <>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
                            <button type="button" className={styles.howBtn} disabled={!!busy || previewBusy || formLocked} onClick={onGenerateQueries}>
                                {previewBusy ? 'Generating preview…' : 'Preview queries'}
                            </button>
                            <span className={styles.helperText} style={{ margin: 0 }}>
                                Inspect Source, Query and Language before starting. This does not start a campaign.
                            </span>
                        </div>
                        {queryPreview?.queries?.length ? (
                            <div style={{ marginBottom: 14, overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                            <th style={{ padding: '6px 8px' }}>#</th>
                                            <th style={{ padding: '6px 8px' }}>Source</th>
                                            <th style={{ padding: '6px 8px' }}>Language</th>
                                            <th style={{ padding: '6px 8px' }}>Query</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {queryPreview.queries.map((q, i) => (
                                            <tr key={`${q.sourcePlatform}-${q.queryText}-${i}`} style={{ borderTop: '1px solid #e2e8f0' }}>
                                                <td style={{ padding: '6px 8px' }}>{i + 1}</td>
                                                <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{chinaSourcePreviewLabel(q.sourcePlatform)}</td>
                                                <td style={{ padding: '6px 8px' }}>{q.queryLanguage === 'zh' ? 'Chinese' : (q.queryLanguage || 'en')}</td>
                                                <td style={{ padding: '6px 8px' }}><code>{q.queryText}</code></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </>
                ) : null}
                {!hideStartExtraction ? (
                <button type="submit" className={styles.primaryBtn} disabled={!!busy || formLocked || (agentStatus?.canStartOnThisDevice === false)}>
                    <span className={styles.primaryBtnRow}>
                        <Rocket size={18} aria-hidden />
                        {busy === 'start' ? 'Starting...' : 'Start Extraction'}
                    </span>
                    <span className={styles.primaryHint}>Auto Collection and all checkpoints will run automatically.</span>
                </button>
                ) : null}
                <p className={styles.helperText}>
                    {isChinaCountryInput(form.country)
                        ? 'CRM will automatically collect, enrich, qualify and verify. For China, handle 1688 / Baidu / Sogou / 360 / Google login or CAPTCHA only when requested.'
                        : 'CRM will automatically collect, enrich, qualify and verify the data. You only need to handle Google CAPTCHA or consent when requested.'}
                </p>
            </form>
            ) : null}

            <div className={styles.strip} aria-label="Automation defaults">
                <div className={styles.stripItem}>
                    <span className={styles.stripIcon}><Database size={14} aria-hidden /></span>
                    <div><div className={styles.stripLabel}>Auto Collection</div><div className={styles.stripValue}>Always ON</div></div>
                </div>
                <div className={styles.stripItem}>
                    <span className={styles.stripIcon}><Layers size={14} aria-hidden /></span>
                    <div>
                        <div className={styles.stripLabel}>Collection Mode</div>
                        <div className={styles.stripValue}>{formManualLimit
                            ? `Manual Limit — ${Number(autoCollectionOptions.requestedCaptureTarget)}`
                            : 'Unlimited — Until Exhausted / Stopped'}</div>
                    </div>
                </div>
                <div className={styles.stripItem}>
                    <span className={styles.stripIcon}><Sparkles size={14} aria-hidden /></span>
                    <div><div className={styles.stripLabel}>Automatic Processing</div><div className={styles.stripValue}>CP6 → CP7 → CP8</div></div>
                </div>
                <div className={styles.stripItem}>
                    <span className={styles.stripIcon}><RefreshCw size={14} aria-hidden /></span>
                    <div><div className={styles.stripLabel}>Continue While Collecting</div><div className={styles.stripValue}>Yes</div></div>
                </div>
                <div className={styles.stripItem}>
                    <span className={styles.stripIcon}><AlertTriangle size={14} aria-hidden /></span>
                    <div><div className={styles.stripLabel}>Batch / Retry</div><div className={styles.stripValue}>{(Number(autoProcessingOptions.batchSize) || 10)} · {(Number(autoProcessingOptions.maxRetryAttempts) || 2)} retries</div></div>
                </div>
                <div className={`${styles.stripItem} ${styles.stripItemLeadOff}`}>
                    <span className={`${styles.stripIcon} ${styles.stripIconWarn}`}><Ban size={14} aria-hidden /></span>
                    <div><div className={styles.stripLabel}>CRM Lead Creation</div><div className={styles.stripValue}>One-click from results</div></div>
                </div>
            </div>
            <p className={styles.helperText} style={{ marginTop: 4, marginBottom: 12 }}>
                Discovery continues Google pages and queries until no more source results are available or you stop. Unique companies are counted separately and do not end discovery early.
            </p>

            {processManual && (
                <div className={styles.manualBanner} role="status">
                    <ShieldAlert size={22} aria-hidden />
                    <div>
                        <h3>{manualActionCopy(activeSession).title}</h3>
                        <p>{manualActionCopy(activeSession).detail}</p>
                        <button
                            type="button"
                            className={styles.ctrlBtn}
                            disabled={!!busy}
                            onClick={onContinueAutomaticProcess}
                            style={{ marginTop: 10 }}
                        >
                            {busy === 'autoContinue' || busy === 'continue' ? 'Continuing...' : 'Continue After Manual Action'}
                        </button>
                    </div>
                </div>
            )}

            {result ? (
                <div className={styles.liveGrid}>
                    <section className={styles.liveCard} aria-live="polite">
                        <div className={styles.liveTitleRow}>
                            <span className={`${styles.pulse} ${pulseClass}`} aria-hidden />
                            <h3 className={styles.liveTitle}>{processTitle}</h3>
                        </div>
                        {longAgentOffline && (
                            <div className={styles.manualBanner} role="status" style={{ marginBottom: 12 }}>
                                <div>
                                    <h3>Paused — Discovery Agent was offline. Click Resume Campaign to continue.</h3>
                                    <p>{AGENT_SLEEP_PAUSE_MESSAGE}</p>
                                </div>
                            </div>
                        )}
                        {ownerStoppedUi && (
                            <div className={styles.manualBanner} role="status" style={{ marginBottom: 12 }}>
                                <CheckCircle2 size={22} aria-hidden />
                                <div>
                                    <h3>Search Stopped</h3>
                                    <p>
                                        {capturedUnique} {capturedUnique === 1 ? 'company' : 'companies'} collected.
                                        {' '}All collected results are preserved.
                                    </p>
                                </div>
                            </div>
                        )}
                        {liveActivity?.headline ? (
                            <p className={styles.liveHeadline}>{liveActivity.headline}</p>
                        ) : null}
                        {autoResumeBanner && (
                            <div style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                borderRadius: 8,
                                background: '#ecfdf5',
                                border: '1px solid #a7f3d0',
                                color: '#065f46',
                                fontSize: 13,
                                fontWeight: 600,
                            }} role="status">
                                {autoResumeBanner}
                            </div>
                        )}
                        {(backlogSummary && processingBacklog > 0) && (
                            <div style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                borderRadius: 8,
                                background: '#fff7ed',
                                border: '1px solid #fed7aa',
                                color: '#9a3412',
                                fontSize: 13,
                                fontWeight: 600,
                            }}>
                                Processing Backlog: {processingBacklog}
                                {stuckProcessing > 0 ? ` · Stuck Processing: ${stuckProcessing}` : ''}
                                {capturedUnique ? ` · ${backlogSummary}` : ''}
                            </div>
                        )}
                        {tickFailedBanner && (
                            <div style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                borderRadius: 8,
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                color: '#991b1b',
                                fontSize: 13,
                                fontWeight: 600,
                            }} role="alert">
                                Worker inactive / tick failed: {tickFailedBanner}
                                {' '}Click <strong>Resume Campaign</strong> after the cause is fixed.
                            </div>
                        )}
                        {(!workerActive && pipeRunning && !tickFailedBanner) && (
                            <div style={{
                                marginBottom: 12,
                                padding: '10px 12px',
                                borderRadius: 8,
                                background: '#f8fafc',
                                border: '1px solid #cbd5e1',
                                color: '#334155',
                                fontSize: 13,
                            }}>
                                {workerStatusMessage || 'No recent worker heartbeat. Keep this page open or click Resume Campaign.'}
                            </div>
                        )}
                        <div className={styles.metaGrid}>
                            <div><div className={styles.metaLabel}>Campaign</div><div className={styles.metaValue}>{campaignName}</div></div>
                            <div><div className={styles.metaLabel}>Collection Mode</div><div className={styles.metaValue}>
                                {runningModeLabel}
                            </div></div>
                            <div><div className={styles.metaLabel}>Source Results Found</div><div className={styles.metaValue}>{autoCollection?.sourceResultsFound ?? session?.visibleResultCount ?? 0}</div></div>
                            <div><div className={styles.metaLabel}>Raw Records Captured</div><div className={styles.metaValue}>{autoCollection?.rawRecordsCaptured ?? session?.acceptedCount ?? 0}</div></div>
                            <div><div className={styles.metaLabel}>Unique Companies</div><div className={styles.metaValue}>{autoCollection?.uniqueCompanies ?? capturedUnique ?? 0}</div></div>
                            <div><div className={styles.metaLabel}>Current Query</div><div className={styles.metaValue}>{queryIndex} of {queryTotal || '—'}</div></div>
                            <div><div className={styles.metaLabel}>Query Progress</div><div className={styles.metaValue}>
                                {formatQueryProgressLabel({
                                    queriesCompleted: autoCollection?.queriesCompleted,
                                    queryIndex,
                                    queryTotal: autoCollection?.totalApprovedQueries || queryTotal,
                                    googlePage,
                                })}
                            </div></div>
                            <div><div className={styles.metaLabel}>Current Google Page</div><div className={styles.metaValue}>{googlePage}</div></div>
                            <div><div className={styles.metaLabel}>Last confirmed Google page</div><div className={styles.metaValue}>{autoCollection?.lastConfirmedGooglePage || autoCollection?.lastSuccessfullyCapturedPage || '—'}</div></div>
                            <div><div className={styles.metaLabel}>Pending Queries</div><div className={styles.metaValue}>{pendingQueryCount({ queryIndex, queryTotal: autoCollection?.totalApprovedQueries || queryTotal })}</div></div>
                            <div><div className={styles.metaLabel}>Last agent heartbeat</div><div className={styles.metaValue}>{(autoCollection?.lastAgentHeartbeat || activeSession?.lastHeartbeatAt || agentStatus?.lastUsedAt) ? new Date(autoCollection?.lastAgentHeartbeat || activeSession?.lastHeartbeatAt || agentStatus?.lastUsedAt).toLocaleString() : '—'}</div></div>
                            <div><div className={styles.metaLabel}>Provider State</div><div className={styles.metaValue}>{formatProviderState(autoCollection, activeSession) || '—'}</div></div>
                            <div><div className={styles.metaLabel}>Discovery Status</div><div className={styles.metaValue}>{formatDiscoveryOwnerStatus(autoCollection, activeSession)}</div></div>
                            <div><div className={styles.metaLabel}>Last new result</div><div className={styles.metaValue}>{(autoCollection?.lastNewResultAt || autoCollection?.lastDiscoveryAt || lastProgressAt) ? new Date(autoCollection?.lastNewResultAt || autoCollection?.lastDiscoveryAt || lastProgressAt).toLocaleString() : '—'}</div></div>
                            <div><div className={styles.metaLabel}>Last page advancement</div><div className={styles.metaValue}>{(autoCollection?.lastPageAdvancementAt || autoCollection?.lastDiscoveryAt) ? new Date(autoCollection?.lastPageAdvancementAt || autoCollection?.lastDiscoveryAt).toLocaleString() : '—'}</div></div>
                            <div><div className={styles.metaLabel}>Status</div><div><span className={`${styles.badge} ${statusBadge.cls}`}>{statusBadge.text}</span></div></div>
                            <div><div className={styles.metaLabel}>Processing Backlog</div><div className={styles.metaValue}>{processingBacklog}</div></div>
                            <div><div className={styles.metaLabel}>Stuck Processing</div><div className={styles.metaValue} style={{ color: stuckProcessing ? '#b45309' : undefined }}>{stuckProcessing}</div></div>
                            <div><div className={styles.metaLabel}>Worker</div><div className={styles.metaValue}>{workerActive ? 'Active' : 'Inactive'}</div></div>
                            <div><div className={styles.metaLabel}>Last Worker Heartbeat</div><div className={styles.metaValue}>{lastWorkerHeartbeat ? new Date(lastWorkerHeartbeat).toLocaleString() : '—'}</div></div>
                            <div><div className={styles.metaLabel}>Current Batch</div><div className={styles.metaValue}>{autoProcessing?.currentBatchNumber || 0} · size {autoProcessing?.currentBatchSize || 0}</div></div>
                            <div><div className={styles.metaLabel}>Batches Completed</div><div className={styles.metaValue}>{autoProcessing?.counts?.batchesCompleted || 0}</div></div>
                            <div><div className={styles.metaLabel}>Last Batch Completed</div><div className={styles.metaValue}>{autoProcessing?.lastBatchCompletedAt ? new Date(autoProcessing.lastBatchCompletedAt).toLocaleString() : '—'}</div></div>
                            <div><div className={styles.metaLabel}>Last Processing Error</div><div className={styles.metaValue} style={{ color: visibleRunError ? '#b45309' : undefined }}>{visibleRunError || '—'}</div></div>
                            <div><div className={styles.metaLabel}>1688 Direct</div><div className={styles.metaValue}>Captured {Number(sourceCaptured['1688'] || 0)}</div></div>
                            <div><div className={styles.metaLabel}>Baidu</div><div className={styles.metaValue}>Captured {Number(sourceCaptured.baidu || 0)}</div></div>
                            <div><div className={styles.metaLabel}>Sogou</div><div className={styles.metaValue}>Captured {Number(sourceCaptured.sogou || 0)}</div></div>
                            <div><div className={styles.metaLabel}>360 Search</div><div className={styles.metaValue}>Captured {Number(sourceCaptured.so360 || 0)}</div></div>
                            <div><div className={styles.metaLabel}>Alibaba (indexed)</div><div className={styles.metaValue}>Captured {Number(sourceCaptured.alibaba || 0)}</div></div>
                            <div><div className={styles.metaLabel}>Made-in-China (indexed)</div><div className={styles.metaValue}>Captured {Number(sourceCaptured.made_in_china || 0)}</div></div>
                            <div><div className={styles.metaLabel}>Global Sources (indexed)</div><div className={styles.metaValue}>Captured {Number(sourceCaptured.global_sources || 0)}</div></div>
                            <div><div className={styles.metaLabel}>Google Web</div><div className={styles.metaValue}>Captured {Number(sourceCaptured.google || 0)}</div></div>
                            <div><div className={styles.metaLabel}>Verified Manufacturers</div><div className={styles.metaValue}>{Number(campaignProgress?.verifiedManufacturers || 0)}</div></div>
                            <div><div className={styles.metaLabel}>Chinese-Native Source Appearances</div><div className={styles.metaValue}>{
                                Number(sourceCaptured['1688'] || 0)
                                + Number(sourceCaptured.baidu || 0)
                                + Number(sourceCaptured.sogou || 0)
                                + Number(sourceCaptured.so360 || 0)
                            }</div></div>
                            <div><div className={styles.metaLabel}>Chinese-Language Records</div><div className={styles.metaValue}>{
                                (rows || []).filter((r) => /[\u3400-\u9fff]/.test(`${r.title || ''} ${r.snippet || ''} ${r.companyNameOriginal || ''}`)).length
                            }</div></div>
                            <div><div className={styles.metaLabel}>Chinese Company Websites Crawled</div><div className={styles.metaValue}>{
                                (rows || []).filter((r) => Number(r.pagesCrawled || 0) > 0).length
                            }</div></div>
                            <div><div className={styles.metaLabel}>Companies With Chinese Original Name</div><div className={styles.metaValue}>{
                                (rows || []).filter((r) => /[\u3400-\u9fff]/.test(String(r.companyNameOriginal || ''))).length
                            }</div></div>
                            <div><div className={styles.metaLabel}>Companies With Public Phone</div><div className={styles.metaValue}>{
                                (rows || []).filter((r) => Boolean(r.phone)).length
                            }</div></div>
                            <div><div className={styles.metaLabel}>Companies With Public WeChat</div><div className={styles.metaValue}>{
                                (rows || []).filter((r) => Boolean(r.wechat || r.wechatPublic)).length
                            }</div></div>
                            <div><div className={styles.metaLabel}>English/Export Source Appearances</div><div className={styles.metaValue}>{
                                Number(sourceCaptured.google || 0)
                                + Number(sourceCaptured.alibaba || 0)
                                + Number(sourceCaptured.made_in_china || 0)
                                + Number(sourceCaptured.global_sources || 0)
                            }</div></div>
                        </div>

                        {result?.campaign?._id && (
                            <div style={{
                                margin: '12px 0 0',
                                padding: '12px',
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                background: archiveStatus === 'VERIFIED' ? '#ecfdf5' : (archiveStatus === 'FAILED' ? '#fef2f2' : '#f8fafc'),
                            }}>
                                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                                    {archiveStatus === 'VERIFIED' ? 'Archived' : 'S3 Archive (copy only — Mongo data is kept)'}
                                </div>
                                <div className={styles.metaGrid}>
                                    <div><div className={styles.metaLabel}>Archive Status</div><div className={styles.metaValue}>{archiveStatus}</div></div>
                                    <div><div className={styles.metaLabel}>Record Count</div><div className={styles.metaValue}>{archiveInfo?.archiveRecordCount ?? s3Archive.recordCount ?? 0}</div></div>
                                    <div><div className={styles.metaLabel}>Archive Size</div><div className={styles.metaValue}>{archiveSizeLabel}</div></div>
                                    <div><div className={styles.metaLabel}>Archived Date</div><div className={styles.metaValue}>{(archiveInfo?.archivedAt || s3Archive.archivedAt) ? new Date(archiveInfo?.archivedAt || s3Archive.archivedAt).toLocaleString() : '—'}</div></div>
                                </div>
                                {archiveStatus === 'FAILED' && (archiveInfo?.archiveError || s3Archive.error) ? (
                                    <p style={{ margin: '8px 0 0', fontSize: 12, color: '#991b1b' }}>{archiveInfo?.archiveError || s3Archive.error}</p>
                                ) : null}
                                {showAdminControls && (
                                    <button
                                        type="button"
                                        className={styles.ctrlBtn}
                                        style={{ marginTop: 10, width: 'auto', padding: '8px 12px' }}
                                        disabled={!!busy || archiveStatus === 'ARCHIVING'}
                                        onClick={onArchiveCampaignToS3}
                                    >
                                        {busy === 'archiveS3' ? 'Archiving…' : (archiveStatus === 'FAILED' ? 'Retry Archive' : 'Archive to S3')}
                                    </button>
                                )}
                            </div>
                        )}

                        <div className={styles.kpiRow}>
                            <div className={`${styles.kpi} ${styles.kpiBlue}`}>
                                <div className={styles.kpiTop}><Search size={14} className={styles.kpiIcon} aria-hidden /></div>
                                <div className={styles.kpiCount}>{capturedUnique}</div>
                                <div className={styles.kpiName}>Captured Unique</div>
                                <div className={styles.kpiSub}>Collected</div>
                            </div>
                            <div className={`${styles.kpi} ${styles.kpiOrange}`}>
                                <div className={styles.kpiTop}><RefreshCw size={14} className={styles.kpiIcon} aria-hidden /></div>
                                <div className={styles.kpiCount}>{enrichingCount}</div>
                                <div className={styles.kpiName}>Enriching</div>
                                <div className={styles.kpiSub}>In Progress</div>
                            </div>
                            <div className={`${styles.kpi} ${styles.kpiGreen}`}>
                                <div className={styles.kpiTop}><Database size={14} className={styles.kpiIcon} aria-hidden /></div>
                                <div className={styles.kpiCount}>{enrichedCount}</div>
                                <div className={styles.kpiName}>Enriched</div>
                                <div className={styles.kpiSub}>Completed</div>
                            </div>
                            <div className={`${styles.kpi} ${styles.kpiPurple}`}>
                                <div className={styles.kpiTop}><Sparkles size={14} className={styles.kpiIcon} aria-hidden /></div>
                                <div className={styles.kpiCount}>{qualifiedCount}</div>
                                <div className={styles.kpiName}>Qualified</div>
                                <div className={styles.kpiSub}>Strong/Possible</div>
                            </div>
                            <div className={`${styles.kpi} ${styles.kpiDarkGreen}`}>
                                <div className={styles.kpiTop}><CheckCircle2 size={14} className={styles.kpiIcon} aria-hidden /></div>
                                <div className={styles.kpiCount}>{verifiedCount}</div>
                                <div className={styles.kpiName}>Verified Relevant</div>
                                <div className={styles.kpiSub}>
                                    {verifiedSourceAppearances
                                        ? `${verifiedSourceAppearances} appearances · ${duplicatesConsolidated} consolidated`
                                        : 'Companies'}
                                </div>
                            </div>
                            <div className={`${styles.kpi} ${styles.kpiAmber}`}>
                                <div className={styles.kpiTop}><AlertTriangle size={14} className={styles.kpiIcon} aria-hidden /></div>
                                <div className={styles.kpiCount}>{reviewCount}</div>
                                <div className={styles.kpiName}>Review Required</div>
                                <div className={styles.kpiSub}>Needs Review</div>
                            </div>
                            <div className={`${styles.kpi} ${styles.kpiRed}`}>
                                <div className={styles.kpiTop}><XCircle size={14} className={styles.kpiIcon} aria-hidden /></div>
                                <div className={styles.kpiCount}>{failedCount}</div>
                                <div className={styles.kpiName}>Failed</div>
                                <div className={styles.kpiSub}>{failedCount ? 'Retry available' : 'All Good'}</div>
                            </div>
                        </div>

                        <div className={styles.pipeline} aria-label="Pipeline progress">
                            <div className={`${styles.pipeStep} ${activeStage === 'capture' ? styles.pipeStepActive : ''}`}>
                                <div className={styles.pipeName}>Captured</div>
                                <div className={styles.pipeCount}>{capturedUnique}</div>
                            </div>
                            <div className={`${styles.pipeStep} ${activeStage === 'enrich' ? styles.pipeStepActive : ''}`}>
                                <div className={styles.pipeName}>Enrichment (CP6)</div>
                                <div className={styles.pipeCount}>{enrichedCount}</div>
                            </div>
                            <div className={`${styles.pipeStep} ${activeStage === 'qualify' ? styles.pipeStepActive : ''}`}>
                                <div className={styles.pipeName}>Qualification (CP7)</div>
                                <div className={styles.pipeCount}>{qualifiedCount}</div>
                            </div>
                            <div className={`${styles.pipeStep} ${activeStage === 'verify' ? styles.pipeStepActive : ''}`}>
                                <div className={styles.pipeName}>Verification (CP8)</div>
                                <div className={styles.pipeCount}>{verifiedCount}</div>
                            </div>
                            <div className={`${styles.pipeStep} ${activeStage === 'done' ? styles.pipeStepActive : ''}`}>
                                <div className={styles.pipeName}>Completed</div>
                                <div className={styles.pipeCount}>{verifiedCount}</div>
                            </div>
                        </div>
                        <div className={styles.liveFooter}>
                            <RefreshCw size={12} aria-hidden />
                            Last updated: {secsAgo < 5 ? 'just now' : (`${secsAgo} secs ago`)}
                            {emptyMessage ? (` · ${emptyMessage}`) : ''}
                        </div>
                        <details style={{ marginTop: 12 }} open={processingBacklog > 0}>
                            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#334155' }}>
                                Reconciliation (current campaign — exclusive buckets)
                            </summary>
                            <div style={{ marginTop: 8, fontSize: 12, color: '#334155', lineHeight: 1.6 }}>
                                <div>Captured Unique: {capturedUnique}</div>
                                <div>Waiting: {reconcile.waiting}</div>
                                <div>Processing: {reconcile.processing}</div>
                                <div>Completed: {reconcile.completed}</div>
                                <div>Review Required: {reconcile.reviewRequired}</div>
                                <div>Rejected/Skipped: {reconcile.rejectedSkipped}</div>
                                <div>Failed: {reconcile.failed}</div>
                                <div style={{ fontWeight: 700 }}>
                                    Bucket total: {reconcile.total}
                                    {capturedUnique ? (reconcile.total === capturedUnique ? ' ✓ equals captured' : ` (expected ${capturedUnique})`) : ''}
                                </div>
                                <div style={{ marginTop: 8, color: '#64748b' }}>Stage document counts (may overlap; not added into buckets):</div>
                                <div>CP6 Enrichment docs: {reconcile.stageEnrichmentDocs}</div>
                                <div>CP7 Qualification docs: {reconcile.stageQualificationDocs}</div>
                                <div>CP8 Genuineness docs: {reconcile.stageGenuinenessDocs}</div>
                                <div style={{ marginTop: 6 }}>Processing Backlog: {processingBacklog}</div>
                                <div>Current Batch: {autoProcessing?.currentBatchNumber || 0}</div>
                                <div>Batches Completed: {autoProcessing?.counts?.batchesCompleted || 0}</div>
                                <div>Last Batch Completed: {autoProcessing?.lastBatchCompletedAt ? new Date(autoProcessing.lastBatchCompletedAt).toLocaleString() : '—'}</div>
                                <div>Last Processing Error: {visibleRunError || '—'}</div>
                            </div>
                        </details>
                    </section>

                    <aside className={styles.ctrlCard}>
                        <h3 className={styles.ctrlTitle}>Process Control</h3>
                        <div className={styles.ctrlStack}>
                            {processRunning && !processManual && (
                                <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlPause}`} disabled={!!busy} onClick={onPauseAutomaticProcess}>
                                    Pause Automatic Process
                                    <span>Pause future automatic actions safely.</span>
                                </button>
                            )}
                            {(processPaused || waitingAgent || longAgentOffline || unfinishedDiscovery) && !processManual && (
                                <button
                                    type="button"
                                    className={`${styles.ctrlBtn} ${styles.ctrlResume}`}
                                    disabled={!!busy || (longAgentOffline && agentStatus?.online === false && agentStatus?.connected === false)}
                                    onClick={onResumeAutomaticProcess}
                                >
                                    Resume Campaign
                                    <span>{longAgentOffline
                                        ? (agentStatus?.online || agentStatus?.connected
                                            ? 'Continue from the saved query and Google page.'
                                            : 'Available when Discovery Agent is Ready.')
                                        : (waitingAgent
                                            ? 'Fallback: continue from the last checkpoint after the agent reconnects.'
                                            : 'Continue unfinished records only (no duplicates).')}</span>
                                </button>
                            )}
                            {processManual && (
                                <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlContinue}`} disabled={!!busy} onClick={onContinueAutomaticProcess}>
                                    Continue After Manual Action
                                    <span>{manualActionCopy(activeSession).detail}</span>
                                </button>
                            )}
                            {!ownerStoppedUi && (
                            <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlStopSearch}`} disabled={!canStop && !(autoActive || processRunning) || !!busy} onClick={onStop}>
                                {busy === 'stop' ? 'Stopping...' : 'Stop Search'}
                                <span>Stops this run completely. Collected results are kept.</span>
                            </button>
                            )}
                            {!ownerStoppedUi && (
                            <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlStopAll}`} disabled={!!busy || !(session?._id || result?.session?._id) || inactive} onClick={onStopAllProcessing}>
                                {busy === 'pipeStop' ? 'Stopping...' : 'Stop All Processing'}
                                <span>Stops collection and all future processing safely.</span>
                            </button>
                            )}
                            {!ownerStoppedUi && (
                            <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlExport}`} disabled={!canStop && !canExport} onClick={onStopAndExport}>
                                Stop &amp; Export Current Results
                                <span>Stop and export data with current stage/status.</span>
                            </button>
                            )}
                            {ownerStoppedUi && (
                            <button
                                type="button"
                                className={`${styles.ctrlBtn} ${styles.ctrlExport}`}
                                disabled={capturedUnique < 1}
                                onClick={() => {
                                    const el = document.getElementById('sls-captured-results');
                                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                            >
                                View Results
                                <span>Scroll to collected companies.</span>
                            </button>
                            )}
                            <button
                                type="button"
                                className={`${styles.ctrlBtn} ${styles.ctrlExport}`}
                                disabled={!!busy || capturedUnique < 1}
                                onClick={async () => {
                                    const sid = activeSession?._id || session?._id || result?.session?._id;
                                    if (!sid) return;
                                    setBusy('exportAll');
                                    try {
                                        const response = await dataExtractorApi.simpleLeadSearchExportAllCurrent(sid);
                                        downloadBlobFromAxios(response, `sls-all-current-${sid}.xlsx`);
                                        toast.success('Exported all current campaign data');
                                    } catch (err) {
                                        toast.error(softSessionError(err));
                                    } finally {
                                        setBusy('');
                                    }
                                }}
                            >
                                Export All Current Data to Excel
                                <span>Always available while any records are captured.</span>
                            </button>
                            <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlExportFinal}`} disabled={!!busy || !genuinenessRows.length} onClick={onExportVerified}>
                                Export Final Verified Relevant Results
                                <span>Export verified and reviewed final records.</span>
                            </button>
                            {(inactive || ownerStoppedUi) && (
                                <button type="button" className={`${styles.ctrlBtn} ${styles.ctrlResume}`} onClick={onStartNew}>
                                    Start New Search
                                    <span>Begin another product / location search.</span>
                                </button>
                            )}
                        </div>
                    </aside>
                </div>
            ) : (
                <div className={styles.card}>
                    <div className={styles.emptyState}>{emptyMessage}</div>
                </div>
            )}

            {!!(session?._id || result?.session?._id) && (
                <SimpleLeadSearchLiveActivityPanel
                    activity={liveActivity}
                    filter={liveActivityFilter}
                    onFilterChange={setLiveActivityFilter}
                    displayLimit={liveActivityLimit}
                    onDisplayLimitChange={setLiveActivityLimit}
                    loading={liveActivityLoading}
                />
            )}

            {!!(session?._id || result?.session?._id) && capturedUnique > 0 && (
                <div id="sls-captured-results">
                <SimpleLeadSearchCapturedDataPanel
                    sessionId={session?._id || result?.session?._id}
                    campaignName={campaignName}
                    workflowFilter={workflowHash === '#leads' ? 'lead_created' : (workflowHash === '#verified' ? 'verified' : '')}
                    isChinaCampaign={
                        String(form.country || result?.searchProfile?.country || '').toLowerCase() === 'china'
                        || result?.searchProfile?.searchMarket === 'china_suppliers'
                    }
                    processRunning={processRunning || pipeRunning}
                    onRetrySelected={async (ids) => {
                        const sid = session?._id || result?.session?._id;
                        if (!sid || !ids?.length) return;
                        setBusy('enrich');
                        try {
                            const data = await dataExtractorApi.simpleLeadSearchEnrichmentStart(sid, {
                                mode: 'selected',
                                rawCaptureIds: ids,
                            });
                            setEnrichmentJob(data?.job || null);
                            toast.success('Retry started for selected failed/pending records');
                            await refreshEnrichment(sid);
                        } catch (err) {
                            toast.error(softSessionError(err));
                        } finally {
                            setBusy('');
                        }
                    }}
                    onRetryAllFailed={async () => {
                        const sid = session?._id || result?.session?._id;
                        if (!sid) return;
                        setBusy('enrich');
                        try {
                            const data = await dataExtractorApi.simpleLeadSearchEnrichmentStart(sid, { mode: 'retry_failed' });
                            setEnrichmentJob(data?.job || null);
                            toast.success('Retrying all eligible failed enrichments');
                            await refreshEnrichment(sid);
                        } catch (err) {
                            toast.error(softSessionError(err));
                        } finally {
                            setBusy('');
                        }
                    }}
                />
                </div>
            )}

            {result && (
                <section className={styles.tableCard} ref={verifiedSectionRef} id="de-verified">
                    <div className={styles.tableHead}>
                        <h3>
                            Latest Verified Relevant Results (Live)
                            <span className={`${styles.badge} ${styles.badgeGreen}`}>{verifiedCount} unique</span>
                            {verifiedSourceAppearances > 0 && (
                                <span className={`${styles.badge} ${styles.badgeGrey}`} style={{ marginLeft: 6 }}>
                                    {verifiedSourceAppearances} appearances
                                </span>
                            )}
                        </h3>
                    </div>
                    <div className={styles.tableWrap}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Unique Company</th>
                                    <th>Primary Website</th>
                                    <th>Contact</th>
                                    <th>Verification Status</th>
                                    <th>Source Appearances</th>
                                    <th>Status</th>
                                    <th>Evidence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {latestVerified.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: 16, color: '#64748b' }}>
                                            Verified results will appear here automatically after Checkpoint 8.
                                        </td>
                                    </tr>
                                ) : (
                                    latestVerified.map((row) => (
                                        <tr key={String(row.id)}>
                                            <td>{row.idx}</td>
                                            <td>
                                                <div className={styles.companyCell}>
                                                    <strong>{row.companyName}</strong>
                                                    {(row.sourceAppearances || 1) > 1 && (
                                                        <div className={styles.companyDomain}>Captured {row.sourceAppearances} times</div>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                {row.websiteUrl ? (
                                                    <a href={row.websiteUrl} target="_blank" rel="noreferrer">{row.domain || row.websiteUrl}</a>
                                                ) : (row.domain || '—')}
                                            </td>
                                            <td>
                                                <div className={styles.contactCell}>
                                                    <button
                                                        type="button"
                                                        className={styles.contactMoreBtn}
                                                        onClick={() => setVerifiedContactExpand((cur) => (cur === `${row.id}:email` ? '' : `${row.id}:email`))}
                                                    >
                                                        {row.emailShort || row.email || '—'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.contactMoreBtn}
                                                        onClick={() => setVerifiedContactExpand((cur) => (cur === `${row.id}:phone` ? '' : `${row.id}:phone`))}
                                                    >
                                                        {row.phoneShort || row.phone || ''}
                                                    </button>
                                                    {(row.whatsappShort || row.whatsapp) && (
                                                        <button
                                                            type="button"
                                                            className={styles.contactMoreBtn}
                                                            onClick={() => setVerifiedContactExpand((cur) => (cur === `${row.id}:whatsapp` ? '' : `${row.id}:whatsapp`))}
                                                        >
                                                            WA: {row.whatsappShort || row.whatsapp}
                                                        </button>
                                                    )}
                                                    {verifiedContactExpand.startsWith(`${row.id}:`) && (
                                                        <div className={styles.contactExpandBox}>
                                                            {(verifiedContactExpand.endsWith(':email') ? (row.emailsAll || [])
                                                                : verifiedContactExpand.endsWith(':whatsapp') ? (row.whatsappAll || [])
                                                                    : (row.phonesAll || [])).map((item, i) => (
                                                                <div key={`${row.id}-c-${i}`} className={styles.contactExpandItem}>
                                                                    <strong>{item.value || '—'}</strong>
                                                                    <span>Source: {item.sourceUrl || '—'}</span>
                                                                    <span>Evidence: {item.evidenceType || '—'}</span>
                                                                    <span>First captured: {item.firstCapturedAt ? new Date(item.firstCapturedAt).toLocaleString() : '—'}</span>
                                                                    <span>Last verified: {item.lastVerifiedAt ? new Date(item.lastVerifiedAt).toLocaleString() : '—'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td><span className={`${styles.badge} ${genuinenessCls(row.genuineness)}`}>{row.statusLabel || genuinenessLabelFn(row.genuineness)}</span></td>
                                            <td>{row.sourceAppearances ?? 1}</td>
                                            <td>
                                                <span className={`${styles.badge} ${row.status === 'Completed' ? styles.badgeGreen : row.status === 'Failed' ? styles.badgeRed : row.status === 'Review Required' ? styles.badgeAmber : styles.badgeBlue}`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className={styles.linkBtn}
                                                    onClick={() => setEvidenceCompanyId(String(row.id) === evidenceCompanyId ? '' : String(row.id))}
                                                >
                                                    {String(row.id) === evidenceCompanyId ? 'Hide' : 'View Evidence'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {evidenceCompanyId && latestVerified.some((r) => String(r.id) === evidenceCompanyId) && (
                        <div style={{ marginTop: 12, padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
                            <strong>Source evidence</strong>
                            <div className={styles.tableWrap} style={{ marginTop: 8 }}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>#</th>
                                            <th>Source Title</th>
                                            <th>Query</th>
                                            <th>Page</th>
                                            <th>URL</th>
                                            <th>Captured</th>
                                            <th>CP6</th>
                                            <th>CP7</th>
                                            <th>CP8</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(latestVerified.find((r) => String(r.id) === evidenceCompanyId)?.evidence || []).map((ev, i) => (
                                            <tr key={ev.appearanceId || ev.captureId || i}>
                                                <td>{i + 1}</td>
                                                <td>{ev.sourceTitle || '—'}</td>
                                                <td>{ev.query || '—'}</td>
                                                <td>{ev.googlePageIndex ?? '—'}</td>
                                                <td>{ev.sourceUrl || ev.websiteUrl || '—'}</td>
                                                <td>{ev.capturedAt ? new Date(ev.capturedAt).toLocaleString() : '—'}</td>
                                                <td>{ev.cp6?.enrichmentStatus || '—'}</td>
                                                <td>{ev.cp7?.ownerDecision || ev.cp7?.systemDecision || '—'}</td>
                                                <td>{ev.cp8?.ownerDecision || ev.cp8?.systemDecision || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    <div className={styles.tableFoot}>
                        <button
                            type="button"
                            className={styles.linkBtn}
                            onClick={() => {
                                const el = document.getElementById('sls-details-verified');
                                if (el) {
                                    el.open = true;
                                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }
                            }}
                        >
                            View All Verified Relevant Results <ChevronRight size={16} aria-hidden />
                        </button>
                    </div>
                </section>
            )}


            <details className={styles.details} id="sls-details-advanced">
                <summary onClick={(e) => { e.preventDefault(); setShowAdminControls((v) => !v); }}>Advanced / Admin Controls</summary>
                {showAdminControls && (
                    <div className={styles.detailsBody}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 12 }}>
                            <input type="checkbox" checked={!!ownerFullAuto} onChange={(e) => setOwnerFullAuto(e.target.checked)} />
                            Full automatic process after Search (owner default ON)
                        </label>
                        <button type="button" disabled={!!busy || previewBusy || formLocked} onClick={onGenerateQueries} style={btn('#4338ca', !!busy || previewBusy || formLocked)}>
                            {previewBusy ? 'Generating...' : 'Generate Queries (preview)'}
                        </button>
                        <div style={{ marginTop: 14 }}>
{showAdminControls && (
                    <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 8, border: '1px dashed #a5b4fc', background: '#eef2ff' }}>
                        <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Advanced / Admin Controls — Auto Collection</h3>

                        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#3730a3' }}>
                            Auto Collection will move through the selected Google pages and generated queries. It will pause for CAPTCHA or consent and can be stopped anytime.
                        </p>
                        <button
                            type="button"
                            onClick={() => setShowAutoOptions((v) => !v)}
                            style={{
                                ...btn('#4338ca', false),
                                marginBottom: showAutoOptions ? 12 : 12,
                                background: '#fff',
                                color: '#4338ca',
                                border: '1px solid #a5b4fc',
                            }}
                        >
                            {showAutoOptions ? 'Hide Auto Collection Options' : 'Auto Collection Options'}
                        </button>
                        {showAutoOptions && (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: 12,
                                marginBottom: 14,
                                padding: 12,
                                borderRadius: 8,
                                background: '#fff',
                                border: '1px solid #e0e7ff',
                            }}>
                                <label style={{ ...labelStyle, gridColumn: '1 / -1' }}>
                                    Collection Mode
                                    <select
                                        value={formManualLimit ? 'fixed_target' : (autoCollectionOptions.collectionMode || 'unlimited')}
                                        disabled={autoActive}
                                        onChange={(e) => {
                                            const collectionMode = e.target.value;
                                            setAutoCollectionOptions((o) => ({
                                                ...o,
                                                collectionMode,
                                                requestedCaptureTarget: collectionMode === 'fixed_target'
                                                    ? (Number(o.requestedCaptureTarget) > 0 ? o.requestedCaptureTarget : '')
                                                    : 0,
                                            }));
                                        }}
                                        style={fieldStyle}
                                    >
                                        <option value="unlimited">Unlimited — Recommended / Default</option>
                                        <option value="fixed_target">Manual Limit</option>
                                    </select>
                                </label>
                                {(formManualLimit || String(autoCollectionOptions.collectionMode) === 'fixed_target') ? (
                                    <label style={labelStyle}>
                                        Maximum Results
                                        <input
                                            type="number"
                                            min={1}
                                            max={500}
                                            placeholder="e.g. 200"
                                            value={autoCollectionOptions.requestedCaptureTarget || ''}
                                            disabled={autoActive}
                                            onChange={(e) => setAutoCollectionOptions((o) => ({
                                                ...o,
                                                collectionMode: 'fixed_target',
                                                requestedCaptureTarget: e.target.value,
                                            }))}
                                            style={fieldStyle}
                                        />
                                    </label>
                                ) : null}
                                <label style={labelStyle}>
                                    Mode
                                    <select
                                        value={autoCollectionOptions.mode || 'manual'}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, mode: e.target.value }))}
                                        style={fieldStyle}
                                    >
                                        <option value="manual">Manual</option>
                                        <option value="auto">Auto Collection</option>
                                    </select>
                                </label>
                                <label style={labelStyle}>
                                    Page Collection Mode
                                    <select
                                        value={autoCollectionOptions.pageCollectionMode || 'until_no_more'}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, pageCollectionMode: e.target.value }))}
                                        style={fieldStyle}
                                    >
                                        <option value="until_no_more">Until No More Results — No Fixed Page Limit</option>
                                        <option value="fixed">Fixed Pages</option>
                                        <option value="batches">Continue in Batches</option>
                                    </select>
                                </label>
                                {(autoCollectionOptions.pageCollectionMode || 'until_no_more') === 'fixed' ? (
                                <label style={labelStyle}>
                                    Max pages per query (1–10)
                                    <input
                                        type="number"
                                        min={1}
                                        max={10}
                                        value={autoCollectionOptions.maxPagesPerQuery}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, maxPagesPerQuery: e.target.value }))}
                                        style={fieldStyle}
                                    />
                                </label>
                                ) : null}
                                {(autoCollectionOptions.pageCollectionMode === 'batches' || autoCollectionOptions.pageCollectionMode === 'until_no_more') ? (
                                    <>
                                        {autoCollectionOptions.pageCollectionMode === 'batches' ? (
                                            <>
                                                <label style={labelStyle}>
                                                    Pages per batch (1–10)
                                                    <input type="number" min={1} max={10} value={autoCollectionOptions.pagesPerBatch}
                                                        disabled={autoActive}
                                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, pagesPerBatch: e.target.value }))}
                                                        style={fieldStyle} />
                                                </label>
                                                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                                                    <input type="checkbox" checked={!!autoCollectionOptions.pauseAfterEachBatch}
                                                        disabled={autoActive}
                                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, pauseAfterEachBatch: e.target.checked }))} />
                                                    Pause after each batch
                                                </label>
                                            </>
                                        ) : null}
                                        <label style={labelStyle}>
                                            Max safety pages per query (10–50)
                                            <input type="number" min={10} max={50} value={autoCollectionOptions.maxSafetyPagesPerQuery}
                                                disabled={autoActive}
                                                onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, maxSafetyPagesPerQuery: e.target.value }))}
                                                style={fieldStyle} />
                                        </label>
                                    </>
                                ) : null}
                                <label style={labelStyle}>
                                    Max generated queries (1–8)
                                    <input
                                        type="number"
                                        min={1}
                                        max={24}
                                        value={autoCollectionOptions.maxQueries}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, maxQueries: e.target.value }))}
                                        style={fieldStyle}
                                    />
                                </label>
                                <label style={labelStyle}>
                                    Delay min (sec)
                                    <input
                                        type="number"
                                        min={5}
                                        max={120}
                                        value={autoCollectionOptions.delayMinSec}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, delayMinSec: e.target.value }))}
                                        style={fieldStyle}
                                    />
                                </label>
                                <label style={labelStyle}>
                                    Delay max (sec)
                                    <input
                                        type="number"
                                        min={5}
                                        max={180}
                                        value={autoCollectionOptions.delayMaxSec}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, delayMaxSec: e.target.value }))}
                                        style={fieldStyle}
                                    />
                                </label>
                                <label style={labelStyle}>
                                    Stop at campaign unique (optional)
                                    <input
                                        type="number"
                                        min={0}
                                        placeholder="Leave blank"
                                        value={autoCollectionOptions.stopAtUnique}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, stopAtUnique: e.target.value }))}
                                        style={fieldStyle}
                                    />
                                </label>
                                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                                    <input
                                        type="checkbox"
                                        checked={!!autoCollectionOptions.stopOnNoNewUniquePages}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, stopOnNoNewUniquePages: e.target.checked }))}
                                    />
                                    Stop when no new unique for 2 pages
                                </label>
                                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                                    <input
                                        type="checkbox"
                                        checked={!!autoCollectionOptions.autoEnrichAfter}
                                        disabled={autoActive}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, autoEnrichAfter: e.target.checked }))}
                                    />
                                    Auto-enrich after collection
                                </label>
                                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                                    <input
                                        type="checkbox"
                                        checked={!!autoCollectionOptions.autoQualifyAfterEnrich}
                                        disabled={autoActive || !autoCollectionOptions.autoEnrichAfter}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, autoQualifyAfterEnrich: e.target.checked }))}
                                    />
                                    Auto-qualify after enrichment
                                </label>
                                <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
                                    <input
                                        type="checkbox"
                                        checked={!!autoCollectionOptions.autoVerifyAfterQualify}
                                        disabled={autoActive || !autoCollectionOptions.autoQualifyAfterEnrich}
                                        onChange={(e) => setAutoCollectionOptions((o) => ({ ...o, autoVerifyAfterQualify: e.target.checked }))}
                                    />
                                    Auto-verify genuineness after qualification
                                </label>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: autoCollection ? 12 : 0 }}>
                            {!autoActive && (
                            <button
                                type="button"
                                disabled={!canStartAuto}
                                onClick={onStartAutoCollection}
                                style={btn('#4f46e5', !canStartAuto)}
                            >
                                {busy === 'autoStart' ? 'Starting...' : 'Start Auto Collection'}
                            </button>
                            )}
                            {autoRunning && (
                            <button
                                type="button"
                                disabled={!!busy}
                                onClick={onPauseAutoCollection}
                                style={btn('#b45309', !!busy)}
                            >
                                {busy === 'autoPause' ? 'Pausing...' : 'Pause Auto Collection'}
                            </button>
                            )}
                            {autoPausedOwner && (
                            <button
                                type="button"
                                disabled={!!busy}
                                onClick={onResumeAutoCollection}
                                style={btn('#0369a1', !!busy)}
                            >
                                {busy === 'autoResume' ? 'Resuming...' : 'Resume Auto Collection'}
                            </button>
                            )}
                            {autoActive && !autoPausedManual && (
                            <button
                                type="button"
                                disabled={!!busy}
                                onClick={onStopAutoCollection}
                                style={btn('#b91c1c', !!busy)}
                            >
                                {busy === 'autoStop' ? 'Stopping...' : 'Stop Auto Collection'}
                            </button>
                            )}
                            {autoPausedManual && (
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={onContinueAutoCollection}
                                    style={btn('#d97706', !!busy)}
                                >
                                    {busy === 'autoContinue' ? 'Continuing...' : 'Continue Auto Collection'}
                                </button>
                            )}
                            {(autoStatus === 'paused_batch' || autoCollection?.canContinueBatch) && (
                                <>
                                    <div style={{ width: '100%', fontSize: 13, color: '#3730a3', background: '#eef2ff', padding: 10, borderRadius: 6 }}>
                                        {autoCollection?.batchMessage || 'Batch completed. More Google pages may be available.'}
                                    </div>
                                    <button type="button" disabled={!!busy} onClick={onContinueNextBatch} style={btn('#4f46e5', !!busy)}>
                                        {busy === 'autoBatch' ? 'Continuing...' : ('Continue Next ' + (autoCollection?.pagesPerBatch || autoCollectionOptions.pagesPerBatch || 10) + ' Pages')}
                                    </button>
                                    <button type="button" disabled={!!busy} onClick={onAutoNextQuery} style={btn('#0369a1', !!busy)}>
                                        {busy === 'autoNextQ' ? 'Opening...' : 'Move to Next Generated Query'}
                                    </button>
                                    <button type="button" disabled={!!busy || !canStop} onClick={onStopAndExport} style={btn('#9a3412', !!busy || !canStop)}>
                                        {busy === 'stopExport' ? 'Exporting...' : 'Stop & Export'}
                                    </button>
                                    <button type="button" disabled={!!busy} onClick={onMarkQueryComplete} style={btn('#475569', !!busy)}>
                                        {busy === 'completeQuery' ? 'Saving...' : 'Complete Query'}
                                    </button>
                                </>
                            )}
                            {autoCollection?.resumeMessage && ['paused', 'paused_owner', 'stopped', 'failed', 'paused_batch'].includes(autoStatus) && (
                                <div style={{ width: '100%', fontSize: 12, color: '#334155' }}>
                                    {autoCollection.resumeMessage}
                                    {' '}
                                    <button type="button" disabled={!!busy} onClick={() => onResumeCheckpoint(false)} style={{ ...btn('#0369a1', !!busy), padding: '4px 8px', fontSize: 12 }}>
                                        Resume Auto Collection
                                    </button>
                                    <button type="button" disabled={!!busy} onClick={() => onResumeCheckpoint(true)} style={{ ...btn('#a16207', !!busy), padding: '4px 8px', fontSize: 12, marginLeft: 6 }}>
                                        Restart Query
                                    </button>
                                </div>
                            )}
                        </div>
                        {autoCollection && autoStatus !== 'idle' && (
                            <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #c7d2fe', fontSize: 13, color: '#312e81' }}>
                                <strong>{autoCollection.searchLabel || autoCollection.ownerDisplayLabel || formatSimpleSearchLabel(form.product, form.businessTypes, autoCollection.locationLabel || form.city) || autoCollection.uiLabel || 'Auto Collection'}</strong>
                                <div style={{ marginTop: 6 }}>
                                    Query {autoCollection.queryIndex || 1} of {autoCollection.queryTotal || autoCollectionOptions.maxQueries || 1}
                                    {autoCollection.businessType ? (' · Business Type: ' + autoCollection.businessType) : ''}
                                    {autoCollection.locationLabel ? (' · Location: ' + autoCollection.locationLabel) : ''}
                                    {(autoCollection.pageCollectionMode === 'batches' || autoCollection.settings?.pageCollectionMode === 'batches') ? ` · Batch ${autoCollection.currentBatch || 1}` : ''}
                                    {' · '}Google Page {autoCollection.googlePage || autoCollection.lastSuccessfullyCapturedPage || 1}
                                    {(autoCollection.pageCollectionMode === 'fixed' || autoCollection.settings?.pageCollectionMode === 'fixed')
                                        ? (autoCollection.maxPagesPerQuery != null ? ` of ${autoCollection.maxPagesPerQuery}` : '')
                                        : (autoCollection.maxSafetyPagesPerQuery ? ` (safety max ${autoCollection.maxSafetyPagesPerQuery})` : '')}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, color: '#4338ca' }}>
                                    Pages completed for current query: {autoCollection.pagesCapturedThisQuery ?? 0}
                                    {' · '}Visible this page: {autoCollection.visibleThisPage ?? 0}
                                    {' · '}New unique this page: {autoCollection.newUniqueThisPage ?? 0}
                                    {' · '}Existing updated: {autoCollection.existingUpdatedThisPage ?? 0}
                                    {' · '}Campaign unique: {autoCollection.campaignUnique ?? captureStats?.uniqueResultCount ?? 0}
                                </div>
                                {autoRunning && (
                                    <div style={{ marginTop: 4, fontSize: 12, color: '#64748b' }}>
                                        Next action in {autoCollection.nextActionInSeconds ?? 0} seconds
                                    </div>
                                )}
                                {autoCollection.lastErrorMessage && (
                                    <div style={{ marginTop: 6, fontSize: 12, color: '#b45309' }}>
                                        {autoCollection.lastErrorMessage}
                                    </div>
                                )}
                                {(autoStatus === 'stopped' || autoStatus === 'completed' || autoStatus === 'failed') && autoCollection.summary && (
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#475569' }}>
                                        Stop summary: {autoCollection.summary.stopReason || autoStatus}
                                        {' · '}pages {autoCollection.summary.pagesProcessed ?? 0}
                                        {' · '}queries {autoCollection.summary.queriesProcessed ?? 0}
                                        {' · '}new unique {autoCollection.summary.newUniqueResults ?? 0}
                                        {' · '}updated {autoCollection.summary.existingUpdated ?? 0}
                                        {' · '}campaign unique {autoCollection.summary.finalCampaignUnique ?? autoCollection.campaignUnique ?? 0}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    )}
                    
                    {showAdminControls && (
                    <div style={{ marginBottom: 16, padding: '14px 16px', borderRadius: 8, border: '1px dashed #a5b4fc', background: '#eef2ff' }}>
                        <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Advanced / Admin Controls — Automatic Processing</h3>
                        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#3730a3' }}>
                            Owner full-auto already enables these. Use only for manual override. CRM Lead creation stays OFF.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 12 }}>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={!!autoProcessingOptions.autoEnrich}
                                    onChange={(e) => setAutoProcessingOptions((o) => ({ ...o, autoEnrich: e.target.checked }))} />
                                Auto Enrichment
                            </label>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={!!autoProcessingOptions.autoQualify}
                                    onChange={(e) => setAutoProcessingOptions((o) => ({ ...o, autoQualify: e.target.checked }))} />
                                Auto Qualification
                            </label>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={!!autoProcessingOptions.autoVerify}
                                    onChange={(e) => setAutoProcessingOptions((o) => ({ ...o, autoVerify: e.target.checked }))} />
                                Auto Genuineness Verification
                            </label>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={!!autoProcessingOptions.continueWhileCollecting}
                                    onChange={(e) => setAutoProcessingOptions((o) => ({ ...o, continueWhileCollecting: e.target.checked }))} />
                                Continue while collecting
                            </label>
                            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input type="checkbox" checked={!!autoProcessingOptions.retryTemporaryFailures}
                                    onChange={(e) => setAutoProcessingOptions((o) => ({ ...o, retryTemporaryFailures: e.target.checked }))} />
                                Retry temporary failures
                            </label>
                            <label style={{ fontSize: 12 }}>
                                Batch size
                                <input type="number" min={1} max={50} value={autoProcessingOptions.batchSize}
                                    onChange={(e) => setAutoProcessingOptions((o) => ({ ...o, batchSize: e.target.value }))}
                                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
                            </label>
                            <label style={{ fontSize: 12 }}>
                                Max retry attempts
                                <input type="number" min={0} max={5} value={autoProcessingOptions.maxRetryAttempts}
                                    onChange={(e) => setAutoProcessingOptions((o) => ({ ...o, maxRetryAttempts: e.target.value }))}
                                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 6 }} />
                            </label>
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button type="button" disabled={!!busy} onClick={onEnableCompleteAutomaticProcessing} style={btn('#4338ca', !!busy)}>
                                Enable Complete Automatic Processing
                            </button>
                            <button type="button" disabled={!!busy} onClick={onEnableAutoProcessing} style={btn('#0369a1', !!busy)}>
                                {busy === 'pipeEnable' ? 'Enabling...' : 'Start Automatic Processing'}
                            </button>
                            <button type="button" disabled={!!busy} onClick={onPauseAutoProcessing} style={btn('#b45309', !!busy)}>
                                Pause Automatic Processing
                            </button>
                            <button type="button" disabled={!!busy} onClick={onResumeAutoProcessing} style={btn('#0f766e', !!busy)}>
                                {busy === 'pipeResume' ? 'Resuming…' : 'Resume Campaign'}
                            </button>
                            <button type="button" disabled={!!busy} onClick={onStopAutoProcessing} style={btn('#b91c1c', !!busy)}>
                                Stop Automatic Processing
                            </button>
                        </div>
                    </div>
                    )}
{/* ADMIN_AUTO_COLLECTION_END */}

                    <details style={{ marginBottom: 16 }}>
                        <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#334155' }}>
                            Advanced / Debug Details — generated Google queries
                        </summary>
                        <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0' }}>
                            Internal operators such as -jobs / -course / -training stay here. The normal search label is Product · Business Type · Location.
                        </p>
                    <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
                        {generatedQueries.length === 0 ? (
                            <li style={{ padding: '8px 10px', fontSize: 13, color: '#64748b' }}>
                                No generated queries yet. Start a search or use Generate Queries (preview).
                            </li>
                        ) : null}
                        {generatedQueries.map((q, qi) => (
                            <li
                                key={String(q?.id || q?.queryText || qi)}
                                style={{
                                    padding: '8px 10px',
                                    marginBottom: 6,
                                    borderRadius: 8,
                                    border: (q?.isCurrent || q?.recommended) ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                    background: (q?.isCurrent || q?.recommended) ? '#eff6ff' : '#fff',
                                    fontSize: 13,
                                }}
                            >
                                {(q?.isCurrent || q?.recommended) && (
                                    <span style={{ color: '#2563eb', fontWeight: 700, marginRight: 8 }}>
                                        {q?.isCurrent ? 'Current' : 'Recommended'}
                                    </span>
                                )}
                                <span style={{
                                    display: 'inline-block',
                                    marginRight: 8,
                                    padding: '1px 6px',
                                    borderRadius: 999,
                                    background: '#e2e8f0',
                                    fontSize: 11,
                                    fontWeight: 600,
                                }}>
                                    {q?.slsCaptureStatus || q?.status || 'pending'}
                                </span>
                                <span style={{ marginRight: 8 }}>{q?.ownerDisplayLabel || ''}</span>
                                <code style={{ fontSize: 12 }}>{q?.queryText || '—'}</code>
                                {q?.captureEvents != null && (
                                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                        events {q.captureEvents || 0}
                                        {' · '}visible {q.visibleResults || 0}
                                        {' · '}new unique {q.newUniqueRecords || 0}
                                        {' · '}updated {q.existingRecordsUpdated || 0}
                                        {' · '}last page {q.lastPageCaptured || 0}
                                        {q.lastCapturedAt ? (' · ' + new Date(q.lastCapturedAt).toLocaleString()) : ''}
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                    </details>

                    {(inactive || showAdminControls || !ownerFullAuto) && (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
                        {inactive ? (
                            <>
                                {status === 'failed' && (
                                    <button type="button" onClick={onStartNew} style={btn('#d97706', false)}>
                                        Retry
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={!canExport}
                                    onClick={onExportCurrent}
                                    style={btn('#9a3412', !canExport)}
                                >
                                    {busy === 'export' ? 'Exporting...' : 'Export Current Results'}
                                </button>
                                <button type="button" onClick={onStartNew} style={btn('#2563eb', false)}>
                                    Start New Search
                                </button>
                            </>
                        ) : (
                            <>
                                {(showAdminControls || !ownerFullAuto) && !autoActive && (
                                <>
                                {isManual && !ownerFullAuto && (
                                    <button
                                        type="button"
                                        disabled={!!busy}
                                        onClick={onContinueAfterManual}
                                        style={btn('#d97706', !!busy)}
                                    >
                                        {busy === 'continue' ? 'Continuing...' : 'Continue After Manual Action'}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={!!busy || !canCapture}
                                    onClick={onOpenNextPage}
                                    style={btn('#0f766e', !!busy || !canCapture)}
                                >
                                    {busy === 'nextPage' ? 'Opening page...' : 'Open Next Google Page'}
                                </button>
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={onOpenNextQuery}
                                    style={btn('#0369a1', !!busy)}
                                >
                                    {busy === 'nextQuery' ? 'Opening query...' : 'Open Next Generated Query'}
                                </button>
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={onSkipQuery}
                                    style={btn('#a16207', !!busy)}
                                >
                                    {busy === 'skipQuery' ? 'Skipping...' : 'Skip Current Query'}
                                </button>
                                <button
                                    type="button"
                                    disabled={!!busy}
                                    onClick={onMarkQueryComplete}
                                    style={btn('#475569', !!busy)}
                                >
                                    {busy === 'completeQuery' ? 'Saving...' : 'Mark Query Complete'}
                                </button>
                                <button
                                    type="button"
                                    disabled={!canCapture || (samePageCaptureLocked && !!captureCountRef.current)}
                                    onClick={onCapture}
                                    style={btn('#0f766e', !canCapture || (samePageCaptureLocked && !!captureCountRef.current))}
                                    title={samePageCaptureLocked ? 'Same Google page already captured. Use Open Next Google Page for new results.' : ''}
                                >
                                    {busy === 'capture'
                                        ? 'Capturing...'
                                        : (samePageCaptureLocked && captureCountRef.current
                                            ? 'Same Page Captured'
                                            : (captureCountRef.current ? 'Recapture Same Page' : 'Capture Visible Results'))}
                                </button>
                                </>
                                )}
                                {!ownerFullAuto && (
                                <>
                                <button
                                    type="button"
                                    disabled={!canStop}
                                    onClick={onStop}
                                    style={btn('#b91c1c', !canStop)}
                                >
                                    {busy === 'stop' ? 'Stopping...' : 'Stop Search'}
                                </button>
                                <button
                                    type="button"
                                    disabled={!canStop}
                                    onClick={onStopAndExport}
                                    style={btn('#9a3412', !canStop)}
                                >
                                    {busy === 'stopExport' ? 'Exporting...' : 'Stop & Export Current Results'}
                                </button>
                                </>
                                )}
                                {(showAdminControls || !ownerFullAuto) && !autoActive && (
                                <div style={{ width: '100%', fontSize: 12, color: '#b45309', marginTop: 4 }}>
                                    Capture Again captures the same visible page. Use Open Next Google Page for new results.
                                </div>
                                )}
                                {autoActive && (showAdminControls || !ownerFullAuto) && (
                                <div style={{ width: '100%', fontSize: 12, color: '#4338ca', marginTop: 4 }}>
                                    Auto Collection is controlling capture and page/query advancement.
                                </div>
                                )}
                                {(showAdminControls || !ownerFullAuto) && !autoActive && (
                                <button
                                    type="button"
                                    disabled={!canComplete}
                                    onClick={onComplete}
                                    style={btn('#475569', !canComplete)}
                                >
                                    {busy === 'complete' ? 'Completing...' : 'Complete Session'}
                                </button>
                                )}
                            </>
                        )}
                    </div>
                    )}

                    {!!campaignProgress?.sourceStatus?.length && (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12, fontSize: 12 }}>
                            {campaignProgress.sourceStatus.map((s) => (
                                <span key={s.source} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 8px' }}>
                                    <strong>{s.source}:</strong> {s.status}
                                    {` · Captured ${Number(s.captured || 0)}`}
                                    {s.queryCount ? ` (${s.queryCount} queries)` : ''}
                                </span>
                            ))}
                        </div>
                    )}

                    {captureStats && (
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
                            <span><strong>Visible:</strong> {captureStats.visibleResultCount ?? 0}</span>
                            <span><strong>Accepted (appearances):</strong> {captureStats.acceptedCount ?? 0}</span>
                            <span><strong>Inserted:</strong> {captureStats.insertedCount ?? 0}</span>
                            <span><strong>Updated:</strong> {captureStats.updatedExistingCount ?? 0}</span>
                            <span><strong>Unwanted / rejected (Stage A):</strong> {captureStats.unwantedRejectedCount ?? captureStats.stageARejected ?? 0}</span>
                            <span><strong>Possible match:</strong> {captureStats.possibleMatchCount ?? captureStats.stageAPossibleMatch ?? 0}</span>
                            <span><strong>Campaign unique:</strong> {captureStats.uniqueResultCount ?? 0}</span>
                            <span><strong>Google page:</strong> {captureStats.googlePageIndex ?? campaignProgress?.googlePage ?? 1}</span>
                            <span><strong>Capture events:</strong> {captureStats.captureEventCount ?? 0}</span>
                        </div>
                    )}

                    <h3 style={{ fontSize: 15, marginBottom: 8 }}>
                        Captured results ({rows.length})
                    </h3>
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ padding: 8 }}>Sel</th>
                                    <th style={{ padding: 8 }}>Title (original)</th>
                                    <th style={{ padding: 8 }}>Source</th>
                                    <th style={{ padding: 8 }}>Domain</th>
                                    <th style={{ padding: 8 }}>URL</th>
                                    <th style={{ padding: 8 }}>Stage A</th>
                                    <th style={{ padding: 8 }}>Review Status</th>
                                    <th style={{ padding: 8 }}>Duplicate</th>
                                    <th style={{ padding: 8 }}>Pos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ padding: 12, color: '#64748b' }}>
                                            Results appear here as pages are collected. China campaigns keep original Chinese titles.
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((r) => (
                                        <tr key={String(r._id || r.resultUrlNormalized)} style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: 8 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRawIds.includes(String(r._id))}
                                                    onChange={() => toggleSelectRaw(r._id)}
                                                />
                                            </td>
                                            <td style={{ padding: 8 }}>{r.title || '-'}</td>
                                            <td style={{ padding: 8 }}>{r.source || r.sourceName || '-'}</td>
                                            <td style={{ padding: 8 }}>{r.displayDomain || '-'}</td>
                                            <td style={{ padding: 8, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {r.resultUrl || r.resultUrlOriginal || r.resultUrlNormalized || '-'}
                                            </td>
                                            <td style={{ padding: 8 }}>{r.stageALabel || r.stageADecision || '-'}</td>
                                            <td style={{ padding: 8 }}>{r.reviewStatus || 'Unverified'}</td>
                                            <td style={{ padding: 8 }}>{r.duplicateStatus || '-'}</td>
                                            <td style={{ padding: 8 }}>{r.resultPosition ?? '-'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                        </div>
                    </div>
                )}
            </details>

            <details className={styles.details} id="sls-details-enriched">
                <summary>Enriched Contact Details</summary>
                <div className={styles.detailsBody}>
{(session || result?.session) && (
                <section style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: 15, marginBottom: 8 }}>Checkpoint 6 — Website Enrichment</h3>
                    {pipeActive && (
                        <div style={{ fontSize: 12, color: '#166534', marginBottom: 8 }}>
                            Automatic enrichment / qualification / verification is running. Stage tables update automatically.
                        </div>
                    )}
                    <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                        Collects public website contact details only. Not AI qualification. Does not create CRM Leads.
                    </p>
                    {(showAdminControls || showManualStages || !ownerFullAuto) && (
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                        <button type="button" disabled={!!busy} onClick={onEnrichSelected} style={btn('#0f766e', !!busy)}>
                            Enrich Selected
                        </button>
                        <button type="button" disabled={!!busy} onClick={onEnrichAll} style={btn('#0369a1', !!busy)}>
                            {busy === 'enrich' ? 'Starting...' : 'Enrich All Unverified'}
                        </button>
                        <button type="button" disabled={!!busy} onClick={onStopEnrichment} style={btn('#b91c1c', !!busy)}>
                            {busy === 'enrichStop' ? 'Stopping...' : 'Stop Enrichment'}
                        </button>
                        <button type="button" disabled={!!busy} onClick={onEnrichRetry} style={btn('#d97706', !!busy)}>
                            Retry Failed
                        </button>
                        <button type="button" disabled={!!busy || !enrichmentRows.length} onClick={onExportEnriched} style={btn('#9a3412', !!busy || !enrichmentRows.length)}>
                            {busy === 'enrichExport' ? 'Exporting...' : 'Export Enriched Results'}
                        </button>
                    </div>
                    )}
                    {enrichmentJob && (
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#334155' }}>
                            <strong>Job:</strong> {enrichmentJob.status}
                            {' · '}processed {enrichmentJob.processedDomains || 0}/{enrichmentJob.totalDomains || 0}
                            {' · '}phone {enrichmentJob.withPhone || 0}
                            {' · '}email {enrichmentJob.withEmail || 0}
                            {' · '}WhatsApp {enrichmentJob.withWhatsApp || 0}
                            {' · '}FB {enrichmentJob.withFacebook || 0}
                            {' · '}IG {enrichmentJob.withInstagram || 0}
                            {enrichmentJob.currentDomain ? ` · current ${enrichmentJob.currentDomain}` : ''}
                            {enrichmentJob.lastError ? ` · ${enrichmentJob.lastError}` : ''}
                        </div>
                    )}
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ padding: 8 }}>Sel</th>
                                    <th style={{ padding: 8 }}>Company</th>
                                    <th style={{ padding: 8 }}>Phone</th>
                                    <th style={{ padding: 8 }}>WhatsApp</th>
                                    <th style={{ padding: 8 }}>Email</th>
                                    <th style={{ padding: 8 }}>Contact Person</th>
                                    <th style={{ padding: 8 }}>City</th>
                                    <th style={{ padding: 8 }}>Facebook</th>
                                    <th style={{ padding: 8 }}>Instagram</th>
                                    <th style={{ padding: 8 }}>LinkedIn</th>
                                    <th style={{ padding: 8 }}>YouTube</th>
                                    <th style={{ padding: 8 }}>Business Type</th>
                                    <th style={{ padding: 8 }}>Status</th>
                                    <th style={{ padding: 8 }}>Confidence</th>
                                    <th style={{ padding: 8 }}>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {enrichmentRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={16} style={{ padding: 12, color: '#64748b' }}>
                                            No enrichment records yet. Run Enrich All Unverified after capture.
                                        </td>
                                    </tr>
                                ) : (
                                    enrichmentRows.map((e) => (
                                        <tr key={String(e._id)} style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: 8 }}>
                                                <input type="checkbox" checked={selectedEnrichIds.includes(String(e._id))} onChange={() => toggleSelectEnrich(e._id)} />
                                            </td>
                                            <td style={{ padding: 8 }}>
                                                <button type="button" onClick={() => onOpenEnrichDetail(e._id)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                                                    {e.companyName || e.canonicalDomain || '-'}
                                                </button>
                                            </td>
                                            <td style={{ padding: 8 }}>
                                                {formatPhoneCell((e.phones || [])[0])}
                                                {(e.phones || []).length > 1 ? ` +${(e.phones || []).length - 1}` : ''}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                                {(e.whatsappNumbers || [])[0]
                                                    ? (
                                                        <span>
                                                            {(e.whatsappNumbers || [])[0].normalized || (e.whatsappNumbers || [])[0].original}
                                                            {(e.whatsappNumbers || [])[0].sourceUrl ? (
                                                                <a href={(e.whatsappNumbers || [])[0].sourceUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 6, fontSize: 11 }}>src</a>
                                                            ) : null}
                                                        </span>
                                                    )
                                                    : '-'}
                                            </td>
                                            <td style={{ padding: 8 }}>
                                                {(e.emails || [])[0]?.value || '-'}
                                                {(e.emails || []).length > 1 ? ` +${(e.emails || []).length - 1}` : ''}
                                            </td>
                                            <td style={{ padding: 8 }}>{(e.contactPersons || [])[0]?.name || '-'}</td>
                                            <td style={{ padding: 8 }}>{e.city || '-'}</td>
                                            <td style={{ padding: 8 }}><SocialCell social={e.facebook} network="Facebook" /></td>
                                            <td style={{ padding: 8 }}><SocialCell social={e.instagram} network="Instagram" /></td>
                                            <td style={{ padding: 8 }}><SocialCell social={e.linkedin} network="LinkedIn" /></td>
                                            <td style={{ padding: 8 }}><SocialCell social={e.youtube} network="YouTube" /></td>
                                            <td style={{ padding: 8 }}>{e.businessType || '-'}</td>
                                            <td style={{ padding: 8 }}>{e.enrichmentStatus || '-'}</td>
                                            <td style={{ padding: 8 }}>{e.confidence ?? '-'}</td>
                                            <td style={{ padding: 8 }}>
                                                <button type="button" onClick={() => onOpenEnrichDetail(e._id)} style={{ ...btn('#475569', false), padding: '4px 8px', fontSize: 11 }}>
                                                    View Evidence
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {detailEnrichment?.enrichment && (
                        <div style={{ marginTop: 16, padding: 14, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
                            <h4 style={{ marginTop: 0 }}>Enrichment review</h4>
                            {(() => {
                                const en = detailEnrichment.enrichment;
                                const person = (en.contactPersons || [])[0] || {};
                                return (
                                    <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
                                        <div><strong>Company name:</strong> {en.companyName || '-'}</div>
                                        <div><strong>Legal / displayed name:</strong> {en.legalOrDisplayedName || '-'}</div>
                                        <div><strong>Contact person:</strong> {person.name || '-'} {person.designation ? `(${person.designation})` : ''} {person.sourceUrl ? <a href={person.sourceUrl} target="_blank" rel="noreferrer">src</a> : null}</div>
                                        <div><strong>Phones:</strong>
                                            <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                                                {(en.phones || []).length ? (en.phones || []).map((ph, i) => (
                                                    <li key={i}>{ph.normalized || ph.original} · {ph.confidence || '-'} · <a href={ph.sourceUrl} target="_blank" rel="noreferrer">source</a> · original: {ph.originalText || ph.original}</li>
                                                )) : <li>Not found</li>}
                                            </ul>
                                        </div>
                                        <div><strong>WhatsApp:</strong>
                                            <ul style={{ margin: '4px 0', paddingLeft: 18 }}>
                                                {(en.whatsappNumbers || []).length ? (en.whatsappNumbers || []).map((ph, i) => (
                                                    <li key={i}>{ph.normalized || ph.original} · <a href={ph.sourceUrl} target="_blank" rel="noreferrer">source</a></li>
                                                )) : <li>Not found</li>}
                                            </ul>
                                        </div>
                                        <div><strong>Emails:</strong> {(en.emails || []).map((em) => em.value).join(', ') || '-'}</div>
                                        <div><strong>Address:</strong> {(en.addresses || [])[0]?.raw || '-'}</div>
                                        <div><strong>City / State / Country:</strong> {[en.city, en.state, en.country].filter(Boolean).join(', ') || '-'}</div>
                                        <div><strong>Facebook:</strong> {en.facebook?.url ? <>{en.facebook.handle ? `@${en.facebook.handle}` : (en.facebook.pageName || 'page')} · <a href={en.facebook.url} target="_blank" rel="noreferrer">Open</a> · conf {en.facebook.matchConfidence || 'verified'} · <a href={en.facebook.sourceUrl || en.websiteUrl} target="_blank" rel="noreferrer">evidence</a></> : socialStatusLabel(en.facebook)}</div>
                                        <div><strong>Instagram:</strong> {en.instagram?.url ? <>{en.instagram.handle ? `@${en.instagram.handle}` : 'profile'} · <a href={en.instagram.url} target="_blank" rel="noreferrer">Open</a> · conf {en.instagram.matchConfidence || 'verified'} · <a href={en.instagram.sourceUrl || en.websiteUrl} target="_blank" rel="noreferrer">evidence</a></> : socialStatusLabel(en.instagram)}</div>
                                        <div><strong>LinkedIn:</strong> {en.linkedin?.url ? <>{en.linkedin.handle || 'company'} · <a href={en.linkedin.url} target="_blank" rel="noreferrer">Open</a></> : socialStatusLabel(en.linkedin)}</div>
                                        <div><strong>YouTube:</strong> {en.youtube?.url ? <>{en.youtube.handle || en.youtube.pageId || 'channel'} · <a href={en.youtube.url} target="_blank" rel="noreferrer">Open</a></> : socialStatusLabel(en.youtube)}</div>
                                        <div><strong>Products / services:</strong> {(en.productsServices || []).join('; ') || '-'}</div>
                                        <div><strong>Business type:</strong> {en.businessType || '-'}</div>
                                        <div><strong>Manufacturer / OEM evidence:</strong> {en.manufacturerEvidence || '-'}</div>
                                        <div><strong>GSTIN:</strong> {en.gstin || '-'} {en.gstinSourceUrl ? <a href={en.gstinSourceUrl} target="_blank" rel="noreferrer">src</a> : null}</div>
                                        <div><strong>Status / confidence / review:</strong> {en.enrichmentStatus} · {en.confidence} · {en.reviewStatus}</div>
                                        <div><strong>Missing:</strong> {(en.missingFields || []).join(', ') || 'none'}</div>
                                        <div><strong>Rejected invalid phones:</strong> {(en.rejectedPhones || []).slice(0, 8).map((r) => r.original).join(', ') || 'none'}</div>
                                    </div>
                                );
                            })()}
                            <p style={{ fontSize: 13, marginTop: 12 }}><strong>Google sources:</strong></p>
                            <ul style={{ fontSize: 12 }}>
                                {(detailEnrichment.captures || []).map((cap) => (
                                    <li key={String(cap._id)}>{cap.title} — {cap.resultUrlOriginal || cap.resultUrlNormalized}</li>
                                ))}
                            </ul>
                            <p style={{ fontSize: 13 }}><strong>Field evidence:</strong></p>
                            <ul style={{ fontSize: 12 }}>
                                {(detailEnrichment.enrichment.sourceEvidence || []).slice(0, 40).map((ev, i) => (
                                    <li key={i}>{ev.field}: {ev.value} — <a href={ev.sourceUrl} target="_blank" rel="noreferrer">{ev.sourceUrl}</a> {ev.note ? `(${ev.note})` : ''}</li>
                                ))}
                            </ul>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button type="button" onClick={() => onReviewEnrichment(detailEnrichment.enrichment._id, 'approved')} style={btn('#15803d', false)}>Approve</button>
                                <button type="button" onClick={() => onReviewEnrichment(detailEnrichment.enrichment._id, 'rejected')} style={btn('#b91c1c', false)}>Reject</button>
                                <button type="button" onClick={() => onReviewEnrichment(detailEnrichment.enrichment._id, 'needs_edit')} style={btn('#d97706', false)}>Needs edit</button>
                                <button type="button" onClick={() => setDetailEnrichment(null)} style={btn('#475569', false)}>Close</button>
                            </div>
                        </div>
                    )}
                </section>
            )}

            
                </div>
            </details>

            <details className={styles.details} id="sls-details-qualified">
                <summary>Qualification Results</summary>
                <div className={styles.detailsBody}>
{(session || result?.session) && (
                <section style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: 15, marginBottom: 8 }}>Checkpoint 7 — AI Qualification and Human Review</h3>
                    <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                        Evidence-based qualification (rule engine mandatory; optional local Ollama). Does not create CRM Leads.
                    </p>
                                        {(showAdminControls || showManualStages || !ownerFullAuto) && (
<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                        <button type="button" disabled={!!busy} onClick={onQualifySelected} style={btn('#0f766e', !!busy)}>Qualify Selected</button>
                        <button type="button" disabled={!!busy} onClick={onQualifyAll} style={btn('#0369a1', !!busy)}>{busy === 'qualify' ? 'Starting...' : 'Qualify All Enriched'}</button>
                        <button type="button" disabled={!!busy} onClick={onStopQualification} style={btn('#b91c1c', !!busy)}>{busy === 'qualifyStop' ? 'Stopping...' : 'Stop Qualification'}</button>
                        <button type="button" disabled={!!busy} onClick={onQualifyRetry} style={btn('#d97706', !!busy)}>Retry Failed</button>
                        <button type="button" disabled={!!busy || !qualificationRows.length} onClick={onExportQualified} style={btn('#9a3412', !!busy || !qualificationRows.length)}>{busy === 'qualifyExport' ? 'Exporting...' : 'Export Qualified Results'}</button>
                    </div>
                    )}
                    {qualificationJob && (
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#334155' }}>
                            <strong>Job:</strong> {qualificationJob.status}
                            {' · '}processed {qualificationJob.processed || 0}/{qualificationJob.total || 0}
                            {' · '}strong {qualificationJob.strongMatchCount || 0}
                            {' · '}possible {qualificationJob.possibleMatchCount || 0}
                            {' · '}rejected {qualificationJob.rejectedCount || 0}
                            {' · '}review {qualificationJob.reviewRequiredCount || 0}
                            {' · '}failed {qualificationJob.failedCount || 0}
                            {' · '}rules {qualificationJob.ruleBasedCount || 0}
                            {' · '}ollama {qualificationJob.ollamaCount || 0}
                            {qualificationJob.currentDomain ? (' · current ' + qualificationJob.currentDomain) : ''}
                            {qualificationJob.lastError ? (' · ' + qualificationJob.lastError) : ''}
                        </div>
                    )}
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ padding: 8 }}>Verify</th>
                                    <th style={{ padding: 8 }}>Company</th>
                                    <th style={{ padding: 8 }}>Decision</th>
                                    <th style={{ padding: 8 }}>Relevance Score</th>
                                    <th style={{ padding: 8 }}>Confidence</th>
                                    <th style={{ padding: 8 }}>Business Type</th>
                                    <th style={{ padding: 8 }}>Requested</th>
                                    <th style={{ padding: 8 }}>Detected</th>
                                    <th style={{ padding: 8 }}>Type match</th>
                                    <th style={{ padding: 8 }}>Products Matched</th>
                                    <th style={{ padding: 8 }}>Contact Quality</th>
                                    <th style={{ padding: 8 }}>Reason</th>
                                    <th style={{ padding: 8 }}>Review Status</th>
                                    <th style={{ padding: 8 }}>Evidence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {qualificationRows.length === 0 ? (
                                    <tr><td colSpan={14} style={{ padding: 12, color: '#64748b' }}>No qualification records yet. Run Qualify All Enriched after enrichment.</td></tr>
                                ) : (
                                    qualificationRows.map((q) => (
                                        <tr key={String(q._id)} style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: 8 }}>
                                                <input type="checkbox" checked={selectedGenuinenessIds.includes(String(q._id))} onChange={() => toggleSelectGenuineness(q._id)} />
                                            </td>
                                            <td style={{ padding: 8 }}>{q.companyName || q.canonicalDomain || '-'}</td>
                                            <td style={{ padding: 8 }}>{decisionBadge(q.systemDecision)}</td>
                                            <td style={{ padding: 8 }}>{q.relevanceScore ?? '-'}</td>
                                            <td style={{ padding: 8 }}>{q.confidence || '-'}</td>
                                            <td style={{ padding: 8 }}>{q.ownerBusinessTypeOverride || q.businessType || '-'}</td>
                                            <td style={{ padding: 8 }}>{formatBusinessTypeField(q, 'requestedBusinessTypes', 'requestedBusinessType')}</td>
                                            <td style={{ padding: 8 }}>{formatBusinessTypeField(q, 'detectedBusinessTypes', 'detectedBusinessType')}</td>
                                            <td style={{ padding: 8 }}>{q.businessTypeMatch || '-'}</td>
                                            <td style={{ padding: 8 }}>{(q.productsMatched || []).slice(0, 4).join(', ') || '-'}</td>
                                            <td style={{ padding: 8 }}>{q.contactQualityScore ?? '-'}</td>
                                            <td style={{ padding: 8, maxWidth: 220 }}>{q.decisionReason || '-'}</td>
                                            <td style={{ padding: 8 }}>{q.ownerReviewStatus || 'unreviewed'}</td>
                                            <td style={{ padding: 8 }}>
                                                <button type="button" onClick={() => onOpenQualifyDetail(q._id)} style={{ ...btn('#475569', false), padding: '4px 8px', fontSize: 11 }}>View Evidence</button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {detailQualification?.qualification && (
                        <div style={{ marginTop: 16, padding: 14, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
                            <h4 style={{ marginTop: 0 }}>Qualification review</h4>
                            {(() => {
                                const q = detailQualification.qualification;
                                return (
                                    <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
                                        <div><strong>Company:</strong> {q.companyName || '-'}</div>
                                        <div><strong>System decision:</strong> {decisionBadge(q.systemDecision)} (preserved)</div>
                                        <div><strong>Owner decision:</strong> {q.ownerDecision || '(none yet)'}</div>
                                        <div><strong>Score / confidence / method:</strong> {q.relevanceScore} · {q.confidence} · {q.qualificationMethod}</div>
                                        <div><strong>Reason:</strong> {q.decisionReason}</div>
                                        <div><strong>Matched keywords:</strong> {(q.matchedKeywords || []).join(', ') || '-'}</div>
                                        <div><strong>Products matched:</strong> {(q.productsMatched || []).join(', ') || '-'}</div>
                                        <div><strong>Conflicting / unmatched:</strong> {(q.unmatchedOrConflictingEvidence || []).join(', ') || '-'}</div>
                                        <div><strong>Business type:</strong> {q.businessType}{q.ownerBusinessTypeOverride ? (' (owner: ' + q.ownerBusinessTypeOverride + ')') : ''}</div>
                                        <div><strong>Requested:</strong> {formatBusinessTypeField(q, 'requestedBusinessTypes', 'requestedBusinessType')}</div>
                                        <div><strong>Detected:</strong> {formatBusinessTypeField(q, 'detectedBusinessTypes', 'detectedBusinessType')}</div>
                                        <div><strong>Business type match:</strong> {q.businessTypeMatch || '-'}</div>
                                        <div><strong>Evidence / reason:</strong> {q.businessTypeMatchReason || '-'}</div>
                                        <div><strong>Location match:</strong> {q.locationMatch}</div>
                                        <div><strong>Contact quality:</strong> {q.contactQualityScore}</div>
                                        <div><strong>Qualified at:</strong> {q.qualifiedAt ? new Date(q.qualifiedAt).toLocaleString() : '-'}</div>
                                        <label style={{ display: 'block', marginTop: 8 }}>Correct business type
                                            <select value={businessTypeCorrection} onChange={(e) => setBusinessTypeCorrection(e.target.value)} style={{ ...fieldStyle, maxWidth: 280 }}>
                                                {['manufacturer','oem_odm','brand_owner','importer','distributor','dealer','supplier','system_integrator','service_provider','directory_marketplace','unknown'].map((bt) => (
                                                    <option key={bt} value={bt}>{bt}</option>
                                                ))}
                                            </select>
                                        </label>
                                        <label style={{ display: 'block' }}>Review note
                                            <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} style={fieldStyle} />
                                        </label>
                                        <p style={{ fontSize: 12 }}><strong>Evidence:</strong></p>
                                        <ul style={{ fontSize: 12 }}>
                                            {(q.sourceEvidence || []).slice(0, 40).map((ev, i) => (
                                                <li key={i}>{ev.field}: {ev.value} {ev.sourceUrl ? <a href={ev.sourceUrl} target="_blank" rel="noreferrer">src</a> : null}</li>
                                            ))}
                                        </ul>
                                        <p style={{ fontSize: 12 }}><strong>Audit:</strong></p>
                                        <ul style={{ fontSize: 12 }}>
                                            {(q.auditHistory || []).slice(-10).map((a, i) => (
                                                <li key={i}>{a.at ? new Date(a.at).toLocaleString() : ''} · {a.action} · {a.from} → {a.to}{a.note ? (' (' + a.note + ')') : ''}</li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })()}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                <button type="button" onClick={() => onOwnerReview(detailQualification.qualification._id, 'approve')} style={btn('#15803d', false)}>Approve</button>
                                <button type="button" onClick={() => onOwnerReview(detailQualification.qualification._id, 'reject')} style={btn('#b91c1c', false)}>Reject</button>
                                <button type="button" onClick={() => onOwnerReview(detailQualification.qualification._id, 'mark_possible')} style={btn('#a16207', false)}>Mark Possible</button>
                                <button type="button" onClick={() => onOwnerReview(detailQualification.qualification._id, 'send_for_review')} style={btn('#7c3aed', false)}>Send for Review</button>
                                <button type="button" onClick={() => onOwnerReview(detailQualification.qualification._id, 'correct_business_type')} style={btn('#0369a1', false)}>Correct Business Type</button>
                                <button type="button" onClick={() => onOwnerReview(detailQualification.qualification._id, 'add_note')} style={btn('#475569', false)}>Add Review Note</button>
                                <button type="button" disabled title="Create CRM Lead is disabled in Checkpoint 7" style={btn('#94a3b8', true)}>Create CRM Lead</button>
                                <button type="button" onClick={() => setDetailQualification(null)} style={btn('#475569', false)}>Close</button>
                            </div>
                        </div>
                    )}
                </section>
            )}

            
                </div>
            </details>

            <details className={styles.details} id="sls-details-verified">
                <summary>Genuineness Verification &amp; Evidence</summary>
                <div className={styles.detailsBody}>
{(session || result?.session) && (
                <section style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
                    <h3 style={{ fontSize: 15, marginBottom: 8 }}>Checkpoint 8 — AI Data Genuineness Check</h3>
                    <p style={{ fontSize: 13, color: '#64748b', marginTop: 0 }}>
                        Verified Genuine means the available public business evidence is consistent. It is not a legal, financial or government verification.
                    </p>
                                        {(showAdminControls || showManualStages || !ownerFullAuto) && (
<div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                        <button type="button" disabled={!!busy} onClick={onVerifyAllQualified} style={btn('#0369a1', !!busy)}>{busy === 'verify' ? 'Starting...' : 'Verify All Qualified'}</button>
                        <button type="button" disabled={!!busy || !selectedGenuinenessIds.length} onClick={onVerifySelected} style={btn('#0f766e', !!busy || !selectedGenuinenessIds.length)}>Verify Selected</button>
                        <button type="button" disabled={!!busy} onClick={onStopVerification} style={btn('#b91c1c', !!busy)}>{busy === 'verifyStop' ? 'Stopping...' : 'Stop Verification'}</button>
                        <button type="button" disabled={!!busy} onClick={onVerifyRetryFailed} style={btn('#d97706', !!busy)}>Retry Failed</button>
                        <button type="button" disabled={!!busy || !genuinenessRows.length} onClick={onExportVerified} style={btn('#9a3412', !!busy || !genuinenessRows.length)}>{busy === 'verifyExport' ? 'Exporting...' : 'Export Verified Results'}</button>
                    </div>
                    )}
                    {genuinenessJob && (
                        <div style={{ fontSize: 13, marginBottom: 12, color: '#334155' }}>
                            <strong>Job:</strong> {genuinenessJob.status}
                            {' · '}processed {genuinenessJob.processed || 0}/{genuinenessJob.total || 0}
                            {' · '}verified {genuinenessJob.verifiedGenuineCount || 0}
                            {' · '}likely {genuinenessJob.likelyGenuineCount || 0}
                            {' · '}review {genuinenessJob.humanReviewRequiredCount || 0}
                            {' · '}directory {genuinenessJob.directoryOrMarketplaceOnlyCount || 0}
                            {' · '}unreliable {genuinenessJob.suspectedUnreliableCount || 0}
                            {' · '}rejected {genuinenessJob.rejectedUnusableCount || 0}
                            {' · '}failed {genuinenessJob.failedCount || 0}
                            {' · '}rules {genuinenessJob.ruleBasedCount || 0}
                            {' · '}ollama {genuinenessJob.ollamaCount || 0}
                            {genuinenessJob.currentDomain ? (' · current ' + genuinenessJob.currentDomain) : ''}
                            {genuinenessJob.lastError ? (' · ' + genuinenessJob.lastError) : ''}
                        </div>
                    )}
                    <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                                    <th style={{ padding: 8 }}>Unique Company</th>
                                    <th style={{ padding: 8 }}>Primary Website</th>
                                    <th style={{ padding: 8 }}>Verification Status</th>
                                    <th style={{ padding: 8 }}>Source Appearances</th>
                                    <th style={{ padding: 8 }}>Score</th>
                                    <th style={{ padding: 8 }}>Reason</th>
                                    <th style={{ padding: 8 }}>Review Status</th>
                                    <th style={{ padding: 8 }}>View Evidence</th>
                                </tr>
                            </thead>
                            <tbody>
                                {genuinenessRows.length === 0 ? (
                                    <tr><td colSpan={8} style={{ padding: 12, color: '#64748b' }}>No genuineness records yet. Run Verify All Qualified after qualification.</td></tr>
                                ) : (
                                    genuinenessRows.map((g) => (
                                        <tr key={String(g._id || g.canonicalKey)} style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: 8 }}>
                                                {g.uniqueCompany || g.companyName || '-'}
                                                {(g.sourceAppearances || 1) > 1 ? (
                                                    <div style={{ color: '#64748b', fontSize: 11 }}>Captured {g.sourceAppearances} times</div>
                                                ) : null}
                                            </td>
                                            <td style={{ padding: 8 }}>{g.primaryWebsite || g.canonicalDomain || '-'}</td>
                                            <td style={{ padding: 8 }}>
                                                {g.verificationStatusLabel
                                                    || genuinenessBadge(g.ownerDecision || g.systemDecision)}
                                            </td>
                                            <td style={{ padding: 8 }}>{g.sourceAppearances ?? 1}</td>
                                            <td style={{ padding: 8 }}>{g.genuinenessScore ?? '-'}</td>
                                            <td style={{ padding: 8, maxWidth: 220 }}>{(g.verificationReason || '-').slice(0, 120)}</td>
                                            <td style={{ padding: 8 }}>{g.ownerReviewStatus || 'unreviewed'}</td>
                                            <td style={{ padding: 8 }}>
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenGenuinenessDetail(g.genuinenessId || g._id)}
                                                    style={{ ...btn('#475569', false), padding: '4px 8px', fontSize: 11 }}
                                                >
                                                    View Evidence
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {detailGenuineness?.genuineness && (
                        <div style={{ marginTop: 16, padding: 14, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
                            <h4 style={{ marginTop: 0 }}>Genuineness review</h4>
                            {(() => {
                                const g = detailGenuineness.genuineness;
                                return (
                                    <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
                                        <div><strong>Company:</strong> {g.companyName || '-'}</div>
                                        <div><strong>Domain:</strong> {g.canonicalDomain || '-'} {g.websiteUrl ? <a href={g.websiteUrl} target="_blank" rel="noreferrer">Open</a> : null}</div>
                                        <div><strong>System decision:</strong> {genuinenessBadge(g.systemDecision)} (preserved)</div>
                                        <div><strong>Owner decision:</strong> {g.ownerDecision ? genuinenessBadge(g.ownerDecision) : '(none yet)'}</div>
                                        <div><strong>Score / confidence / method:</strong> {g.genuinenessScore} · {g.genuinenessConfidence} · {g.verificationMethod}</div>
                                        <div><strong>Reason:</strong> {g.verificationReason}</div>
                                        <div><strong>Manufacturer / OEM evidence:</strong> {g.manufacturerEvidence || '-'}</div>
                                        <div><strong>Positive signals:</strong> {(g.positiveSignals || []).join(', ') || '-'}</div>
                                        <div><strong>Warning signals:</strong> {(g.warningSignals || []).join(', ') || '-'}</div>
                                        <div><strong>Conflicting evidence:</strong> {(g.conflictingEvidence || []).join(', ') || '-'}</div>
                                        <div><strong>Missing critical fields:</strong> {(g.missingCriticalFields || []).join(', ') || '-'}</div>
                                        <div><strong>Verified at:</strong> {g.verifiedAt ? new Date(g.verifiedAt).toLocaleString() : '-'}</div>
                                        <label style={{ display: 'block' }}>Review note
                                            <textarea value={genuinenessReviewNote} onChange={(e) => setGenuinenessReviewNote(e.target.value)} rows={3} style={fieldStyle} />
                                        </label>
                                        <p style={{ fontSize: 12 }}><strong>Evidence URLs:</strong></p>
                                        <ul style={{ fontSize: 12 }}>
                                            {(g.evidenceUrls || []).slice(0, 40).map((url, i) => (
                                                <li key={i}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>
                                            ))}
                                        </ul>
                                        <p style={{ fontSize: 12 }}><strong>Audit:</strong></p>
                                        <ul style={{ fontSize: 12 }}>
                                            {(g.auditHistory || []).slice(-10).map((a, i) => (
                                                <li key={i}>{a.at ? new Date(a.at).toLocaleString() : ''} · {a.action} · {a.from} → {a.to}{a.note ? (' (' + a.note + ')') : ''}</li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })()}
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                                <button type="button" onClick={() => onGenuinenessOwnerReview(detailGenuineness.genuineness._id, 'approve')} style={btn('#15803d', false)}>Approve as Genuine</button>
                                <button type="button" onClick={() => onGenuinenessOwnerReview(detailGenuineness.genuineness._id, 'mark_possible')} style={btn('#0f766e', false)}>Mark Likely Genuine</button>
                                <button type="button" onClick={() => onGenuinenessOwnerReview(detailGenuineness.genuineness._id, 'send_for_review')} style={btn('#7c3aed', false)}>Send for Review</button>
                                <button type="button" onClick={() => onGenuinenessOwnerReview(detailGenuineness.genuineness._id, 'mark_unreliable', { ownerDecision: 'suspected_unreliable' })} style={btn('#d97706', false)}>Mark Unreliable</button>
                                <button type="button" onClick={() => onGenuinenessOwnerReview(detailGenuineness.genuineness._id, 'reject')} style={btn('#b91c1c', false)}>Reject</button>
                                <button type="button" onClick={() => onGenuinenessOwnerReview(detailGenuineness.genuineness._id, 'add_note')} style={btn('#475569', false)}>Add Review Note</button>
                                <button type="button" disabled title="Create CRM Lead is disabled until a separate controlled Lead-creation checkpoint is approved" style={btn('#94a3b8', true)}>Create CRM Lead (not available yet)</button>
                                <button type="button" onClick={() => setDetailGenuineness(null)} style={btn('#475569', false)}>Close</button>
                            </div>
                        </div>
                    )}
                </section>
            )}

                </div>
            </details>
        </div>
        </SimpleLeadSearchErrorBoundary>
    );
}