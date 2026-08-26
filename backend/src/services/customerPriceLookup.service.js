/**
 * Isolated customer price lookup — does not change Sales GST/stock/accounting.
 * Suggested rate only; caller decides whether to default a form field.
 */

export function startOfDay(value) {
    const d = value instanceof Date ? new Date(value) : new Date(value || Date.now());
    if (Number.isNaN(d.getTime())) return new Date(0);
    d.setHours(0, 0, 0, 0);
    return d;
}

export function isUsableStatus(status) {
    return status === 'Approved' || status === 'Sent';
}

export function isDateInValidity(effectiveFrom, validUpto, docDate) {
    const d = startOfDay(docDate);
    if (effectiveFrom && startOfDay(effectiveFrom) > d) return false;
    if (validUpto && startOfDay(validUpto) < d) return false;
    return true;
}

export function isSlabLine(line) {
    const hasMin = line.minQty != null && line.minQty !== '' && Number(line.minQty) > 0;
    const hasMax = line.maxQty != null && line.maxQty !== '' && Number(line.maxQty) > 0;
    return hasMin || hasMax;
}

export function qtyMatchesSlab(qty, minQty, maxQty) {
    const q = Number(qty) || 0;
    const lo = Number(minQty) || 0;
    const hi = maxQty == null || maxQty === '' || Number(maxQty) === 0 ? Infinity : Number(maxQty);
    return q >= lo && q <= hi;
}

export function rangesOverlap(aMin, aMax, bMin, bMax) {
    const aLo = Number(aMin) || 0;
    const aHi = aMax == null || aMax === '' || Number(aMax) === 0 ? Infinity : Number(aMax);
    const bLo = Number(bMin) || 0;
    const bHi = bMax == null || bMax === '' || Number(bMax) === 0 ? Infinity : Number(bMax);
    return aLo <= bHi && bLo <= aHi;
}

export function formatSlabLabel(line) {
    if (!isSlabLine(line)) return 'Any qty';
    const lo = Number(line.minQty) || 1;
    const hi = line.maxQty == null || line.maxQty === '' || Number(line.maxQty) === 0
        ? null
        : Number(line.maxQty);
    if (hi == null) return `${lo}+`;
    return `${lo}–${hi}`;
}

export function isFilledRate(line) {
    const v = line?.finalRate;
    if (v === undefined || v === null || String(v).trim() === '') return false;
    return Number.isFinite(Number(v));
}

export function formatQtyBreakLabel(line) {
    const rawUom = String(line?.uom || 'pcs').trim();
    const unit = !rawUom || rawUom.toUpperCase() === 'NOS' ? 'pcs' : rawUom.toLowerCase();
    const min = Number(line?.minQty) || 0;
    if (!min) return 'Any qty';
    if (min === 1) return unit === 'pcs' ? 'Sample / 1 pc' : `Sample / 1 ${unit}`;
    return `${min}+ ${unit}`;
}

/** Fill To Qty from the next From Qty of the same item so the user does not type it. */
export function deriveAdjacentMaxQty(lines) {
    const list = (lines || []).map((l) => ({ ...l }));
    const byItem = new Map();
    list.forEach((l, idx) => {
        const key = String(l.itemId || '');
        if (!key) return;
        if (!byItem.has(key)) byItem.set(key, []);
        byItem.get(key).push(idx);
    });
    for (const idxs of byItem.values()) {
        const withQty = idxs.filter((i) => Number(list[i].minQty) > 0);
        if (withQty.length < 2 && withQty.length === 1) {
            list[withQty[0]].maxQty = null;
            continue;
        }
        if (!withQty.length) continue;
        withQty.sort((a, b) => (Number(list[a].minQty) || 0) - (Number(list[b].minQty) || 0));
        withQty.forEach((i, n) => {
            const next = withQty[n + 1];
            if (next == null) {
                list[i].maxQty = null;
                return;
            }
            const nextMin = Number(list[next].minQty) || 0;
            list[i].maxQty = nextMin > 1 ? nextMin - 1 : null;
        });
    }
    return list;
}

export function validateQtyBreaks(lines) {
    const byItem = new Map();
    for (const line of lines || []) {
        const qty = Number(line.minQty);
        if (!(qty > 0)) return 'Qty must be greater than 0 for a filled rate';
        const rate = Number(line.finalRate);
        if (!Number.isFinite(rate) || rate < 0) return 'Rate must be 0 or more for a filled quantity break';
        const key = String(line.itemId || '');
        if (!byItem.has(key)) byItem.set(key, new Set());
        const seen = byItem.get(key);
        if (seen.has(qty)) {
            const name = line.productName || line.itemCode || key;
            return `Duplicate Qty ${qty} for ${name}`;
        }
        seen.add(qty);
    }
    return null;
}

export function validateLineSlabs(lines) {
    const byItem = new Map();
    for (const line of lines || []) {
        const key = String(line.itemId || '');
        if (!key) continue;
        if (!byItem.has(key)) byItem.set(key, []);
        byItem.get(key).push(line);
    }
    for (const [itemKey, itemLines] of byItem) {
        const slabs = itemLines.filter(isSlabLine);
        for (let i = 0; i < slabs.length; i += 1) {
            for (let j = i + 1; j < slabs.length; j += 1) {
                if (rangesOverlap(slabs[i].minQty, slabs[i].maxQty, slabs[j].minQty, slabs[j].maxQty)) {
                    const name = slabs[i].productName || slabs[i].itemCode || itemKey;
                    return `Overlapping quantity slabs for ${name}`;
                }
            }
        }
    }
    return null;
}

export function pickLineForQty(lines, itemId, qty) {
    const itemLines = (lines || []).filter((l) => String(l.itemId) === String(itemId) && isFilledRate(l));
    if (!itemLines.length) return { line: null, priority: null };

    const q = Number(qty) || 0;
    const thresholds = itemLines.filter((l) => Number(l.minQty) > 0);
    if (thresholds.length) {
        const eligible = thresholds.filter((l) => Number(l.minQty) <= q);
        if (eligible.length) {
            eligible.sort((a, b) => (Number(b.minQty) || 0) - (Number(a.minQty) || 0));
            return { line: eligible[0], priority: 1, candidates: eligible };
        }
    }

    const open = itemLines.filter((l) => !(Number(l.minQty) > 0) && !isSlabLine(l));
    if (open.length === 1) return { line: open[0], priority: 2, candidates: open };
    if (open.length > 1) {
        return { line: open[0], priority: 2, ambiguousLines: true, candidates: open };
    }
    return { line: null, priority: null };
}

export function rankPriceLists(docs) {
    return [...(docs || [])].sort((a, b) => {
        const eb = startOfDay(b.effectiveFrom).getTime();
        const ea = startOfDay(a.effectiveFrom).getTime();
        if (eb !== ea) return eb - ea;
        const vb = Number(b.versionNo) || 0;
        const va = Number(a.versionNo) || 0;
        if (vb !== va) return vb - va;
        const ab = new Date(b.approvedAt || b.updatedAt || 0).getTime();
        const aa = new Date(a.approvedAt || a.updatedAt || 0).getTime();
        return ab - aa;
    });
}

export function selectRankedDocument(ranked) {
    if (!ranked.length) return { doc: null, needsSelection: false, alternatives: [] };
    const top = ranked[0];
    const sameEffective = ranked.filter((d) => (
        startOfDay(d.effectiveFrom).getTime() === startOfDay(top.effectiveFrom).getTime()
        && String(d._id) !== String(top._id)
        && Number(d.versionNo) === Number(top.versionNo)
    ));
    if (sameEffective.length) {
        return {
            doc: top,
            needsSelection: true,
            alternatives: [top, ...sameEffective],
        };
    }
    return { doc: top, needsSelection: false, alternatives: [] };
}

export function computeFinalRate(offeredRate, discountPercent) {
    const offered = Number(offeredRate) || 0;
    const disc = Number(discountPercent) || 0;
    const finalRate = Math.round(offered * (1 - disc / 100) * 100) / 100;
    return finalRate;
}

/**
 * Pure suggestion from already-loaded price lists + item master rate.
 * Priority 3 (category list) is not implemented — skipped.
 */
export function suggestFromLoadedLists({
    lists,
    itemId,
    qty,
    docDate,
    currency = 'INR',
    standardPrice = 0,
}) {
    const usable = (lists || []).filter((doc) => (
        isUsableStatus(doc.status)
        && isDateInValidity(doc.effectiveFrom, doc.validUpto, docDate)
        && (!doc.currency || doc.currency === currency)
        && (doc.priceType === 'Customer Specific' || !doc.priceType)
    ));

    const matching = usable.filter((doc) => {
        const picked = pickLineForQty(doc.lines, itemId, qty);
        return !!picked.line;
    });

    const ranked = rankPriceLists(matching);
    const selected = selectRankedDocument(ranked);
    if (!selected.doc) {
        const std = Number(standardPrice) || 0;
        return {
            suggestedRate: std || null,
            priority: std ? 4 : null,
            source: std ? { label: 'Item selling price', kind: 'standard' } : null,
            standardPrice: std || 0,
            needsSelection: false,
            alternatives: [],
        };
    }

    const picked = pickLineForQty(selected.doc.lines, itemId, qty);
    const rate = Number(picked.line?.finalRate);
    return {
        suggestedRate: Number.isFinite(rate) ? rate : null,
        priority: picked.priority,
        source: {
            kind: 'customerPriceList',
            priceListId: selected.doc._id,
            priceListNo: selected.doc.priceListNo,
            version: selected.doc.version,
            validUpto: selected.doc.validUpto || null,
            effectiveFrom: selected.doc.effectiveFrom || null,
            slab: formatSlabLabel(picked.line),
            label: `${selected.doc.priceListNo} ${selected.doc.version}`,
        },
        standardPrice: Number(picked.line?.standardPrice) || Number(standardPrice) || 0,
        needsSelection: selected.needsSelection || !!picked.ambiguousLines,
        alternatives: selected.needsSelection
            ? selected.alternatives.map((d) => ({
                priceListId: d._id,
                priceListNo: d.priceListNo,
                version: d.version,
                finalRate: pickLineForQty(d.lines, itemId, qty).line?.finalRate,
            }))
            : [],
        taxTreatment: picked.line?.taxTreatment || selected.doc.gstTreatment || 'Extra',
    };
}
