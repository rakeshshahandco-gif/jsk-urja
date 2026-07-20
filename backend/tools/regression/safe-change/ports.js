import { execSync } from 'child_process';
import { ALL_WATCH_PORTS, PRODUCT_CONTEXTS } from './contexts.js';

const isWin = process.platform === 'win32';

function getListeningPids(port) {
    const pids = new Set();
    try {
        if (!isWin) {
            const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
                encoding: 'utf8',
                timeout: 8000,
            });
            out.split('\n').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0).forEach((n) => pids.add(n));
            return [...pids];
        }
        const out = execSync(`netstat -ano | findstr ":${port} "`, {
            encoding: 'utf8',
            timeout: 10000,
            shell: true,
            windowsHide: true,
        });
        const suffix = `:${port}`;
        for (const line of out.split('\n')) {
            if (!line.includes('LISTENING')) continue;
            const parts = line.trim().split(/\s+/);
            const local = parts[1] || '';
            if (!local.endsWith(suffix) && !local.endsWith(`]:${port}`)) continue;
            const pid = parseInt(parts[parts.length - 1], 10);
            if (pid > 0) pids.add(pid);
        }
    } catch {
        /* free */
    }
    return [...pids];
}

function getProcessCommandLine(pid) {
    try {
        if (isWin) {
            const out = execSync(
                `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`,
                { encoding: 'utf8', timeout: 8000, windowsHide: true },
            );
            return (out || '').trim();
        }
        return execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8', timeout: 5000 }).trim();
    } catch {
        return '';
    }
}

function guessProject(cmd = '') {
    const c = String(cmd).replace(/\\/g, '/');
    if (/JSK-E-SARTHI-MASTER-jsk-deploy/i.test(c)) return 'jsk';
    if (/JSK-E-SARTHI-MASTER/i.test(c)) return 'handloom';
    if (/handloom/i.test(c)) return 'handloom';
    if (/jsk/i.test(c)) return 'jsk';
    return 'unknown';
}

function expectedOwnerForPort(port) {
    for (const ctx of Object.values(PRODUCT_CONTEXTS)) {
        if (ctx.frontendPort === port || ctx.backendPort === port) return ctx.key;
    }
    return null;
}

/**
 * Inspect ports — report only. Never terminates processes.
 */
export function inspectPorts(ports = ALL_WATCH_PORTS) {
    const rows = [];
    for (const port of ports) {
        const pids = getListeningPids(port);
        if (!pids.length) {
            rows.push({
                port,
                listening: false,
                pids: [],
                processes: [],
                expectedOwner: expectedOwnerForPort(port),
                mismatch: false,
            });
            continue;
        }
        const processes = pids.map((pid) => {
            const cmd = getProcessCommandLine(pid);
            return { pid, commandLine: cmd.slice(0, 240), likelyProject: guessProject(cmd) };
        });
        const expected = expectedOwnerForPort(port);
        const owners = [...new Set(processes.map((p) => p.likelyProject).filter((x) => x !== 'unknown'))];
        const mismatch = Boolean(
            expected
            && owners.length
            && owners.some((o) => o !== expected),
        );
        rows.push({
            port,
            listening: true,
            pids,
            processes,
            expectedOwner: expected,
            detectedOwners: owners,
            mismatch,
            duplicate: pids.length > 1,
        });
    }
    return rows;
}
