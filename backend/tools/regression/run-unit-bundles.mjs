#!/usr/bin/env node
/**
 * Product-aware unit-bundle CLI for CI.
 * Delegates to runApplicableUnitBundle — no duplicate classification logic.
 *
 * Usage:
 *   REGRESSION_PRODUCT=handloom|jsk node backend/tools/regression/run-unit-bundles.mjs
 *   node backend/tools/regression/run-unit-bundles.mjs --json
 */
import { UNIT_TEST_CHECKS } from './config.js';
import { runApplicableUnitBundle } from './lib/process.js';
import { detectActiveProduct } from './lib/productContext.js';

const wantJson = process.argv.includes('--json');

function uniqueBundles() {
    return [...new Set(UNIT_TEST_CHECKS.map((c) => c.bundle))];
}

function main() {
    const product = detectActiveProduct();
    if (product.productKey === 'unknown') {
        const msg = 'UNKNOWN_PRODUCT — cannot run product-aware unit bundles in CI';
        if (wantJson) {
            console.log(JSON.stringify({ ok: false, product, error: msg }, null, 2));
        } else {
            console.error(msg);
            if (product.warning) console.error(product.warning);
        }
        process.exit(2);
    }

    const bundles = uniqueBundles();
    const results = [];
    let ok = true;
    const allSkips = [];
    const allMissing = [];
    const allRan = [];

    console.log(`Product: ${product.productKey} (${product.productName}) via ${product.detectionSource}`);
    console.log(`Expected DB: ${product.expectedDatabase}`);
    console.log(`Bundles: ${bundles.join(', ')}`);
    console.log('');

    for (const bundle of bundles) {
        const r = runApplicableUnitBundle(bundle, product.productKey);
        results.push({ bundle, ...r });
        for (const s of r.skipReasons || []) {
            allSkips.push(s);
            console.log(`SKIP — [${bundle}] ${s}`);
        }
        if (r.missingRequired?.length) {
            ok = false;
            for (const m of r.missingRequired) {
                allMissing.push(m);
                console.error(
                    `FAIL — [${bundle}] missing required ${m.id} (${m.file}) for product ${product.productKey}`,
                );
            }
            continue;
        }
        if (r.skippedAll) {
            console.log(`SKIP — [${bundle}] no applicable unit tests for ${product.productKey}`);
            continue;
        }
        if (!r.ok) {
            ok = false;
            console.error(`FAIL — [${bundle}] unit tests failed`);
            if (r.output) console.error(r.output.slice(-1500));
        } else {
            allRan.push(...r.ranFiles);
            console.log(`PASS — [${bundle}] ran ${r.ranFiles.join(', ')}`);
        }
    }

    const summary = {
        ok,
        productKey: product.productKey,
        productName: product.productName,
        expectedDatabase: product.expectedDatabase,
        ranFiles: allRan,
        skipReasons: allSkips,
        missingRequired: allMissing.map((m) => ({ id: m.id, file: m.file, products: m.products })),
        bundles: results.map((r) => ({
            bundle: r.bundle,
            ok: r.ok,
            skippedAll: r.skippedAll,
            ranFiles: r.ranFiles,
            missingRequired: (r.missingRequired || []).map((m) => m.file),
            skipCount: (r.skipReasons || []).length,
        })),
    };

    console.log('');
    console.log(
        `SUMMARY: product=${product.productKey} ran=${allRan.length} skipped=${allSkips.length} missingRequired=${allMissing.length} ok=${ok}`,
    );
    if (wantJson) console.log(JSON.stringify(summary, null, 2));

    process.exit(ok ? 0 : 1);
}

main();
