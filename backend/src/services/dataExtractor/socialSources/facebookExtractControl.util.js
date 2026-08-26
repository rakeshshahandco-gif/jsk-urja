const running = new Map();
const groupSearch = new Map();
const ACTIVITY_MAX = 40;
const GROUP_SEARCH_MAX = 500;

function key(companyId) {
    return String(companyId || '');
}

function trimActivity(feed = []) {
    return (Array.isArray(feed) ? feed : []).slice(-ACTIVITY_MAX);
}

function wrap(k) {
    return {
        shouldStop: () => {
            const cur = running.get(k);
            return Boolean(cur?.stopRequested || cur?.pauseRequested);
        },
        wasPaused: () => Boolean(running.get(k)?.pauseRequested),
        wasStopped: () => Boolean(running.get(k)?.stopRequested),
        setProgress: (patch) => {
            const cur = running.get(k);
            if (!cur) return;
            cur.progress = { ...(cur.progress || {}), ...patch, updatedAt: Date.now() };
        },
    };
}

export function beginFacebookExtract(companyId, meta = {}) {
    const k = key(companyId);
    running.set(k, {
        stopRequested: false,
        pauseRequested: false,
        startedAt: Date.now(),
        progress: { activity: [] },
        groupId: String(meta.groupId || ''),
        groupUrl: String(meta.groupUrl || ''),
        groupName: String(meta.groupName || ''),
        auto: Boolean(meta.auto),
        uniqueAtStart: Number(meta.uniqueAtStart || 0) || 0,
    });
    return wrap(k);
}

export function tryBeginFacebookExtract(companyId, meta = {}) {
    const k = key(companyId);
    const existing = running.get(k);
    if (existing) {
        return {
            ok: false,
            alreadyRunning: true,
            job: existing,
            ctl: wrap(k),
        };
    }
    return {
        ok: true,
        alreadyRunning: false,
        ctl: beginFacebookExtract(companyId, meta),
        job: running.get(k),
    };
}

export function isFacebookExtractRunning(companyId) {
    return running.has(key(companyId));
}

export function requestFacebookExtractStop(companyId) {
    const k = key(companyId);
    const cur = running.get(k);
    if (!cur) return { ok: true, running: false, stopRequested: false };
    cur.stopRequested = true;
    running.set(k, cur);
    return { ok: true, running: true, stopRequested: true };
}

export function requestFacebookExtractPause(companyId) {
    const k = key(companyId);
    const cur = running.get(k);
    if (!cur) return { ok: true, running: false, pauseRequested: false };
    cur.pauseRequested = true;
    running.set(k, cur);
    return { ok: true, running: true, pauseRequested: true, stopRequested: false };
}

export function getFacebookExtractProgress(companyId) {
    const k = key(companyId);
    const cur = running.get(k);
    if (!cur) return { running: false, stopRequested: false, pauseRequested: false, progress: null };
    const uniqueNow = Number(cur.progress?.uniqueMembersCollected || 0);
    return {
        running: true,
        stopRequested: Boolean(cur.stopRequested),
        pauseRequested: Boolean(cur.pauseRequested),
        startedAt: cur.startedAt,
        groupId: cur.groupId || '',
        groupUrl: cur.groupUrl || '',
        groupName: cur.groupName || '',
        auto: Boolean(cur.auto),
        uniqueAtStart: Number(cur.uniqueAtStart || 0),
        newThisRun: Math.max(0, uniqueNow - Number(cur.uniqueAtStart || 0)),
        progress: cur.progress || {},
        activity: trimActivity(cur.progress?.activity),
    };
}

export function setFacebookExtractUniqueAtStart(companyId, n) {
    const cur = running.get(key(companyId));
    if (cur) cur.uniqueAtStart = Number(n || 0) || 0;
}

export function pushFacebookActivity(companyId, text) {
    const k = key(companyId);
    const cur = running.get(k);
    const line = String(text || '').trim().slice(0, 180);
    if (!cur || !line) return;
    const feed = Array.isArray(cur.progress?.activity) ? cur.progress.activity.slice() : [];
    const last = feed[feed.length - 1];
    const now = Date.now();
    if (last && last.text === line && now - Number(last.t || 0) < 1500) return;
    feed.push({ t: now, text: line });
    cur.progress = {
        ...(cur.progress || {}),
        activity: trimActivity(feed),
        lastActivityLine: line,
        updatedAt: now,
    };
}

export function endFacebookExtract(companyId) {
    running.delete(key(companyId));
}

export function beginFacebookGroupSearch(companyId, meta = {}) {
    const k = key(companyId);
    groupSearch.set(k, {
        running: true,
        startedAt: Date.now(),
        kind: String(meta.kind || 'find'),
        keyword: String(meta.keyword || ''),
        seekGroupId: String(meta.seekGroupId || ''),
        status: meta.seekGroupId
            ? `Searching for Group ID: ${meta.seekGroupId}`
            : 'Searching Facebook...',
        groups: [],
        activity: [],
        found: 0,
        matchedGroupId: '',
    });
}

export function publishFacebookGroupSearchRow(companyId, row = {}) {
    const k = key(companyId);
    const cur = groupSearch.get(k);
    if (!cur || !row.groupUrl) return;
    const existing = cur.groups.find((g) => g.groupUrl === row.groupUrl);
    if (existing) {
        Object.assign(existing, row, { seq: existing.seq, status: existing.status || 'Found' });
        return;
    }
    if (cur.groups.length >= GROUP_SEARCH_MAX) return;
    const seq = cur.groups.length + 1;
    cur.groups.push({
        ...row,
        seq,
        status: 'Found',
    });
    cur.found = cur.groups.length;
    const label = [row.groupName || 'Group', row.members || ''].filter(Boolean).join(' — ');
    cur.activity = trimActivity([
        ...(cur.activity || []),
        { t: Date.now(), text: `Found ${seq} — ${label}` },
    ]);
    cur.status = cur.seekGroupId
        ? `Loading more joined groups... (${cur.found})`
        : 'Searching Facebook...';
}

export function markFacebookGroupSearchMatch(companyId, groupId = '') {
    const cur = groupSearch.get(key(companyId));
    if (!cur) return;
    cur.matchedGroupId = String(groupId || '').trim();
    cur.status = 'Exact Group Found';
    cur.running = false;
}

export function setFacebookGroupSearchStatus(companyId, status = '') {
    const cur = groupSearch.get(key(companyId));
    if (!cur) return;
    cur.status = String(status || cur.status || 'Searching Facebook...');
}

export function endFacebookGroupSearch(companyId, { keepRows = true } = {}) {
    const k = key(companyId);
    const cur = groupSearch.get(k);
    if (!cur) return;
    cur.running = false;
    cur.status = cur.found ? `Found ${cur.found} group(s)` : 'No groups found';
    if (!keepRows) groupSearch.delete(k);
}

export function getFacebookGroupSearchProgress(companyId) {
    const cur = groupSearch.get(key(companyId));
    if (!cur) return { running: false, groups: [], found: 0, status: '', activity: [], kind: '' };
    return {
        running: Boolean(cur.running),
        kind: cur.kind || '',
        keyword: cur.keyword || '',
        seekGroupId: cur.seekGroupId || '',
        matchedGroupId: cur.matchedGroupId || '',
        status: cur.status || '',
        found: cur.found || cur.groups.length,
        groups: cur.groups || [],
        activity: trimActivity(cur.activity),
    };
}
