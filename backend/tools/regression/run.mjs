#!/usr/bin/env node
/**
 * Phase 2.5/2.6 — CRM Regression Protection Framework
 *
 * Usage:
 *   node backend/tools/regression/run.mjs --level fast
 *   node backend/tools/regression/run.mjs --level full
 *   node backend/tools/regression/run.mjs --level release --ci
 *   node backend/tools/regression/run.mjs --offline --category environment,cache
 *
 * Env:
 *   REGRESSION_HANDLOOM_PASS / REGRESSION_JSK_PASS  (local live only; never commit)
 *   CI / GITHUB_ACTIONS → force offline, no live DB
 *
 * Does NOT commit, push, or deploy.
 * Does NOT mutate Sales/GST/Print business logic.
 */

import { CATEGORIES, PRODUCTS } from './config.js';
import { summarize } from './lib/harness.js';
import { buildSafeChangeReport, writeReport } from './lib/report.js';
import { health } from './lib/http.js';

import { runEnvironmentSuite } from './suites/environment.js';
import { runAuthenticationSuite } from './suites/authentication.js';
import { runCompanyIsolationSuite } from './suites/company-isolation.js';
import { runModuleStateSuite } from './suites/module-state.js';
import { runSalesSuite } from './suites/sales-regression.js';
import { runPrintSuite } from './suites/print.js';
import { runCompanyConfigSuite } from './suites/company-config.js';
import { runCacheSuite } from './suites/cache.js';
import { runSecuritySuite } from './suites/security.js';
import { runDatabaseSafetySuite } from './suites/database-safety.js';
import { runBuildSuite } from './suites/build.js';

const LEVEL_PRESETS = {
    fast: {
        categories: [
            'environment',
            'authentication',
            'company-isolation',
            'module-state',
            'cache',
            'security',
            'database-safety',
        ],
        offline: true,
        runBuild: false,
        runLint: false,
        releaseChecks: false,
        mutateModules: false,
    },
    full: {
        categories: [...CATEGORIES],
        offline: false, // auto-detect live; CI forces offline
        runBuild: true,
        runLint: false,
        releaseChecks: false,
        mutateModules: false,
    },
    release: {
        categories: [...CATEGORIES],
        offline: false,
        runBuild: true,
        runLint: false, // opt-in via --lint (avoids unrelated lint debt blocking guard)
        releaseChecks: false,
        mutateModules: false,
    },
};

function parseArgs(argv) {
    const flags = new Set(argv);
    const get = (name) => {
        const i = argv.indexOf(name);
        return i >= 0 ? argv[i + 1] : null;
    };
    const levelRaw = get('--level') || (flags.has('--fast') ? 'fast' : null);
    const level = levelRaw && LEVEL_PRESETS[levelRaw] ? levelRaw : null;
    const preset = level ? LEVEL_PRESETS[level] : null;

    const ci = flags.has('--ci')
        || process.env.CI === 'true'
        || process.env.GITHUB_ACTIONS === 'true';

    const categoryArg = get('--category');
    let categories = categoryArg
        ? categoryArg.split(',').map((s) => s.trim()).filter(Boolean)
        : (preset ? [...preset.categories] : [...CATEGORIES]);

    const offline = ci || flags.has('--offline') || Boolean(preset?.offline);
    let live = flags.has('--live');
    if (offline || ci) live = false;

    return {
        level: level || 'custom',
        ci,
        live,
        offline,
        mutateModules: flags.has('--mutate-modules') || Boolean(preset?.mutateModules),
        runBuild: flags.has('--build') || Boolean(preset?.runBuild),
        runLint: flags.has('--lint') || Boolean(preset?.runLint),
        releaseChecks: flags.has('--release-checks') || Boolean(preset?.releaseChecks),
        noReport: flags.has('--no-report'),
        json: flags.has('--json'),
        categories,
    };
}

async function detectLive(preferredLive) {
    if (preferredLive === false) return false;
    if (preferredLive === true) return true;
    try {
        const h = await health(PRODUCTS.handloom.backendBase);
        const j = await health(PRODUCTS.jsk.backendBase);
        return Boolean(
            h.ok
            && j.ok
            && h.data?.databaseName === PRODUCTS.handloom.databaseName
            && j.data?.databaseName === PRODUCTS.jsk.databaseName,
        );
    } catch {
        return false;
    }
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    let live = false;
    if (!opts.ci && !opts.offline) {
        live = await detectLive(opts.live ? true : null);
    }
    if (opts.live && !opts.ci && !opts.offline) live = true;
    if (opts.ci) {
        live = false;
        console.log('CI mode: live API/DB tests SKIPPED — dedicated CI database not configured');
    }

    console.log('\nCRM REGRESSION PROTECTION FRAMEWORK');
    console.log(`Level: ${opts.level} | Mode: ${live ? 'LIVE' : 'OFFLINE'} | categories: ${opts.categories.join(', ')}`);
    if (live) console.log('Backends: Handloom :5000 / JSK :5100');
    console.log('');

    const sessions = {};
    const context = {
        live,
        ci: opts.ci,
        environment: process.env.NODE_ENV || 'development',
        companies: 'Handloom Group, JSK URJA',
        databases: 'handloom_crm, jsk-esarthi-ui-dev',
        dbSnapshots: {},
    };

    const runners = {
        environment: () => runEnvironmentSuite({ live }),
        authentication: () => runAuthenticationSuite({ live, sessions }),
        'company-isolation': () => runCompanyIsolationSuite({ live, sessions }),
        'module-state': () => runModuleStateSuite({
            live,
            sessions,
            mutate: opts.mutateModules && !opts.ci,
        }),
        sales: () => runSalesSuite({ live, sessions }),
        print: () => runPrintSuite({ live, sessions }),
        'company-config': () => runCompanyConfigSuite({ live, sessions }),
        cache: () => runCacheSuite({ live }),
        security: () => runSecuritySuite({ live, sessions }),
        'database-safety': () => runDatabaseSafetySuite({ live, context }),
        build: () => runBuildSuite({
            live,
            runBuild: opts.runBuild,
            runLint: opts.runLint,
            releaseChecks: opts.releaseChecks,
        }),
    };

    const ordered = CATEGORIES.filter((c) => opts.categories.includes(c));
    let results = [];

    if (ordered.includes('database-safety')) {
        results = results.concat(await runners['database-safety']());
    }

    for (const cat of ordered) {
        if (cat === 'database-safety') continue;
        if (!runners[cat]) continue;
        results = results.concat(await runners[cat]());
    }

    if (ordered.includes('database-safety')) {
        results = results.concat(await runners['database-safety']());
    }

    const summary = summarize(results);
    const reportText = buildSafeChangeReport({
        summary,
        results,
        context: {
            ...context,
            level: opts.level,
            note: opts.ci
                ? 'CI offline validation only — not SAFE FOR DEPLOYMENT by itself'
                : undefined,
        },
        categoriesRun: ordered,
    });

    console.log(`\n${reportText}\n`);

    let reportPaths = null;
    if (!opts.noReport) {
        reportPaths = writeReport(reportText);
        console.log(`Report written: ${reportPaths.file}`);
        console.log(`Latest:         ${reportPaths.latest}`);
    }

    if (opts.json) {
        console.log(JSON.stringify({ summary, results, reportPaths, level: opts.level, ci: opts.ci }, null, 2));
    }

    if (summary.blockDeployment) {
        console.log('\nRECOMMENDATION: BLOCK DEPLOYMENT');
        process.exitCode = 2;
    } else if (summary.failed > 0) {
        console.log('\nRECOMMENDATION: FIX FAILURES BEFORE COMMIT/DEPLOY');
        process.exitCode = 1;
    } else if (opts.ci) {
        console.log('\nRECOMMENDATION: SAFE FOR REVIEW (CI offline — not SAFE FOR DEPLOYMENT)');
        process.exitCode = 0;
    } else {
        console.log('\nRECOMMENDATION: SAFE FOR REVIEW (no automated blocker)');
        process.exitCode = 0;
    }
}

main().catch((err) => {
    console.error('Regression framework crashed:', err);
    process.exit(1);
});
