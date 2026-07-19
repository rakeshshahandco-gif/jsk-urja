import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { RISK } from '../config.js';
import { repoRoot } from './env.js';

function gitInfo() {
    const root = repoRoot();
    const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8' });
    const sha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' });
    return {
        branch: (branch.stdout || '').trim() || '(unknown)',
        sha: (sha.stdout || '').trim() || '(unknown)',
    };
}

export function buildSafeChangeReport({
    summary,
    results,
    context = {},
    categoriesRun = [],
} = {}) {
    const git = gitInfo();
    const byCategory = {};
    for (const r of results) {
        byCategory[r.category] = byCategory[r.category] || { PASS: 0, FAIL: 0, SKIP: 0 };
        byCategory[r.category][r.status] = (byCategory[r.category][r.status] || 0) + 1;
    }

    const lines = [];
    lines.push('CRM SAFE CHANGE REPORT');
    lines.push('='.repeat(72));
    lines.push(`Date:            ${new Date().toISOString()}`);
    lines.push(`Branch:          ${git.branch} @ ${git.sha}`);
    lines.push(`Environment:     ${context.environment || process.env.NODE_ENV || 'development'}`);
    lines.push(`Mode:            ${context.live ? 'LIVE (API)' : 'OFFLINE / UNIT'}`);
    lines.push(`Companies:       ${context.companies || 'Handloom Group, JSK URJA'}`);
    lines.push(`Databases:       ${context.databases || 'handloom_crm, jsk-esarthi-ui-dev'}`);
    lines.push(`Categories:      ${categoriesRun.join(', ') || '(all)'}`);
    lines.push('');
    lines.push('SUMMARY');
    lines.push('-'.repeat(72));
    lines.push(`Passed:          ${summary.passed}`);
    lines.push(`Failed:          ${summary.failed}`);
    lines.push(`Skipped:         ${summary.skipped}`);
    lines.push(`Warnings:        ${summary.warnings}`);
    lines.push(`Risk Level:      ${summary.riskLevel}`);
    lines.push(`Block Deploy:    ${summary.blockDeployment ? 'YES — BLOCK DEPLOYMENT' : 'NO'}`);
    lines.push('');
    lines.push('BY CATEGORY');
    lines.push('-'.repeat(72));
    for (const [cat, counts] of Object.entries(byCategory)) {
        lines.push(`  ${cat.padEnd(22)} PASS=${counts.PASS || 0}  FAIL=${counts.FAIL || 0}  SKIP=${counts.SKIP || 0}`);
    }

    if (summary.failures?.length) {
        lines.push('');
        lines.push('FAILURES');
        lines.push('-'.repeat(72));
        for (const f of summary.failures) {
            lines.push(`  [${f.risk || RISK.HIGH}] ${f.category} / ${f.name}`);
            if (f.code) lines.push(`    code: ${f.code}`);
            if (f.detail) lines.push(`    ${f.detail}`);
        }
    }

    lines.push('');
    lines.push('DEPLOYMENT BLOCKER RULES');
    lines.push('-'.repeat(72));
    lines.push('  Sales regression, company leak, wrong database/identity, wrong print,');
    lines.push('  wrong GST/totals, auth failure, cross-company access → BLOCK DEPLOYMENT');
    lines.push('');
    lines.push('NOTES');
    lines.push('-'.repeat(72));
    lines.push('  Framework is read-only. It does not mutate Sales/GST/Print business rules.');
    lines.push('  CI/CD integration requires explicit approval (Phase 2.5).');
    lines.push('='.repeat(72));

    return lines.join('\n');
}

export function writeReport(text, { outDir } = {}) {
    const dir = outDir || path.join(repoRoot(), 'backend/tools/regression/reports');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `CRM-SAFE-CHANGE-REPORT-${stamp}.txt`);
    fs.writeFileSync(file, text, 'utf8');
    const latest = path.join(dir, 'CRM-SAFE-CHANGE-REPORT-latest.txt');
    fs.writeFileSync(latest, text, 'utf8');
    return { file, latest };
}
