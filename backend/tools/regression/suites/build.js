import fs from 'fs';
import path from 'path';
import { RISK, SCRIPT_CHECKS } from '../config.js';
import { createHarness } from '../lib/harness.js';
import { repoRoot } from '../lib/env.js';
import { runCommand } from '../lib/process.js';
import { detectActiveProduct, isCheckApplicable, skipReasonForCheck } from '../lib/productContext.js';

/**
 * Build validation — optional. Does not deploy.
 */
export async function runBuildSuite({
    live,
    runBuild = false,
    runLint = false,
    releaseChecks = false,
    productContext,
} = {}) {
    const h = createHarness({ category: 'build', live });
    const root = repoRoot();
    const ctx = productContext || detectActiveProduct();

    for (const check of SCRIPT_CHECKS) {
        if (!isCheckApplicable(check.products, ctx.productKey)) {
            h.skip(`script present: ${check.path}`, skipReasonForCheck(check, ctx.productKey));
            continue;
        }
        const exists = fs.existsSync(path.join(root, check.path));
        if (!exists && check.required) {
            h.fail(`script present: ${check.path}`, `missing ${check.path}`, {
                risk: check.risk || RISK.HIGH,
                detail: `required for product ${ctx.productKey}`,
            });
        } else if (!exists) {
            h.skip(`script present: ${check.path}`, `optional missing on ${ctx.productKey}`);
        } else {
            h.pass(`script present: ${check.path}`, check.path);
        }
    }

    if (releaseChecks) {
        if (!isCheckApplicable(['handloom'], ctx.productKey)) {
            h.skip('release:check', skipReasonForCheck({ id: 'release:check', products: ['handloom'] }, ctx.productKey));
            h.skip('check:golden-regression', skipReasonForCheck({ id: 'golden-regression', products: ['handloom'] }, ctx.productKey));
        } else {
            const release = runCommand(process.execPath, ['scripts/release-check.cjs'], {
                cwd: root,
                timeout: 300000,
            });
            if (release.ok) {
                h.pass('release:check', 'pass');
            } else if (/ENOBUFS|validate:master/i.test(release.output)) {
                h.fail('release:check', release.output.slice(-400), {
                    risk: RISK.MEDIUM,
                    detail: 'Pre-existing repo/tooling failure — not treated as print/sales regression',
                });
            } else {
                h.fail('release:check', release.output.slice(-400), { risk: RISK.HIGH });
            }

            const golden = runCommand(process.execPath, ['scripts/check-golden-reference-regression.cjs'], {
                cwd: root,
                timeout: 300000,
            });
            if (golden.ok) {
                h.pass('check:golden-regression', 'pass');
            } else if (/ENOBUFS/i.test(golden.output)) {
                h.fail('check:golden-regression', 'git ENOBUFS (dirty worktree too large) — rerun on clean tree', {
                    risk: RISK.MEDIUM,
                });
            } else {
                h.fail('check:golden-regression', golden.output.slice(-400), {
                    risk: RISK.BLOCK_DEPLOYMENT,
                    code: 'WRONG_PRINT',
                });
            }
        }
    } else {
        h.skip('release:check', 'pass --release-checks to enable');
        h.skip('check:golden-regression', 'pass --release-checks to enable');
    }

    if (runLint) {
        const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        const lint = runCommand(npmCmd, ['run', 'lint'], { cwd: root, timeout: 180000 });
        h.expect(lint.ok, 'frontend lint', lint.ok ? 'pass' : 'fail', {
            detail: lint.output.slice(-400),
            risk: RISK.MEDIUM,
        });
    } else {
        h.skip('frontend lint', 'pass --lint to enable');
    }

    if (runBuild) {
        const viteJs = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
        const build = fs.existsSync(viteJs)
            ? runCommand(process.execPath, [viteJs, 'build'], { cwd: root, timeout: 300000 })
            : runCommand(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
                cwd: root,
                timeout: 300000,
            });
        h.expect(build.ok, 'frontend build', build.ok ? 'pass' : 'fail', {
            detail: build.output.slice(-800) || `exit=${build.code}`,
            risk: RISK.HIGH,
        });
    } else {
        h.skip('frontend build', 'pass --build to enable');
    }

    h.pass('build suite policy', 'no deployment performed by regression framework');
    return h.results;
}
