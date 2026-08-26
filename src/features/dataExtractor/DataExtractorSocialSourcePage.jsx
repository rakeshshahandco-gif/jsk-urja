import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dataExtractorApi } from '@/services/dataExtractorApi';
import { PATHS } from '@/routes/paths';
import InstagramCaptureResults from './InstagramCaptureResults';
import FacebookCommunityResults from './FacebookCommunityResults';
import DataExtractorClearHistoryModal, { useCanClearExtractorHistory } from './DataExtractorClearHistoryModal';
import {
    filterFacebookGroupRows,
    parseExactFacebookGroupSeek,
    exactLookupSucceeded,
    selectedGroupFromExactLookup,
    formatExactGroupLookupError,
} from './facebookGroupListFilter.util.js';
import FacebookLiveDiscoveryPanel from './FacebookLiveDiscoveryPanel.jsx';
import { mergeFacebookGroupRows, mergeLiveMemberRows } from './facebookLiveMemberStatus.util.js';

const btn = (bg, color = '#fff') => ({
    padding: '8px 14px',
    background: bg,
    color,
    border: bg === '#fff' ? '1px solid #cbd5e1' : 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
});

const PLATFORM = {
    facebook: {
        label: 'Facebook',
        types: [
            ['pages', 'Business/Pages'],
            ['groups', 'Groups'],
            ['group_intelligence', 'Group Intelligence'],
            ['posts', 'Posts/Activity'],
            ['page_audience', 'Page Audience / Followers'],
            ['page_engagement', 'Page Engagement'],
            ['related_pages', 'Related Pages'],
        ],
        defaultLocation: 'Mumbai',
        status: () => dataExtractorApi.facebookSourceStatus(),
        connect: () => dataExtractorApi.facebookConnect(),
        disconnect: () => dataExtractorApi.facebookDisconnect(),
        extract: (payload) => dataExtractorApi.startFacebookExtraction(payload),
    },
    instagram: {
        label: 'Instagram',
        types: [
            ['business_profiles', 'Business Profiles'],
            ['professional_accounts', 'Professional Accounts'],
            ['hashtag_topic', 'Hashtag/Topic'],
            ['related_accounts', 'Related Accounts'],
            ['community_intelligence', 'Community Intelligence'],
        ],
        defaultLocation: '',
        status: () => dataExtractorApi.instagramSourceStatus(),
        connect: () => dataExtractorApi.instagramConnect(),
        disconnect: () => dataExtractorApi.instagramDisconnect(),
        extract: (payload) => dataExtractorApi.startInstagramExtraction(payload),
    },
    linkedin: {
        label: 'LinkedIn',
        types: [
            ['companies', 'Companies'],
            ['professionals', 'Professionals'],
        ],
        defaultLocation: 'Mumbai',
        status: () => dataExtractorApi.linkedinSourceStatus(),
        connect: () => dataExtractorApi.linkedinConnect(),
        disconnect: () => dataExtractorApi.linkedinDisconnect(),
        extract: (payload) => dataExtractorApi.startLinkedInExtraction(payload),
        testPublicUrl: (payload) => dataExtractorApi.testLinkedInPublicUrl(payload),
    },
    x: {
        label: 'X / Twitter',
        extractLabel: 'START X EXTRACTION',
        types: [
            ['profiles', 'Profiles'],
            ['posts', 'Posts'],
        ],
        defaultLocation: '',
        status: () => dataExtractorApi.xSourceStatus(),
        connect: () => dataExtractorApi.xConnect(),
        disconnect: () => dataExtractorApi.xDisconnect(),
        extract: (payload) => dataExtractorApi.startXExtraction(payload),
        testPublicUrl: (payload) => dataExtractorApi.testXPublicUrl(payload),
    },
};

export default function DataExtractorSocialSourcePage({ platform }) {
    const cfg = PLATFORM[platform] || PLATFORM.facebook;
    const label = cfg.label;
    const types = cfg.types;
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState('');
    const [mode, setMode] = useState('public_search');
    const [keyword, setKeyword] = useState('Home Automation');
    const [location, setLocation] = useState(cfg.defaultLocation);
    const [searchType, setSearchType] = useState(types[0][0]);
    const [result, setResult] = useState(null);
    const [elapsedSec, setElapsedSec] = useState(0);
    const [captureCampaignId, setCaptureCampaignId] = useState('');
    const [captureReload, setCaptureReload] = useState(0);
    const [publicUrl, setPublicUrl] = useState(platform === 'linkedin'
        ? 'https://www.linkedin.com/company/nuos-home-automation'
        : 'https://x.com/jsk4c_x_fixture');
    const [knownWebsite, setKnownWebsite] = useState('');
    const [freshSearch, setFreshSearch] = useState(false);
    const [clearOpen, setClearOpen] = useState(false);
    const [pendingExtract, setPendingExtract] = useState(false);
    const [foundGroups, setFoundGroups] = useState([]);
    const [groupListFilter, setGroupListFilter] = useState('');
    const [groupListSource, setGroupListSource] = useState('');
    const [pasteGroupUrl, setPasteGroupUrl] = useState('');
    const [exactGroupInput, setExactGroupInput] = useState('');
    const [exactGroupError, setExactGroupError] = useState('');
    const [groupPickerMode, setGroupPickerMode] = useState('');
    const [showPasteUrl, setShowPasteUrl] = useState(false);
    const [memberCampaign, setMemberCampaign] = useState(null);
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [fbProgress, setFbProgress] = useState(null);
    const [reviewPriority, setReviewPriority] = useState('high_relevance');
    const [lastCollectorMode, setLastCollectorMode] = useState('full_automatic');
    const [autoReviewAfterDiscovery, setAutoReviewAfterDiscovery] = useState(true);
    const [autoJobRunning, setAutoJobRunning] = useState(false);
    const joinedSeekRef = useRef('');
    const [liveMembers, setLiveMembers] = useState([]);
    const [liveMemberTotal, setLiveMemberTotal] = useState(0);
    const canClear = useCanClearExtractorHistory();
    const visibleGroups = useMemo(
        () => filterFacebookGroupRows(foundGroups, groupListFilter),
        [foundGroups, groupListFilter],
    );

    const loadStatus = useCallback(async () => {
        try {
            const data = await cfg.status();
            setStatus(data);
        } catch (e) {
            toast.error(e?.response?.data?.message || `Failed to load ${label} status`);
        }
    }, [cfg, label]);

    useEffect(() => { loadStatus(); }, [loadStatus]);
    useEffect(() => {
        setLiveMembers([]);
        setLiveMemberTotal(0);
    }, [selectedGroup?.groupUrl]);

    useEffect(() => {
        if (busy !== 'extract' && !autoJobRunning) {
            setElapsedSec(0);
            return undefined;
        }
        const t = setInterval(() => setElapsedSec((s) => s + 1), 1000);
        return () => clearInterval(t);
    }, [busy, autoJobRunning]);

    useEffect(() => {
        if (platform !== 'facebook') return undefined;
        let cancelled = false;
        const tick = async () => {
            try {
                const [prog, camp] = await Promise.all([
                    dataExtractorApi.facebookExtractProgress(),
                    dataExtractorApi.facebookMemberCampaign({
                        groupUrl: selectedGroup?.groupUrl || pasteGroupUrl.trim() || undefined,
                        keyword: keyword.trim() || undefined,
                    }),
                ]);
                if (cancelled) return;
                setFbProgress(prog);
                setMemberCampaign(camp);
                const running = Boolean(prog?.running || camp?.alreadyRunning || camp?.running);
                setAutoJobRunning(running);
                if (groupPickerMode !== 'exact' && prog?.groupSearch?.groups?.length) {
                    setFoundGroups((prev) => mergeFacebookGroupRows(prev, prog.groupSearch.groups));
                    setGroupListSource((src) => src || (prog.groupSearch.kind === 'joined' ? 'joined' : 'find'));
                }
                const groupUrl = selectedGroup?.groupUrl || '';
                if (groupUrl) {
                    const latest = await dataExtractorApi.listFacebookCaptures({
                        groupUrl,
                        page: 1,
                        limit: 50,
                    });
                    if (cancelled) return;
                    const rows = (latest.results || []).map((r) => r.facebookCommunity || {}).filter((r) => r.name);
                    setLiveMembers((prev) => mergeLiveMemberRows(prev, rows));
                    setLiveMemberTotal(latest.pagination?.total || rows.length);
                }
            } catch {
                /* keep last counters */
            }
        };
        tick();
        const t = setInterval(tick, 3000);
        return () => { cancelled = true; clearInterval(t); };
    }, [platform, pasteGroupUrl, selectedGroup, keyword, captureReload, groupPickerMode]);

    const loginStatus = status?.directLogin?.status || 'disconnected';
    const loginLabel = loginStatus === 'connected' ? 'Connected' : loginStatus === 'expired' ? 'Session Expired' : 'Disconnected';

    const onConnect = async () => {
        setBusy('connect');
        try {
            const data = await cfg.connect();
            toast.success(data?.status === 'connected' ? `${label} connected` : 'Login not completed');
            await loadStatus();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Connect failed');
        } finally {
            setBusy('');
        }
    };

    const onDisconnect = async () => {
        setBusy('disconnect');
        try {
            await cfg.disconnect();
            toast.success(`${label} disconnected`);
            await loadStatus();
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Disconnect failed');
        } finally {
            setBusy('');
        }
    };

    const onStart = async ({ afterClear = false } = {}) => {
        if (platform === 'facebook' && searchType === 'group_intelligence') {
            toast.error('Find Groups, then click Analyze Members on the exact group.');
            return;
        }
        if (!keyword.trim()) {
            toast.error('Keyword is required');
            return;
        }
        if (freshSearch && canClear && !afterClear) {
            setPendingExtract('start');
            setClearOpen(true);
            return;
        }
        setBusy('extract');
        setResult(null);
        try {
            const payload = { mode, keyword: keyword.trim(), location: location.trim(), searchType };
            const data = await cfg.extract(payload);
            setResult(data);
            if (platform === 'instagram') {
                setCaptureCampaignId('');
                setCaptureReload((n) => n + 1);
            }
            if (platform === 'facebook') setCaptureReload((n) => n + 1);
            if (data?.ingested) toast.success(`${data.ingested} candidate(s) sent to Processing`);
            else toast(data?.errors?.[0] || 'No candidates found');
        } catch (e) {
            const timedOut = e?.code === 'ECONNABORTED' || /timeout/i.test(String(e?.message || ''));
            toast.error(
                e?.response?.data?.message
                || (timedOut
                    ? (mode === 'direct_login'
                        ? `Direct ${label} is still running in Chrome. Wait for the Chrome window to finish, then check Processing — do not click Start again yet.`
                        : 'Search timed out. Try Public Search again.')
                    : 'Extraction failed'),
            );
        } finally {
            setBusy('');
        }
    };

    const onStopInstagram = async () => {
        try {
            await dataExtractorApi.stopInstagramExtraction();
            toast('Stop requested — extract will end after the current profile');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Stop failed');
        }
    };

    const onStopFacebook = async () => {
        try {
            await dataExtractorApi.stopFacebookExtraction();
            toast('Stop requested — captured members are kept. Resume continues from checkpoint.');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Stop failed');
        }
    };

    const onPauseFacebook = async () => {
        try {
            await dataExtractorApi.pauseFacebookExtraction();
            toast('Pause requested — current batch will be saved.');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Pause failed');
        }
    };

    const onAnalyzeCommunity = async (type) => {
        if (type === 'group_intelligence') {
            toast.error('Find Groups, then click Analyze Members on the exact group.');
            return;
        }
        if (!keyword.trim()) {
            toast.error('Keyword is required');
            return;
        }
        setMode('direct_login');
        setSearchType(type);
        setBusy('extract');
        setResult(null);
        try {
            const data = await cfg.extract({
                mode: 'direct_login',
                keyword: keyword.trim(),
                location: location.trim(),
                searchType: type,
            });
            setResult(data);
            setCaptureReload((n) => n + 1);
            if (data?.ingested) toast.success(`${data.ingested} candidate(s) sent to Processing`);
            else toast(data?.errors?.[0] || 'No candidates found');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Community analysis failed');
        } finally {
            setBusy('');
        }
    };

    const onFindGroups = async () => {
        if (!keyword.trim()) {
            toast.error('Keyword is required');
            return;
        }
        setMode('direct_login');
        setSearchType('group_intelligence');
        setBusy('find-groups');
        setGroupPickerMode('find');
        setFoundGroups([]);
        try {
            const data = await dataExtractorApi.findFacebookGroups({
                keyword: keyword.trim(),
                location: location.trim(),
            });
            setFoundGroups(data?.groups || []);
            setGroupListSource('find');
            setGroupPickerMode('find');
            if (data?.groups?.length) toast.success(`${data.groups.length} group(s) found — pick one to analyze`);
            else toast.error(data?.errors?.[0] || data?.note || 'No groups found');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Find Groups failed');
        } finally {
            setBusy('');
        }
    };

    const onFindJoinedGroups = async (seekOverride = '') => {
        setMode('direct_login');
        setSearchType('group_intelligence');
        setBusy('joined-groups');
        setGroupPickerMode('joined');
        setFoundGroups([]);
        const seek = parseExactFacebookGroupSeek(seekOverride || groupListFilter);
        if (seek) joinedSeekRef.current = seek;
        try {
            const data = await dataExtractorApi.listJoinedFacebookGroups({
                groupId: seek || undefined,
                q: seek || groupListFilter.trim() || undefined,
            });
            setFoundGroups(data?.groups || []);
            setGroupListSource('joined');
            setGroupPickerMode('joined');
            if (data?.matchedGroup) {
                onSelectGroupRow(data.matchedGroup);
                toast.success(`Exact Group Found — ${data.matchedGroup.groupName || seek}`);
            } else if (data?.groups?.length) {
                toast.success(`${data.groups.length} joined group(s) inspected${seek ? `. ID ${seek} not among them yet` : ' — pick the exact group ID'}`);
            } else {
                toast.error(data?.errors?.[0] || data?.note || 'No joined groups found');
            }
        } catch (e) {
            toast.error(e?.response?.data?.message || 'My Joined Groups failed');
        } finally {
            setBusy('');
        }
    };

    const onFindExactGroup = async () => {
        const raw = exactGroupInput.trim();
        if (!raw) {
            setExactGroupError('Exact group lookup failed — Enter a numeric Facebook Group ID or exact group URL.');
            toast.error('Enter a numeric Facebook Group ID or exact group URL.');
            return;
        }
        setMode('direct_login');
        setSearchType('group_intelligence');
        setGroupPickerMode('exact');
        setFoundGroups([]);
        setGroupListFilter('');
        setGroupListSource('');
        setExactGroupError('');
        setBusy('exact-group');
        try {
            const data = await dataExtractorApi.findExactFacebookGroup({
                groupId: raw,
                groupUrl: raw,
            });
            if (data?.startedExtract) {
                const msg = 'Exact group lookup failed — Find Exact Group must not start collection.';
                setExactGroupError(msg);
                toast.error(msg);
                return;
            }
            if (exactLookupSucceeded(data)) {
                onSelectGroupRow(selectedGroupFromExactLookup(data));
                setExactGroupError('');
                toast.success(data.note || 'Exact group verified. Collection was not started.');
            } else {
                const msg = `Exact group lookup failed — ${formatExactGroupLookupError(data)}`;
                setExactGroupError(msg);
                toast.error(msg);
            }
        } catch (e) {
            const body = e?.response?.data?.data || e?.response?.data || {};
            const msg = `Exact group lookup failed — ${formatExactGroupLookupError(body, e?.response?.data?.message || e?.message || 'Find Exact Group failed')}`;
            setExactGroupError(msg);
            toast.error(msg);
        } finally {
            setBusy('');
        }
    };

    const onSelectGroupRow = (g) => {
        setSelectedGroup({
            groupUrl: g.groupUrl,
            groupName: g.groupName,
            groupId: g.groupId || '',
            members: g.members || '',
            privacy: g.privacy || '',
            joinedStatus: g.joinedStatus || 'Unknown',
            canAnalyzeMembers: g.canAnalyzeMembers !== false,
            peopleTabAvailable: g.peopleTabAvailable,
            peopleTabStatus: g.peopleTabStatus || (g.peopleTabAvailable ? 'Available' : ''),
        });
        setSearchType('group_intelligence');
    };

    useEffect(() => {
        if (groupPickerMode === 'exact') return;
        const id = parseExactFacebookGroupSeek(groupListFilter);
        if (!id) return;
        const match = foundGroups.find((g) => String(g.groupId || '') === id);
        if (match && selectedGroup?.groupId !== id) onSelectGroupRow(match);
    }, [foundGroups, groupListFilter, selectedGroup?.groupId, groupPickerMode]);

    const onAnalyzeExactGroup = async (group, collectorMode = 'next_batch') => {
        const groupUrl = String(group?.groupUrl || selectedGroup?.groupUrl || pasteGroupUrl || '').trim();
        const groupName = String(group?.groupName || selectedGroup?.groupName || '').trim();
        const members = String(group?.members || selectedGroup?.members || '').trim();
        const privacy = String(group?.privacy || selectedGroup?.privacy || '').trim();
        const joinedStatus = String(group?.joinedStatus || selectedGroup?.joinedStatus || '').trim();
        const canAnalyze = group?.canAnalyzeMembers !== false && selectedGroup?.canAnalyzeMembers !== false
            ? (group?.canAnalyzeMembers ?? selectedGroup?.canAnalyzeMembers ?? true)
            : false;
        if (!groupUrl) {
            toast.error('Find Groups, then click Analyze Members on the exact group.');
            return;
        }
        const next = {
            groupUrl,
            groupName: groupName || groupUrl,
            groupId: String(group?.groupId || selectedGroup?.groupId || '').trim(),
            members,
            privacy,
            joinedStatus: joinedStatus || 'Unknown',
            canAnalyzeMembers: canAnalyze,
        };
        setSelectedGroup(next);
        if (group?.canAnalyzeMembers === false) {
            toast.error('This group is not accessible in the logged-in Facebook session. Open the group, join or wait for approval, then Analyze Members. CRM does not send join requests.');
            return;
        }
        setMode('direct_login');
        setSearchType('group_intelligence');
        setLastCollectorMode(collectorMode);
        if (collectorMode !== 'full_automatic' && collectorMode !== 'review_all') setBusy('extract');
        setResult(null);
        try {
            const data = await cfg.extract({
                mode: 'direct_login',
                keyword: keyword.trim() || groupName || 'group',
                location: location.trim(),
                searchType: 'group_intelligence',
                groupUrl,
                groupName: groupName || undefined,
                collectorMode,
                reviewPriority,
                autoReviewAfterDiscovery,
            });
            setResult(data);
            setCaptureReload((n) => n + 1);
            if (data?.alreadyRunning) {
                toast(data.message || data.note || 'This group collection is already running.');
                return;
            }
            if (data?.started) {
                toast.success('Automatic collection started. Counts update on this screen — the page is not reloaded.');
                return;
            }
            const title = data?.facebookCommunityRun?.analytics?.groupTitle || groupName;
            const displayed = data?.facebookCommunityRun?.analytics?.displayedMemberCount || members;
            setSelectedGroup((cur) => ({
                ...(cur || next),
                groupName: title || cur?.groupName,
                members: displayed || cur?.members,
                privacy: data?.facebookCommunityRun?.analytics?.privacy
                    || data?.facebookCommunityRun?.analytics?.groupAccess
                    || cur?.privacy,
            }));
            if (data?.ingested) toast.success(`${data.ingested} candidate(s) sent to Processing`);
            else toast(data?.errors?.[0] || data?.facebookCommunityRun?.analytics?.stopNote || 'No additional members this batch');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Analyze Members failed');
        } finally {
            setBusy('');
        }
    };

    const onOpenGroup = (url) => {
        const href = String(url || '').trim();
        if (!href) return;
        window.open(href, '_blank', 'noopener,noreferrer');
    };

    const onViewMembers = () => {
        document.getElementById('facebook-member-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const onTestPublicUrl = async () => {
        if (!cfg.testPublicUrl) return;
        if (!publicUrl.trim()) {
            toast.error('Public URL is required');
            return;
        }
        setBusy('testurl');
        setResult(null);
        try {
            const data = await cfg.testPublicUrl({
                publicUrl: publicUrl.trim(),
                website: knownWebsite.trim(),
                keyword: keyword.trim() || undefined,
                location: location.trim() || undefined,
            });
            setResult(data);
            toast.success(data?.duplicate ? 'Existing Processing record updated' : 'Sent to Processing');
        } catch (e) {
            toast.error(e?.response?.data?.message || 'Public URL test failed');
        } finally {
            setBusy('');
        }
    };

    return (
        <div style={{ maxWidth: platform === 'instagram' || platform === 'facebook' ? 1240 : 760 }}>
            <h2 style={{ marginTop: 0, fontSize: 18 }}>{label} extraction</h2>
            <p style={{ color: '#64748b', fontSize: 13 }}>
                {label} is a source adapter only. Results enter the existing Processing → Verified Data workflow.
                Convert to Lead stays manual.
            </p>
            {canClear && (platform === 'facebook' || platform === 'instagram') ? (
                <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        type="button"
                        style={btn('#fff', '#b91c1c')}
                        onClick={() => { setPendingExtract(false); setClearOpen(true); }}
                    >
                        {platform === 'facebook' ? 'Clear Facebook History' : 'Clear Instagram History'}
                    </button>
                    <label style={{ fontSize: 12 }}>
                        <input type="checkbox" checked={freshSearch} onChange={(e) => setFreshSearch(e.target.checked)} />
                        {' '}Start Fresh Search (clear matching {label} + keyword + location, then extract)
                    </label>
                </div>
            ) : null}
            {cfg.testPublicUrl ? (
                <p style={{ fontSize: 12, color: '#9a3412', background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: 8 }}>
                    Direct Login is <strong>NOT VALIDATED</strong> until the owner completes login in Chrome. Test Public URL is a no-login pipeline check only.
                </p>
            ) : null}

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['public_search', 'Public Search'], ['direct_login', `Direct ${label} Login`]].map(([id, text]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setMode(id)}
                        style={{
                            ...btn(mode === id ? '#2563eb' : '#fff', mode === id ? '#fff' : '#334155'),
                        }}
                    >
                        {text}
                    </button>
                ))}
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16, background: '#f8fafc', fontSize: 13 }}>
                <div><strong>Public Search:</strong> {status?.publicSearch?.message || 'Available'}</div>
                <div style={{ marginTop: 6 }}>
                    <strong>Direct Login:</strong> {loginLabel}
                    {mode === 'direct_login' ? (
                        <span style={{ marginLeft: 8 }}>
                            <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={onConnect}>{loginStatus === 'expired' ? 'Reconnect' : 'Connect'}</button>
                            {' '}
                            <button type="button" disabled={!!busy} style={btn('#fff', '#334155')} onClick={onDisconnect}>Disconnect</button>
                        </span>
                    ) : null}
                </div>
                <div style={{ marginTop: 6, color: '#64748b' }}>
                    Official API: {status?.officialApi?.message || 'Not configured'}
                </div>
            </div>

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Keyword</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Location (optional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Mumbai" style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 12 }} />

            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Search type</label>
            <select value={searchType} onChange={(e) => setSearchType(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 16 }}>
                {types.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
            </select>

            {platform === 'facebook' ? (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16, background: '#fff' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Facebook Group Member Collector</div>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                        Preferred when the Group ID is known: enter the ID or exact URL → Find Exact Group → confirm Selected Group → Run Full Group Automatically.
                        My Joined Groups, Find Groups, and Advanced paste URL remain available.
                    </p>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Facebook Group ID or URL</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        <input
                            value={exactGroupInput}
                            onChange={(e) => setExactGroupInput(e.target.value)}
                            placeholder="510207536124194 or https://www.facebook.com/groups/…"
                            style={{ flex: 1, minWidth: 240, padding: 8, border: '1px solid #cbd5e1', borderRadius: 8 }}
                        />
                        <button type="button" disabled={!!busy} style={btn('#047857')} onClick={onFindExactGroup}>
                            {busy === 'exact-group' ? 'Opening exact group…' : 'Find Exact Group'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                        <button type="button" disabled={!!busy} style={btn('#1d4ed8')} onClick={onFindGroups}>
                            {busy === 'find-groups' ? 'Searching Facebook…' : 'Find Groups'}
                        </button>
                        <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={onFindJoinedGroups}>
                            {busy === 'joined-groups' ? 'Searching Facebook…' : 'My Joined Groups'}
                        </button>
                    </div>
                    {(groupPickerMode !== 'exact' && (busy === 'find-groups' || busy === 'joined-groups' || foundGroups.length || fbProgress?.groupSearch?.found)) ? (
                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                                {groupListSource === 'joined' ? 'Search My Joined Groups' : 'Search groups'}
                            </label>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                <input
                                    value={groupListFilter}
                                    onChange={(e) => setGroupListFilter(e.target.value)}
                                    placeholder="Group name, Group ID, or URL — e.g. 510207536124194"
                                    style={{ flex: 1, minWidth: 240, padding: 8, border: '1px solid #cbd5e1', borderRadius: 8 }}
                                />
                                <button type="button" style={btn('#fff', '#334155')} onClick={() => setGroupListFilter('')}>
                                    Clear Search
                                </button>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                                {groupListSource === 'joined' ? 'Joined Groups Discovered' : 'Groups Found'}: {foundGroups.length || fbProgress?.groupSearch?.found || 0}
                            </div>
                            {parseExactFacebookGroupSeek(groupListFilter) ? (
                                <div style={{ fontSize: 12, color: '#1d4ed8', marginBottom: 4 }}>
                                    Searching for Group ID: {parseExactFacebookGroupSeek(groupListFilter)}
                                    {fbProgress?.groupSearch?.matchedGroupId || (selectedGroup?.groupId && selectedGroup.groupId === parseExactFacebookGroupSeek(groupListFilter))
                                        ? ' — Exact Group Found'
                                        : ''}
                                </div>
                            ) : null}
                            <div style={{ fontSize: 12, color: '#1d4ed8', marginBottom: 8 }}>
                                Current status: {
                                    fbProgress?.groupSearch?.matchedGroupId || (selectedGroup?.groupId && selectedGroup.groupId === parseExactFacebookGroupSeek(groupListFilter))
                                        ? 'Exact Group Found'
                                        : (busy === 'joined-groups' || fbProgress?.groupSearch?.running
                                            ? (parseExactFacebookGroupSeek(groupListFilter) ? 'Loading more joined groups...' : (busy === 'find-groups' ? 'Searching Facebook...' : 'Loading more joined groups...'))
                                            : (busy === 'find-groups' ? 'Searching Facebook...' : (fbProgress?.groupSearch?.status || (foundGroups.length ? 'Search complete' : '—'))))
                                }
                            </div>
                            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>
                                Showing {visibleGroups.length} of {foundGroups.length} {groupListSource === 'joined' ? 'joined groups' : 'groups'}
                            </div>
                            <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                                        <th style={{ padding: 6 }}>#</th>
                                        <th style={{ padding: 6 }}>Group</th>
                                        <th style={{ padding: 6 }}>Group ID</th>
                                        <th style={{ padding: 6 }}>Public/Private</th>
                                        <th style={{ padding: 6 }}>Displayed Members</th>
                                        <th style={{ padding: 6 }}>Joined Status</th>
                                        <th style={{ padding: 6 }}>URL</th>
                                        <th style={{ padding: 6 }}>Status</th>
                                        <th style={{ padding: 6 }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleGroups.map((g, idx) => {
                                        const selected = selectedGroup?.groupUrl === g.groupUrl;
                                        const allowAnalyze = g.canAnalyzeMembers !== false;
                                        return (
                                            <tr key={g.groupUrl} style={{ borderBottom: '1px solid #f1f5f9', background: selected ? '#ecfdf5' : undefined }}>
                                                <td style={{ padding: 6 }}>{g.seq || idx + 1}</td>
                                                <td style={{ padding: 6, fontWeight: 600 }}>{g.groupName}</td>
                                                <td style={{ padding: 6, fontFamily: 'monospace' }}>{g.groupId || '—'}</td>
                                                <td style={{ padding: 6 }}>{g.privacy || '—'}</td>
                                                <td style={{ padding: 6 }}>{g.members || '—'}</td>
                                                <td style={{ padding: 6 }}>{g.joinedStatus || 'Unknown'}</td>
                                                <td style={{ padding: 6, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    <a href={g.groupUrl} target="_blank" rel="noreferrer">{g.groupUrl}</a>
                                                </td>
                                                <td style={{ padding: 6 }}>{g.status || 'Found'}</td>
                                                <td style={{ padding: 6, whiteSpace: 'nowrap' }}>
                                                    <button type="button" style={{ ...btn('#fff', '#334155'), marginRight: 6 }} onClick={() => onSelectGroupRow(g)}>
                                                        Select
                                                    </button>
                                                    <button type="button" style={{ ...btn('#fff', '#334155'), marginRight: 6 }} onClick={() => onOpenGroup(g.groupUrl)}>
                                                        {allowAnalyze ? 'Open' : 'Open / Join'}
                                                    </button>
                                                    {allowAnalyze ? (
                                                        <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={() => onAnalyzeExactGroup(g)}>
                                                            Analyze Members
                                                        </button>
                                                    ) : (
                                                        <span style={{ fontSize: 11, color: '#92400e' }}>Join in Facebook first</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <p style={{ fontSize: 11, color: '#64748b', margin: '8px 0 0' }}>
                                Search only filters this list. It does not start extraction. Confirm Group ID before Analyze Members.
                            </p>
                            </div>
                        </div>
                    ) : null}

                    <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Selected Group</div>
                        {exactGroupError ? (
                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 13 }}>
                                <strong>Exact group lookup failed</strong>
                                <div style={{ marginTop: 4 }}>{exactGroupError.replace(/^Exact group lookup failed — /, '')}</div>
                            </div>
                        ) : null}
                        {autoJobRunning ? (
                            <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
                                Automatic Facebook Group Collection is Running
                            </div>
                        ) : null}
                        {(fbProgress?.attentionRequired || memberCampaign?.attentionRequired || fbProgress?.progress?.attentionRequired) ? (
                            <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 13 }}>
                                <strong>Facebook Attention Required</strong>
                                <div>Progress has been saved. Resolve the issue in the logged-in Facebook browser, then click Continue.</div>
                            </div>
                        ) : null}
                        {(memberCampaign?.checkpoint?.stopReason === 'persistence_failure'
                            || /persistence_failure/i.test(String(fbProgress?.progress?.stopNote || memberCampaign?.checkpoint?.status || ''))) ? (
                            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#991b1b', borderRadius: 8, padding: 8, marginBottom: 8, fontSize: 13 }}>
                                <strong>Member persistence failed</strong>
                                <div>{fbProgress?.progress?.stopNote || 'Discovered cards were not saved. Collection is paused.'}</div>
                            </div>
                        ) : null}
                        <div style={{ fontSize: 18, fontWeight: 700 }}>
                            {selectedGroup?.groupName || (!autoJobRunning ? '' : fbProgress?.progress?.groupTitle) || '—'}
                        </div>
                        <div style={{ marginTop: 6, fontSize: 13 }}>
                            Group ID: <strong>{selectedGroup?.groupId || '—'}</strong>
                        </div>
                        <div style={{ fontSize: 13 }}>
                            Membership: <strong>{selectedGroup?.joinedStatus || '—'}</strong>
                        </div>
                        <div style={{ fontSize: 13 }}>
                            URL: <strong>{selectedGroup?.groupUrl || '—'}</strong>
                        </div>
                        <div style={{ fontSize: 13 }}>
                            People Tab: <strong>{selectedGroup?.peopleTabStatus || (selectedGroup?.peopleTabAvailable ? 'Available' : (selectedGroup?.groupUrl ? 'Unavailable' : '—'))}</strong>
                        </div>
                        <div style={{ fontSize: 13 }}>
                            Facebook Displayed Members: <strong>{selectedGroup?.members || memberCampaign?.summary?.displayedMembers || fbProgress?.progress?.displayedMemberCount || '—'}</strong>
                            <div style={{ color: '#64748b', fontSize: 12 }}>Facebook displayed total — not extracted count</div>
                        </div>
                        <div style={{ fontSize: 13 }}>Unique Members Discovered: <strong>{memberCampaign?.summary?.uniqueDiscovered ?? fbProgress?.progress?.uniqueMembersCollected ?? liveMemberTotal ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>New This Run: <strong>{memberCampaign?.summary?.newThisRun ?? fbProgress?.newThisRun ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Profiles Pending Review: <strong>{memberCampaign?.summary?.pendingReview ?? memberCampaign?.awaitingReview ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Profiles Reviewed: <strong>{memberCampaign?.summary?.reviewed ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Business / Professional: <strong>{memberCampaign?.checkpoint?.qualifiedProfiles ?? memberCampaign?.summary?.relevant ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Relevant: <strong>{memberCampaign?.summary?.relevant ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Contactable: <strong>{memberCampaign?.summary?.contactable ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Phone: <strong>{memberCampaign?.summary?.phones ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>WhatsApp: <strong>{memberCampaign?.summary?.whatsapp ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Email: <strong>{memberCampaign?.summary?.emails ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Website: <strong>{memberCampaign?.summary?.websites ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Already Known / Deduplicated: <strong>{memberCampaign?.summary?.alreadyKnown ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>Current Stage: <strong>{memberCampaign?.currentStage || memberCampaign?.summary?.currentStage || fbProgress?.currentStage || '—'}</strong></div>
                        <div style={{ fontSize: 13 }}>Current Internal Batch: <strong>{memberCampaign?.summary?.currentBatch ?? 0}</strong></div>
                        <div style={{ fontSize: 13 }}>
                            Last Activity: <strong>{memberCampaign?.summary?.lastActivity ? new Date(memberCampaign.summary.lastActivity).toLocaleString() : '—'}</strong>
                        </div>
                        <div style={{ fontSize: 13 }}>
                            Run Time: <strong>{Math.floor((memberCampaign?.summary?.runTimeMs || fbProgress?.runTimeMs || (autoJobRunning ? elapsedSec * 1000 : 0)) / 1000)}s</strong>
                        </div>
                        <div style={{ fontSize: 13 }}>
                            Status: <strong>{autoJobRunning ? (fbProgress?.progress?.status || 'Running') : (memberCampaign?.summary?.status || (selectedGroup ? 'Ready' : 'Select a group'))}</strong>
                        </div>
                        {fbProgress?.progress?.stopNote ? <div style={{ color: '#9a3412', marginTop: 4 }}>{fbProgress.progress.stopNote}</div> : null}
                        {selectedGroup?.groupUrl || autoJobRunning ? (
                            <div style={{ marginTop: 12 }}>
                                <FacebookLiveDiscoveryPanel
                                    groupName={fbProgress?.progress?.groupTitle || selectedGroup?.groupName || ''}
                                    groupId={selectedGroup?.groupId || fbProgress?.groupId || ''}
                                    displayedMembers={memberCampaign?.summary?.displayedMembers || fbProgress?.progress?.displayedMemberCount || selectedGroup?.members || ''}
                                    uniqueDiscovered={liveMemberTotal ?? memberCampaign?.summary?.uniqueDiscovered ?? 0}
                                    newThisRun={memberCampaign?.summary?.newThisRun ?? fbProgress?.newThisRun ?? 0}
                                    alreadyKnown={memberCampaign?.summary?.alreadyKnown ?? 0}
                                    pendingReview={memberCampaign?.summary?.pendingReview ?? memberCampaign?.awaitingReview ?? 0}
                                    reviewed={memberCampaign?.summary?.reviewed ?? 0}
                                    relevant={memberCampaign?.summary?.relevant ?? 0}
                                    contactable={memberCampaign?.summary?.contactable ?? 0}
                                    phones={memberCampaign?.summary?.phones ?? 0}
                                    whatsapp={memberCampaign?.summary?.whatsapp ?? 0}
                                    emails={memberCampaign?.summary?.emails ?? 0}
                                    websites={memberCampaign?.summary?.websites ?? 0}
                                    running={autoJobRunning}
                                    complete={!autoJobRunning && /complete|source_exhausted/i.test(String(memberCampaign?.currentStage || memberCampaign?.summary?.currentStage || memberCampaign?.summary?.status || ''))}
                                    activity={fbProgress?.activity || fbProgress?.progress?.activity || fbProgress?.groupSearch?.activity || []}
                                    members={liveMembers}
                                    totalStored={liveMemberTotal}
                                    onViewAll={onViewMembers}
                                    onExport={() => document.getElementById('facebook-member-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                />
                            </div>
                        ) : null}
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginTop: 10 }}>
                            <input type="checkbox" checked={autoReviewAfterDiscovery} onChange={(e) => setAutoReviewAfterDiscovery(e.target.checked)} />
                            Automatically review profiles after member discovery
                        </label>
                        <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}>Review priority</label>
                        <select value={reviewPriority} onChange={(e) => setReviewPriority(e.target.value)} style={{ padding: 6, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 8, fontSize: 12 }}>
                            <option value="high_relevance">High relevance first</option>
                            <option value="business">Business/professional first</option>
                            <option value="has_company">Has visible company</option>
                            <option value="has_website">Has website</option>
                            <option value="all">All pending</option>
                        </select>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                            <button type="button" disabled={!!busy || !selectedGroup?.groupUrl} style={btn('#1d4ed8')} onClick={() => onAnalyzeExactGroup({ ...selectedGroup, canAnalyzeMembers: true }, 'full_automatic')}>
                                Run Full Group Automatically
                            </button>
                            <button type="button" disabled={!autoJobRunning && busy !== 'extract'} style={btn('#b45309')} onClick={onPauseFacebook}>Pause</button>
                            <button type="button" disabled={!!busy || !selectedGroup?.groupUrl} style={btn('#0f766e')} onClick={() => onAnalyzeExactGroup({ ...selectedGroup, canAnalyzeMembers: true }, 'full_automatic')}>
                                {fbProgress?.attentionRequired || memberCampaign?.attentionRequired ? 'Continue' : 'Resume'}
                            </button>
                            <button type="button" disabled={!autoJobRunning && busy !== 'extract'} style={btn('#b91c1c')} onClick={onStopFacebook}>Stop</button>
                            <button type="button" style={btn('#fff', '#334155')} onClick={onViewMembers}>View Group Members</button>
                            <Link
                                to={`${PATHS.DATA_EXTRACTOR.CONTACTABLE_PROSPECTS}?source=facebook_group_member&parentGroupId=${encodeURIComponent(selectedGroup?.groupId || '')}`}
                                style={{ ...btn('#1d4ed8'), display: 'inline-block', textDecoration: 'none' }}
                            >
                                View Group Contactable Prospects
                            </Link>
                        </div>
                        <div style={{ marginTop: 10, fontSize: 12, color: '#64748b' }}>Advanced batch controls</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                            <button type="button" disabled={!!busy || autoJobRunning || !selectedGroup?.groupUrl} style={btn('#fff', '#334155')} onClick={() => onAnalyzeExactGroup({ ...selectedGroup, canAnalyzeMembers: true }, 'next_batch')}>
                                Run Next Batch
                            </button>
                            <button type="button" disabled={!!busy || autoJobRunning || !selectedGroup?.groupUrl} style={btn('#fff', '#334155')} onClick={() => onAnalyzeExactGroup({ ...selectedGroup, canAnalyzeMembers: true }, 'full_discovery')}>
                                Run Full Accessible Group
                            </button>
                            <button type="button" disabled={!!busy || autoJobRunning || !selectedGroup?.groupUrl} style={btn('#fff', '#334155')} onClick={() => onAnalyzeExactGroup({ ...selectedGroup, canAnalyzeMembers: true }, 'review_next')}>
                                Review Next Batch
                            </button>
                            <button type="button" disabled={!!busy || autoJobRunning || !selectedGroup?.groupUrl} style={btn('#fff', '#334155')} onClick={() => onAnalyzeExactGroup({ ...selectedGroup, canAnalyzeMembers: true }, 'review_all')}>
                                Review All Pending
                            </button>
                        </div>
                    </div>

                    <button type="button" style={{ ...btn('#fff', '#334155'), marginBottom: 8 }} onClick={() => setShowPasteUrl((v) => !v)}>
                        {showPasteUrl ? 'Hide paste URL' : 'Advanced: paste Facebook Group URL'}
                    </button>
                    {showPasteUrl ? (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                            <input
                                value={pasteGroupUrl}
                                onChange={(e) => setPasteGroupUrl(e.target.value)}
                                placeholder="Optional fallback — https://www.facebook.com/groups/…"
                                style={{ flex: 1, minWidth: 240, padding: 8, border: '1px solid #cbd5e1', borderRadius: 8 }}
                            />
                            <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={() => onAnalyzeExactGroup({ groupUrl: pasteGroupUrl.trim(), groupName: '' })}>
                                Analyze pasted URL
                            </button>
                        </div>
                    ) : null}

                    <div style={{ fontSize: 13, fontWeight: 700, margin: '8px 0 6px' }}>Page community</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={() => onAnalyzeCommunity('page_audience')}>Analyze Audience</button>
                        <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={() => onAnalyzeCommunity('page_engagement')}>Analyze Engagement</button>
                        <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={() => onAnalyzeCommunity('related_pages')}>Find Related Pages</button>
                    </div>
                </div>
            ) : null}

            {(status?.limitations || []).map((t) => (
                <p key={t} style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 8 }}>{t}</p>
            ))}

            {cfg.testPublicUrl ? (
                <div style={{ border: '1px dashed #94a3b8', borderRadius: 8, padding: 12, marginBottom: 16, background: '#fff' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Test Public URL</div>
                    <p style={{ fontSize: 12, color: '#64748b', marginTop: 0 }}>
                        No-login pipeline check. Uses existing classification and Processing. Does not mark Direct Login as connected.
                    </p>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Public URL</label>
                    <input value={publicUrl} onChange={(e) => setPublicUrl(e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 12 }} />
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Known company website (optional)</label>
                    <input value={knownWebsite} onChange={(e) => setKnownWebsite(e.target.value)} placeholder="Only if genuinely known — do not invent" style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 8, marginBottom: 12 }} />
                    <button type="button" disabled={!!busy} style={btn('#0f766e')} onClick={onTestPublicUrl}>
                        {busy === 'testurl' ? 'Testing…' : 'TEST & SEND TO PROCESSING'}
                    </button>
                </div>
            ) : null}

            {!(platform === 'facebook' && (searchType === 'group_intelligence' || searchType === 'groups')) ? (
                <button type="button" disabled={!!busy} style={btn('#1d4ed8')} onClick={onStart}>
                    {busy === 'extract'
                        ? (mode === 'direct_login'
                            ? `Running in Chrome… ${elapsedSec}s`
                            : `Searching… ${elapsedSec}s`)
                        : (cfg.extractLabel || `START ${label.toUpperCase()} EXTRACTION`)}
                </button>
            ) : (busy === 'extract' ? (
                <p style={{ fontSize: 13, color: '#9a3412' }}>
                    Running in Chrome… {elapsedSec}s — use Pause / Stop on Selected Group. Keep the Chrome window open.
                </p>
            ) : null)}
            {platform === 'instagram' && busy === 'extract' ? (
                <button type="button" style={{ ...btn('#b91c1c'), marginLeft: 8 }} onClick={onStopInstagram}>
                    Stop
                </button>
            ) : null}
            {platform === 'instagram' ? (
                <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    Instagram processes results in controlled batches and continues while additional accessible profiles are available.
                </p>
            ) : null}
            {((busy === 'extract' && mode === 'direct_login') || autoJobRunning) ? (
                <p style={{ fontSize: 12, color: '#9a3412', marginTop: 8 }}>
                    Keep the Chrome window open. The Facebook job continues on the backend if you leave this screen. Counts update automatically without reloading the page.
                </p>
            ) : null}

            {platform === 'instagram' && busy === 'extract' ? (
                <div style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, fontSize: 13, background: '#fff' }}>
                    <div>Batch size: <strong>5</strong></div>
                    <div>Status: <strong>Loading more</strong></div>
                </div>
            ) : null}

            {result ? (
                <div style={{ marginTop: 16, border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: 8, padding: 12, fontSize: 13 }}>
                    <p style={{ marginTop: 0 }}>{result.note}</p>
                    <p>Ingested: <strong>{result.ingested || 0}</strong>{result.duplicate ? ' (existing URL updated)' : ''}{result.testOnly ? ' · testOnly' : ''}{result.mode ? ` · ${result.mode}` : ''}</p>
                    {platform === 'instagram' && result.instagramRun ? (
                        <div style={{ margin: '8px 0' }}>
                            <div>Batch size: <strong>{result.instagramRun.batchSize}</strong></div>
                            <div>Total captured: <strong>{result.instagramRun.totalCaptured}</strong></div>
                            <div>New this batch: <strong>{result.instagramRun.newThisBatch}</strong></div>
                            <div>Already known: <strong>{result.instagramRun.alreadyKnown}</strong></div>
                            <div>Status: <strong>{result.instagramRun.status}</strong></div>
                            <div>Stop reason: <strong>{result.instagramRun.stopReason}</strong></div>
                            {(result.instagramRun.batches || []).map((b) => (
                                <div key={b.index} style={{ color: '#64748b', fontSize: 12 }}>
                                    Batch {b.index} → {b.newCount} profile(s)
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {platform === 'facebook' && result.facebookCommunityRun ? (
                        <div style={{ margin: '8px 0' }}>
                            <div>People tab: <strong>{result.facebookCommunityRun.analytics?.peopleTabStatus || (result.facebookCommunityRun.analytics?.peopleTabOpened ? 'active' : '—')}</strong></div>
                            <div>Batch size: <strong>{result.facebookCommunityRun.batchSize}</strong></div>
                            <div>Accessible People-tab profiles: <strong>{result.facebookCommunityRun.analytics?.accessiblePeopleTabProfilesLoaded ?? 0}</strong></div>
                            <div>Relevant: <strong>{result.facebookCommunityRun.analytics?.relevant ?? 0}</strong></div>
                            <div>New companies: <strong>{result.facebookCommunityRun.analytics?.newUniqueCompanies ?? result.facebookCommunityRun.newThisRun}</strong></div>
                            <div>Total captured: <strong>{result.facebookCommunityRun.totalCaptured}</strong></div>
                            <div>Already known: <strong>{result.facebookCommunityRun.alreadyKnown}</strong></div>
                            <div>Status: <strong>{result.facebookCommunityRun.stopReason === 'source_exhausted' ? 'Source exhausted' : (result.facebookCommunityRun.stopReason || 'done')}</strong></div>
                            <div>Stop reason: <strong>{result.facebookCommunityRun.stopReason}</strong></div>
                            {result.facebookCommunityRun.analytics?.stopNote ? (
                                <div>Stop note: <strong>{result.facebookCommunityRun.analytics.stopNote}</strong></div>
                            ) : null}
                            {(result.facebookCommunityRun.batches || []).map((b) => (
                                <div key={b.index} style={{ color: '#64748b', fontSize: 12 }}>
                                    Batch {b.index} → {b.newCount} profile(s)
                                </div>
                            ))}
                        </div>
                    ) : null}
                    {(result.errors || []).length ? <p style={{ color: '#b91c1c' }}>{result.errors.join(' ')}</p> : null}
                    {result.processingUrl ? (
                        <Link to={result.sessionId ? PATHS.DATA_EXTRACTOR.RUN(result.sessionId) : PATHS.DATA_EXTRACTOR.SIMPLE_LEAD_SEARCH}>
                            Open Processing → Verified Data
                        </Link>
                    ) : null}
                    {platform === 'instagram' || platform === 'facebook' ? null : (result.records || []).slice(0, 8).map((r) => (
                        <div key={r.resultUrl} style={{ marginTop: 6 }}>
                            <a href={r.resultUrl} target="_blank" rel="noreferrer">{r.title || r.resultUrl}</a>
                            <span style={{ color: '#64748b' }}> · {r.resultTypeHint}</span>
                        </div>
                    ))}
                </div>
            ) : null}

            {platform === 'instagram' ? (
                <InstagramCaptureResults
                    keyword={keyword.trim()}
                    location={location.trim()}
                    campaignId={captureCampaignId}
                    reloadToken={captureReload}
                />
            ) : null}
            {platform === 'facebook' ? (
                <div id="facebook-member-results">
                    <FacebookCommunityResults
                    keyword={keyword.trim()}
                    location={location.trim()}
                    groupUrl={selectedGroup?.groupUrl || ''}
                    reloadToken={captureReload}
                    analytics={result?.facebookCommunityRun?.analytics || result?.groupMeta || null}
                    onAnalyzeGroup={onAnalyzeExactGroup}
                    />
                </div>
            ) : null}
            <DataExtractorClearHistoryModal
                open={clearOpen}
                onClose={() => { setClearOpen(false); setPendingExtract(false); }}
                defaultScope={pendingExtract
                    ? (platform === 'instagram' ? 'instagram' : 'facebook_current')
                    : (platform === 'instagram' ? 'instagram' : 'facebook_all')}
                keyword={keyword.trim()}
                location={location.trim()}
                freshMode={Boolean(pendingExtract)}
                onCleared={() => {
                    setCaptureReload((n) => n + 1);
                    if (pendingExtract === 'start') {
                        setPendingExtract(false);
                        onStart({ afterClear: true });
                    }
                }}
            />
        </div>
    );
}
