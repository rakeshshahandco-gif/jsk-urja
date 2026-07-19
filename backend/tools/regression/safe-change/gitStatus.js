import { spawnSync } from 'child_process';
import path from 'path';

function git(cwd, args) {
    const res = spawnSync('git', args, {
        cwd,
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
    });
    return {
        ok: res.status === 0,
        stdout: (res.stdout || '').trim(),
        stderr: (res.stderr || '').trim(),
        status: res.status,
    };
}

/**
 * Read-only git snapshot for Safe Change Guard.
 */
export function collectGitStatus(repoRoot) {
    const root = path.resolve(repoRoot);
    const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const commit = git(root, ['rev-parse', '--short', 'HEAD']);
    const full = git(root, ['rev-parse', 'HEAD']);
    const porcelain = git(root, ['status', '--porcelain']);
    const aheadBehind = git(root, ['status', '-sb']);
    const conflicts = git(root, ['diff', '--name-only', '--diff-filter=U']);

    const modified = [];
    const staged = [];
    const untracked = [];
    const deleted = [];

    for (const line of (porcelain.stdout || '').split(/\r?\n/)) {
        if (!line || line.length < 4) continue;
        const x = line[0];
        const y = line[1];
        const file = line.slice(3).trim();
        if (x === '?' && y === '?') {
            untracked.push(file);
            continue;
        }
        if (x !== ' ' && x !== '?') staged.push(file);
        if (y !== ' ' && y !== '?') modified.push(file);
        if (x === 'D' || y === 'D') deleted.push(file);
        // Also count staged+unstaged as changed
        if (x !== '?' && y !== '?' && !modified.includes(file) && (x !== ' ' || y !== ' ')) {
            if (!modified.includes(file) && y !== ' ') modified.push(file);
        }
    }

    // Unique changed set for risk classifier
    const changedFiles = [...new Set([...modified, ...staged, ...untracked, ...deleted])];

    const sb = aheadBehind.stdout || '';
    const conflictFiles = (conflicts.stdout || '').split(/\r?\n/).filter(Boolean);
    const dirty = changedFiles.length > 0;

    return {
        repositoryRoot: root,
        branch: branch.stdout || '(unknown)',
        commitShort: commit.stdout || '(unknown)',
        commitFull: full.stdout || '(unknown)',
        statusShort: sb.split('\n')[0] || '',
        dirty,
        modified: [...new Set(modified)],
        staged: [...new Set(staged)],
        untracked: [...new Set(untracked)],
        deleted: [...new Set(deleted)],
        changedFiles,
        mergeConflicts: conflictFiles,
        hasMergeConflicts: conflictFiles.length > 0,
    };
}
