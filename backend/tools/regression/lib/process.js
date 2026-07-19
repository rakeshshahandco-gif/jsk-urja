import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { backendRoot } from '../lib/env.js';
import { UNIT_TEST_CHECKS } from '../config.js';
import { isCheckApplicable, skipReasonForCheck } from './productContext.js';

/**
 * Run selected backend unit tests (read-only). Returns { ok, output, code }.
 */
export function runUnitTests(relativeFiles = []) {
    if (!relativeFiles.length) return { ok: true, output: '', code: 0, skipped: true };
    const cwd = backendRoot();
    const args = ['--test', ...relativeFiles.map((f) => path.normalize(f))];
    const res = spawnSync(process.execPath, args, {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, NODE_ENV: 'test' },
        timeout: 180000,
        windowsHide: true,
    });
    const output = `${res.stdout || ''}\n${res.stderr || ''}`.trim();
    const missing = /Could not find/i.test(output);
    return {
        ok: res.status === 0 && !missing,
        code: res.status,
        output: output.slice(-4000),
        skipped: false,
    };
}

/**
 * Product-aware unit bundle runner.
 * @returns {{
 *   ok: boolean,
 *   skippedAll: boolean,
 *   skipReasons: string[],
 *   missingRequired: object[],
 *   ranFiles: string[],
 *   output: string,
 *   blockCode: string|null,
 * }}
 */
export function runApplicableUnitBundle(bundleName, productKey) {
    const checks = UNIT_TEST_CHECKS.filter((c) => c.bundle === bundleName);
    const skipReasons = [];
    const toRun = [];
    const missingRequired = [];
    let blockCode = null;

    for (const check of checks) {
        if (!isCheckApplicable(check.products, productKey)) {
            skipReasons.push(skipReasonForCheck(check, productKey));
            continue;
        }
        const abs = path.join(backendRoot(), check.file);
        if (!fs.existsSync(abs)) {
            if (check.required) {
                missingRequired.push(check);
                blockCode = check.blockCode || blockCode;
            } else {
                skipReasons.push(
                    `SKIPPED — ${check.id} optional on ${productKey}; file missing (${check.file})`,
                );
            }
            continue;
        }
        toRun.push(check.file);
    }

    if (missingRequired.length) {
        return {
            ok: false,
            skippedAll: false,
            skipReasons,
            missingRequired,
            ranFiles: [],
            output: `Missing required tests for ${productKey}: ${missingRequired.map((c) => c.file).join(', ')}`,
            blockCode,
        };
    }

    if (!toRun.length) {
        return {
            ok: true,
            skippedAll: true,
            skipReasons,
            missingRequired: [],
            ranFiles: [],
            output: '',
            blockCode: null,
        };
    }

    const result = runUnitTests(toRun);
    return {
        ok: result.ok,
        skippedAll: false,
        skipReasons,
        missingRequired: [],
        ranFiles: toRun,
        output: result.output,
        blockCode: result.ok ? null : (checks.find((c) => c.bundle === bundleName)?.blockCode || null),
    };
}

/**
 * Soft build probes — do not deploy. Lint/build are optional and non-mutating.
 */
export function runCommand(cmd, args, { cwd, timeout = 180000 } = {}) {
    const useShell = process.platform === 'win32' && /\.cmd$/i.test(String(cmd));
    const res = spawnSync(cmd, args, {
        cwd,
        encoding: 'utf8',
        shell: useShell,
        timeout,
        env: process.env,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
    });
    return {
        ok: res.status === 0,
        code: res.status,
        output: `${res.stdout || ''}\n${res.stderr || ''}${res.error ? String(res.error) : ''}`.trim().slice(-4000),
    };
}
