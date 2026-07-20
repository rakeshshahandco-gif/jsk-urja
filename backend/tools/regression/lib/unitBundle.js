/**
 * Helper: record applicable unit-bundle result on a harness.
 */
export function recordUnitBundle(h, {
    label,
    bundleResult,
    failCode,
    failRisk,
}) {
    for (const reason of bundleResult.skipReasons || []) {
        h.skip(label, reason);
    }
    if (bundleResult.skippedAll) {
        if (!(bundleResult.skipReasons || []).length) {
            h.skip(label, 'no applicable unit tests for active product');
        }
        return;
    }
    if (bundleResult.missingRequired?.length) {
        h.fail(label, bundleResult.output, {
            risk: failRisk,
            code: bundleResult.blockCode || failCode,
            detail: bundleResult.output,
        });
        return;
    }
    h.expect(bundleResult.ok, label, bundleResult.ok ? `ran ${bundleResult.ranFiles.join(', ')}` : 'fail', {
        detail: bundleResult.output.slice(-500),
        risk: failRisk,
        code: bundleResult.ok ? null : (bundleResult.blockCode || failCode),
    });
}
