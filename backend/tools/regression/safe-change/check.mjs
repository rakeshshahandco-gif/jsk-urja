#!/usr/bin/env node
/**
 * Safe Change Guard — Phase 2.6
 * Usage: node backend/tools/regression/safe-change/check.mjs [--ci] [--json]
 *
 * Read-only. Does not commit, push, deploy, kill processes, or mutate DBs.
 */

import fs from 'fs';
import path from 'path';
import { repoRoot } from '../lib/env.js';
import { health } from '../lib/http.js';
import { detectContextFromRoot, FINAL_DECISIONS, ALL_WATCH_PORTS } from './contexts.js';
import { collectGitStatus } from './gitStatus.js';
import { inspectPorts } from './ports.js';
import { classifyChanges } from './riskClassifier.js';
import { writeGuardReport } from './reportGuard.js';

const REQUIRED_REGRESSION_FILES = [
    'backend/tools/regression/run.mjs',
    'backend/tools/regression/config.js',
    'backend/tools/regression/suites/module-state.js',
    'backend/tools/regression/suites/company-isolation.js',
    'backend/tools/regression/suites/sales-regression.js',
    'backend/tools/regression/suites/print.js',
];

function parseArgs(argv) {
    return {
        ci: argv.includes('--ci') || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true',
        json: argv.includes('--json'),
        skipHealth: argv.includes('--skip-health'),
    };
}

async function maybeHealth(ctx, skip) {
    if (skip || !ctx) return null;
    try {
        const r = await health(ctx.backendBase);
        if (!r.ok) return { reachable: false, error: r.error || `status=${r.status}` };
        return {
            reachable: true,
            applicationKey: r.data?.applicationKey || null,
            databaseName: r.data?.databaseName || null,
            port: r.data?.port || null,
            industryType: r.data?.industryType || null,
        };
    } catch (err) {
        return { reachable: false, error: err.message };
    }
}

function decide({ ci, blockers, warnings, risk, git, identityMismatch, portMismatch }) {
    if (blockers.length) {
        return { finalDecision: FINAL_DECISIONS.BLOCK_DEPLOYMENT, exitCode: 2 };
    }
    if (ci) {
        // Offline CI must never claim SAFE FOR DEPLOYMENT
        if (risk.overallRisk === 'HIGH') {
            return { finalDecision: FINAL_DECISIONS.SAFE_FOR_REVIEW, exitCode: 0 };
        }
        return { finalDecision: FINAL_DECISIONS.SAFE_FOR_REVIEW, exitCode: 0 };
    }
    if (identityMismatch || portMismatch) {
        return { finalDecision: FINAL_DECISIONS.BLOCK_DEPLOYMENT, exitCode: 2 };
    }
    if (git.hasMergeConflicts) {
        return { finalDecision: FINAL_DECISIONS.BLOCK_DEPLOYMENT, exitCode: 2 };
    }
    if (risk.overallRisk === 'HIGH') {
        if (git.dirty) {
            warnings.push('HIGH-risk changes with dirty tree — not SAFE FOR DEPLOYMENT');
            return { finalDecision: FINAL_DECISIONS.SAFE_FOR_REVIEW, exitCode: 0 };
        }
        return { finalDecision: FINAL_DECISIONS.SAFE_FOR_STAGING, exitCode: 0 };
    }
    if (git.dirty) {
        return { finalDecision: FINAL_DECISIONS.SAFE_FOR_LOCAL_DEVELOPMENT, exitCode: 0 };
    }
    return { finalDecision: FINAL_DECISIONS.SAFE_FOR_REVIEW, exitCode: 0 };
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const root = repoRoot();
    const project = detectContextFromRoot(root);
    const blockers = [];
    const warnings = [];

    if (!project) {
        blockers.push('Could not detect approved product context from repository root');
    }

    const git = collectGitStatus(root);
    if (git.hasMergeConflicts) {
        blockers.push(`Merge conflicts: ${git.mergeConflicts.join(', ')}`);
    }

    for (const rel of REQUIRED_REGRESSION_FILES) {
        if (!fs.existsSync(path.join(root, rel))) {
            blockers.push(`Required regression file missing: ${rel}`);
        }
    }

    // Critical unexpected deletions of sales/print/auth core
    const criticalDeleted = (git.deleted || []).filter((f) =>
        /salesOrder|salesInvoice|moduleGuard|moduleAccessDecision|auth\.controller/i.test(f));
    if (criticalDeleted.length) {
        blockers.push(`Critical files deleted: ${criticalDeleted.join(', ')}`);
    }

    const ports = inspectPorts(ALL_WATCH_PORTS);
    const portMismatch = ports.some((p) => p.mismatch);
    if (portMismatch) {
        const bad = ports.filter((p) => p.mismatch);
        blockers.push(
            `Port/process mismatch: ${bad.map((p) => `:${p.port} expected=${p.expectedOwner} got=${(p.detectedOwners || []).join('|')}`).join('; ')}`,
        );
    }
    for (const p of ports.filter((x) => x.duplicate)) {
        warnings.push(`Duplicate listeners on :${p.port} pids=${p.pids.join(',')}`);
    }

    const risk = classifyChanges(git.changedFiles);
    const selectedSuites = risk.suites.length
        ? risk.suites
        : ['environment', 'module-state', 'cache', 'company-isolation', 'security', 'database-safety'];

    let liveIdentity = null;
    let identityMismatch = false;
    if (project && !opts.ci) {
        liveIdentity = await maybeHealth(project, opts.skipHealth);
        if (liveIdentity?.reachable) {
            if (liveIdentity.applicationKey && liveIdentity.applicationKey !== project.applicationKey) {
                identityMismatch = true;
                blockers.push(
                    `Identity mismatch: expected ${project.applicationKey}, detected ${liveIdentity.applicationKey}`,
                );
            }
            if (liveIdentity.databaseName && liveIdentity.databaseName !== project.databaseName) {
                identityMismatch = true;
                blockers.push(
                    `Database mismatch: expected ${project.databaseName}, detected ${liveIdentity.databaseName}`,
                );
            }
            if (liveIdentity.port && Number(liveIdentity.port) !== project.backendPort) {
                warnings.push(`Health port ${liveIdentity.port} vs expected ${project.backendPort}`);
            }
        } else if (!opts.ci) {
            warnings.push(`Backend health not reachable for ${project.label} (live identity skipped)`);
        }
    } else if (opts.ci) {
        warnings.push('SKIPPED — live identity/health (CI mode; dedicated CI database not configured)');
    }

    if (git.dirty && !opts.ci) {
        warnings.push('Working tree is dirty — allowed for local development; blocks SAFE FOR DEPLOYMENT');
    }

    const decision = decide({
        ci: opts.ci,
        blockers,
        warnings,
        risk,
        git,
        identityMismatch,
        portMismatch,
    });

    const payload = {
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        ci: opts.ci,
        repositoryRoot: root,
        project: project
            ? {
                key: project.key,
                label: project.label,
                applicationKey: project.applicationKey,
                industryType: project.industryType,
                companyName: project.companyName,
                companyId: project.companyId,
                databaseName: project.databaseName,
                frontendPort: project.frontendPort,
                backendPort: project.backendPort,
            }
            : null,
        git: {
            branch: git.branch,
            commitShort: git.commitShort,
            commitFull: git.commitFull,
            statusShort: git.statusShort,
            dirty: git.dirty,
            modified: git.modified,
            staged: git.staged,
            untracked: git.untracked.slice(0, 200),
            deleted: git.deleted,
            hasMergeConflicts: git.hasMergeConflicts,
            mergeConflicts: git.mergeConflicts,
            changedFileCount: git.changedFiles.length,
        },
        ports,
        liveIdentity,
        risk: {
            overallRisk: risk.overallRisk,
            recommendedLevel: risk.recommendedLevel,
            categories: risk.categories,
            suites: risk.suites,
            fileCount: risk.fileCount,
        },
        selectedSuites,
        blockers,
        warnings,
        finalDecision: decision.finalDecision,
        exitCode: decision.exitCode,
    };

    const paths = writeGuardReport(payload);

    console.log('\nCRM SAFE CHANGE GUARD');
    console.log('='.repeat(64));
    console.log(`Repository:     ${root}`);
    console.log(`Project:        ${project?.label || '(unknown)'} (${project?.applicationKey || 'n/a'})`);
    console.log(`Branch:         ${git.branch} @ ${git.commitShort}`);
    console.log(`Dirty tree:     ${git.dirty}`);
    console.log(`Risk:           ${risk.overallRisk} → recommend ${risk.recommendedLevel}`);
    console.log(`Suites:         ${selectedSuites.join(', ')}`);
    console.log(`Blockers:       ${blockers.length ? blockers.join(' | ') : '(none)'}`);
    console.log(`Warnings:       ${warnings.length}`);
    console.log(`Decision:       ${decision.finalDecision}`);
    console.log(`Exit code:      ${decision.exitCode}`);
    console.log(`Report:         ${paths.latestMd}`);
    console.log('='.repeat(64));

    if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
    }

    if (blockers.length && portMismatch) {
        console.log('\nSAFE CHANGE BLOCKED');
        console.log(blockers.join('\n'));
    }

    process.exitCode = decision.exitCode;
}

main().catch((err) => {
    console.error('Safe Change Guard crashed:', err.message);
    process.exit(1);
});
