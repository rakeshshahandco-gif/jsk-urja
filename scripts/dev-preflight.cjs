/**
 * Local dev preflight: check ports 5000/4000, kill only CRM-related node.exe duplicates.
 * Usage: node scripts/dev-preflight.cjs [--ports 5000,4000] [--check-only]
 * Set SKIP_DEV_PORT_CLEAR=1 to skip killing processes.
 */
const { execSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const isWin = process.platform === 'win32';
const shell = { shell: true, encoding: 'utf8' };

function parseArgs() {
    const args = process.argv.slice(2);
    let ports = [5000, 4000];
    let checkOnly = false;
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--ports' && args[i + 1]) {
            ports = args[i + 1].split(',').map((p) => Number(p.trim())).filter(Boolean);
            i += 1;
        } else if (args[i] === '--check-only') {
            checkOnly = true;
        }
    }
    const envPort = Number(process.env.PORT);
    if (envPort && !args.includes('--ports')) {
        ports = [...new Set([envPort, ...ports])];
    }
    return { ports, checkOnly };
}

function getListeningPids(port) {
    const pids = new Set();
    if (isWin) {
        let out = '';
        try {
            out = execSync(`netstat -ano | findstr ":${port} "`, { ...shell, timeout: 10000 });
        } catch {
            return [];
        }
        const suffix = `:${port}`;
        for (const line of out.split('\n')) {
            if (!line.includes('LISTENING')) continue;
            const local = line.trim().split(/\s+/)[1] || '';
            if (!local.endsWith(suffix) && !local.endsWith(`]:${port}`)) continue;
            const pid = parseInt(line.trim().split(/\s+/).pop(), 10);
            if (pid > 0) pids.add(pid);
        }
        return [...pids];
    }
    try {
        const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, { ...shell, timeout: 8000 });
        return out.split('\n').map((s) => parseInt(s.trim(), 10)).filter((n) => n > 0);
    } catch {
        return [];
    }
}

function getProcessInfo(pid) {
    if (isWin) {
        let name = '';
        let commandLine = '';
        try {
            const tl = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, { ...shell, timeout: 5000 });
            const m = tl.match(/^"([^"]+)"/);
            if (m) name = m[1].trim().toLowerCase();
        } catch { /* ignore */ }
        try {
            const out = execSync(
                `wmic process where "ProcessId=${pid}" get CommandLine /format:list`,
                { ...shell, timeout: 8000 },
            );
            for (const line of out.split('\n')) {
                if (line.startsWith('CommandLine=')) commandLine = line.slice(12).trim();
            }
        } catch { /* ignore */ }
        return { name, commandLine };
    }
    try {
        const name = execSync(`ps -p ${pid} -o comm=`, { ...shell, timeout: 5000 }).trim().toLowerCase();
        const commandLine = execSync(`ps -p ${pid} -o args=`, { ...shell, timeout: 5000 }).trim();
        return { name, commandLine };
    } catch {
        return { name: '', commandLine: '' };
    }
}

function isNodeProcess(name) {
    return name === 'node.exe' || name === 'node';
}

function isCrmDevProcess(port, commandLine) {
    const cmd = (commandLine || '').replace(/\\/g, '/').toLowerCase();
    if (port === 5000 && (cmd.includes('index.js') || cmd.includes('nodemon'))) return true;
    if (port === 4000 && cmd.includes('vite')) return true;
    const rootNorm = ROOT.replace(/\\/g, '/').toLowerCase();
    const backendNorm = BACKEND_DIR.replace(/\\/g, '/').toLowerCase();
    if (cmd.includes(backendNorm) || cmd.includes(rootNorm)) return true;
    if (cmd.includes('jskurja') || cmd.includes('crm-backend') || cmd.includes('crm-app')) return true;
    return cmd.includes('nodemon') || cmd.includes('vite');
}

function killPid(pid) {
    if (isWin) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore', shell: true, timeout: 10000 });
    } else {
        execSync(`kill -9 ${pid}`, { stdio: 'ignore', timeout: 5000 });
    }
}

const report = {
    backendPort: 5000,
    frontendPort: 4000,
    ports: {},
    blocked: [],
    killed: [],
    ok: true,
};

function run() {
    const { ports, checkOnly } = parseArgs();
    const skipKill = process.env.SKIP_DEV_PORT_CLEAR === '1';

    console.log('\n=== JSK URJA Local Dev Preflight ===\n');

    for (const port of ports) {
        const key = port === 5000 ? '5000' : port === 4000 ? '4000' : String(port);
        report.ports[key] = { status: 'free', pids: [] };

        const pids = getListeningPids(port).filter((pid) => pid !== process.pid);
        if (pids.length === 0) {
            console.log(`Port ${port}: FREE`);
            continue;
        }

        for (const pid of pids) {
            const { name, commandLine } = getProcessInfo(pid);
            report.ports[key].pids.push({ pid, name, commandLine: commandLine.slice(0, 120) });

            if (!isNodeProcess(name)) {
                report.blocked.push({ port, pid, name: name || 'unknown', reason: 'Not a Node process — will not kill' });
                report.ok = false;
                console.error(`Port ${port}: BLOCKED — PID ${pid} (${name || 'unknown'}) is not Node. Stop it manually or change PORT.`);
                continue;
            }

            const crm = isCrmDevProcess(port, commandLine) || (!commandLine && isNodeProcess(name));
            if (!crm) {
                report.blocked.push({ port, pid, name, reason: 'Node process does not look like this CRM dev server' });
                report.ok = false;
                console.error(`Port ${port}: BLOCKED — PID ${pid} Node but not CRM dev (${commandLine.slice(0, 80)}...)`);
                continue;
            }

            if (checkOnly || skipKill) {
                report.ports[key].status = 'busy';
                report.ok = false;
                console.warn(`Port ${port}: IN USE by CRM Node PID ${pid} (check-only, not killed)`);
                continue;
            }

            try {
                killPid(pid);
                report.killed.push({ port, pid, name });
                report.ports[key].status = 'cleared';
                console.log(`Port ${port}: cleared duplicate CRM Node PID ${pid}`);
            } catch (e) {
                report.ok = false;
                console.error(`Port ${port}: failed to stop PID ${pid}`);
            }
        }
    }

    console.log('');
    if (report.blocked.length > 0) {
        console.error('Preflight FAILED — non-CRM or unknown process on port. See above.');
        process.exit(1);
    }
    if (!report.ok && (parseArgs().checkOnly || skipKill)) {
        process.exit(1);
    }
    console.log('Preflight OK — ports ready for single backend + frontend.\n');
}

run();
