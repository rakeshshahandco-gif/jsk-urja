import fs from 'fs';
import path from 'path';
import { FINAL_DECISIONS } from './contexts.js';
import { regressionRoot } from '../lib/env.js';

export function writeGuardReport(payload) {
    const dir = path.join(regressionRoot(), 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = path.join(dir, `SAFE-CHANGE-GUARD-${stamp}.json`);
    const mdPath = path.join(dir, `SAFE-CHANGE-GUARD-${stamp}.md`);
    const latestJson = path.join(dir, 'SAFE-CHANGE-GUARD-latest.json');
    const latestMd = path.join(dir, 'SAFE-CHANGE-GUARD-latest.md');

    const safe = sanitizeReport(payload);
    fs.writeFileSync(jsonPath, JSON.stringify(safe, null, 2), 'utf8');
    fs.writeFileSync(latestJson, JSON.stringify(safe, null, 2), 'utf8');

    const md = toMarkdown(safe);
    fs.writeFileSync(mdPath, md, 'utf8');
    fs.writeFileSync(latestMd, md, 'utf8');

    return { jsonPath, mdPath, latestJson, latestMd };
}

function sanitizeReport(payload) {
    const clone = JSON.parse(JSON.stringify(payload));
    // Strip any accidental secret-looking fields
    const forbidden = ['password', 'token', 'secret', 'mongoUri', 'mongodb_url', 'authorization', 'cookie'];
    const scrub = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const k of Object.keys(obj)) {
            if (forbidden.some((f) => k.toLowerCase().includes(f))) {
                obj[k] = '[redacted]';
                continue;
            }
            if (typeof obj[k] === 'object') scrub(obj[k]);
        }
    };
    scrub(clone);
    return clone;
}

function toMarkdown(r) {
    const lines = [];
    lines.push('# CRM SAFE CHANGE GUARD REPORT');
    lines.push('');
    lines.push(`- **Timestamp:** ${r.timestamp}`);
    lines.push(`- **Repository:** ${r.repositoryRoot}`);
    lines.push(`- **Project:** ${r.project?.label || r.project?.key || '(unknown)'}`);
    lines.push(`- **Branch:** ${r.git?.branch}`);
    lines.push(`- **Commit:** ${r.git?.commitShort}`);
    lines.push(`- **Identity expected:** ${r.project?.applicationKey}`);
    lines.push(`- **Company expected:** ${r.project?.companyName}`);
    lines.push(`- **Database expected:** ${r.project?.databaseName}`);
    lines.push(`- **Ports expected:** FE :${r.project?.frontendPort} / BE :${r.project?.backendPort}`);
    lines.push(`- **Environment:** ${r.environment}`);
    lines.push(`- **CI mode:** ${r.ci ? 'yes' : 'no'}`);
    lines.push(`- **Risk:** ${r.risk?.overallRisk}`);
    lines.push(`- **Recommended level:** ${r.risk?.recommendedLevel}`);
    lines.push(`- **Final decision:** ${r.finalDecision}`);
    lines.push(`- **Exit code:** ${r.exitCode}`);
    lines.push('');
    lines.push('## Git');
    lines.push(`- Dirty: ${r.git?.dirty}`);
    lines.push(`- Merge conflicts: ${r.git?.hasMergeConflicts}`);
    lines.push(`- Modified: ${(r.git?.modified || []).length}`);
    lines.push(`- Staged: ${(r.git?.staged || []).length}`);
    lines.push(`- Untracked: ${(r.git?.untracked || []).length}`);
    lines.push(`- Deleted: ${(r.git?.deleted || []).length}`);
    lines.push('');
    lines.push('## Ports');
    for (const p of r.ports || []) {
        lines.push(
            `- :${p.port} listening=${p.listening} expected=${p.expectedOwner || '-'} `
            + `mismatch=${p.mismatch} pids=${(p.pids || []).join(',') || '-'}`,
        );
    }
    lines.push('');
    lines.push('## Selected suites');
    lines.push((r.selectedSuites || []).join(', ') || '(none)');
    lines.push('');
    lines.push('## Blockers');
    if (!(r.blockers || []).length) lines.push('- (none)');
    else for (const b of r.blockers) lines.push(`- ${b}`);
    lines.push('');
    lines.push('## Warnings');
    if (!(r.warnings || []).length) lines.push('- (none)');
    else for (const w of r.warnings) lines.push(`- ${w}`);
    lines.push('');
    lines.push(`Allowed decisions include: ${Object.values(FINAL_DECISIONS).join(' · ')}`);
    lines.push('');
    lines.push('_No secrets, passwords, or Mongo URIs are included in this report._');
    return lines.join('\n');
}

export function printLatestReport() {
    const latestMd = path.join(regressionRoot(), 'reports', 'SAFE-CHANGE-GUARD-latest.md');
    const latestTxt = path.join(regressionRoot(), 'reports', 'CRM-SAFE-CHANGE-REPORT-latest.txt');
    if (fs.existsSync(latestMd)) {
        console.log(fs.readFileSync(latestMd, 'utf8'));
        return { ok: true, file: latestMd };
    }
    if (fs.existsSync(latestTxt)) {
        console.log(fs.readFileSync(latestTxt, 'utf8'));
        return { ok: true, file: latestTxt };
    }
    console.log('No Safe Change Report found. Run npm run safe-change:check or npm run regression:fast first.');
    return { ok: false, file: null };
}
