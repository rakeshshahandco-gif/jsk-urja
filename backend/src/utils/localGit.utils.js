import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const GIT_OPTS = { cwd: repoRoot, timeout: 8000, maxBuffer: 1024 * 128 };

/** Read-only local git metadata for deploy tracking (localhost dev only). */
export async function getLocalGitInfo() {
    try {
        const { stdout: branch } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], GIT_OPTS);
        const { stdout: commit } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], GIT_OPTS);
        const { stdout: subject } = await execFileAsync('git', ['log', '-1', '--format=%s'], GIT_OPTS);
        const { stdout: logOut } = await execFileAsync('git', ['log', '-20', '--format=%h|%s|%ci'], GIT_OPTS);

        const recentCommits = logOut
            .trim()
            .split('\n')
            .filter(Boolean)
            .map((line) => {
                const [hash, message, date] = line.split('|');
                return { hash: hash || '', message: message || '', date: date || '' };
            });

        return {
            available: true,
            branch: branch.trim(),
            headCommit: commit.trim(),
            headMessage: subject.trim(),
            recentCommits,
        };
    } catch (err) {
        return {
            available: false,
            message: err?.message || 'Git not available in this environment',
        };
    }
}
