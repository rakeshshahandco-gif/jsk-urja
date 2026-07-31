import net from 'net';
import { lookup } from 'dns/promises';

const BLOCKED_HOSTS = new Set([
    'localhost',
    'metadata.google.internal',
    'metadata',
    'instance-data',
    '169.254.169.254',
]);

function ipToLong(ip) {
    return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isPrivateIpv4(ip) {
    if (!net.isIPv4(ip)) return false;
    const n = ipToLong(ip);
    const ranges = [
        [ipToLong('10.0.0.0'), ipToLong('10.255.255.255')],
        [ipToLong('127.0.0.0'), ipToLong('127.255.255.255')],
        [ipToLong('169.254.0.0'), ipToLong('169.254.255.255')],
        [ipToLong('172.16.0.0'), ipToLong('172.31.255.255')],
        [ipToLong('192.168.0.0'), ipToLong('192.168.255.255')],
        [ipToLong('0.0.0.0'), ipToLong('0.255.255.255')],
    ];
    return ranges.some(([a, b]) => n >= a && n <= b);
}

function isPrivateIpv6(ip) {
    if (!net.isIPv6(ip)) return false;
    const lower = ip.toLowerCase();
    return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80');
}

export function assertPublicHttpUrl(rawUrl) {
    let u;
    try {
        u = new URL(String(rawUrl || '').trim());
    } catch {
        throw new Error('Invalid URL');
    }
    if (!['http:', 'https:'].includes(u.protocol)) {
        throw new Error('Only http/https URLs are allowed');
    }
    if (u.username || u.password) {
        throw new Error('URLs with credentials are not allowed');
    }
    const host = u.hostname.replace(/^[\[]|[\]]$/g, '').toLowerCase();
    if (!host || BLOCKED_HOSTS.has(host) || host.endsWith('.local') || host.endsWith('.internal')) {
        throw new Error('Private or local hostnames are not allowed');
    }
    if (net.isIP(host)) {
        if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
            throw new Error('Private IP addresses are not allowed');
        }
    }
    return u.toString();
}

export async function assertResolvedPublicUrl(rawUrl) {
    const normalized = assertPublicHttpUrl(rawUrl);
    const u = new URL(normalized);
    if (net.isIP(u.hostname)) return normalized;
    let addresses;
    try {
        addresses = await lookup(u.hostname, { all: true });
    } catch {
        throw new Error('Unable to resolve hostname');
    }
    for (const a of addresses) {
        if (isPrivateIpv4(a.address) || isPrivateIpv6(a.address)) {
            throw new Error('URL resolves to a private network address');
        }
    }
    return normalized;
}
