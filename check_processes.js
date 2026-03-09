import { execSync } from 'child_process';

function checkPort(port) {
    console.log(`Checking port ${port}...`);
    try {
        const netstat = execSync(`netstat -ano | findstr :${port}`).toString();
        console.log(netstat);
        const lines = netstat.trim().split('\n');
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && pid !== '0') {
                console.log(`Found PID ${pid} on port ${port}. Identifying process...`);
                try {
                    const tasklist = execSync(`tasklist /fi "pid eq ${pid}" /v`).toString();
                    console.log(tasklist);
                    const wmic = execSync(`wmic process where "ProcessID=${pid}" get ExecutablePath, CommandLine`).toString();
                    console.log(wmic);
                } catch (e) {
                    console.log(`Could not identify process ${pid}: ${e.message}`);
                }
            }
        }
    } catch (e) {
        console.log(`No process found on port ${port} or error: ${e.message}`);
    }
}

checkPort(5000);
checkPort(4000);
