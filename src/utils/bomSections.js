export const DEFAULT_SECTION_COUNT = 1;
export const DEFAULT_SECTION_NAME = 'Main BOM';

export function resolveSectionCount(bom) {
    const n = parseInt(bom?.sectionCount, 10);
    return Number.isFinite(n) && n >= 1 ? n : DEFAULT_SECTION_COUNT;
}

export function buildDefaultSections(sectionCount = DEFAULT_SECTION_COUNT) {
    const count = Math.max(1, parseInt(sectionCount, 10) || DEFAULT_SECTION_COUNT);
    return Array.from({ length: count }, (_, i) => ({
        sectionNo: i + 1,
        sectionName: i === 0 ? DEFAULT_SECTION_NAME : '',
    }));
}

export function normalizeBomFormFromApi(data) {
    const sectionCount = resolveSectionCount(data);
    let sections = Array.isArray(data?.sections) && data.sections.length
        ? data.sections.map((s, i) => ({
            sectionNo: Number(s.sectionNo) || i + 1,
            sectionName: String(s.sectionName || '').trim() || (Number(s.sectionNo) === 1 ? DEFAULT_SECTION_NAME : ''),
        }))
        : buildDefaultSections(sectionCount);

    if (sections.length < sectionCount) {
        const defaults = buildDefaultSections(sectionCount);
        sections = defaults.map((def, i) => sections[i] || def);
    } else if (sections.length > sectionCount) {
        sections = sections.slice(0, sectionCount);
    }

    const nameByNo = Object.fromEntries(sections.map((s) => [s.sectionNo, s.sectionName]));

    return {
        sectionCount,
        sections,
        components: (data?.components || []).map((c) => {
            const sectionNo = Number(c.sectionNo) >= 1 ? Number(c.sectionNo) : DEFAULT_SECTION_COUNT;
            return {
                ...c,
                sectionNo,
                sectionName: String(c.sectionName || '').trim() || nameByNo[sectionNo] || DEFAULT_SECTION_NAME,
            };
        }),
    };
}

export function groupComponentsBySection(components = [], sections = []) {
    const count = sections.length || DEFAULT_SECTION_COUNT;
    const groups = sections.length
        ? sections.map((s) => ({ ...s, items: [] }))
        : buildDefaultSections(count).map((s) => ({ ...s, items: [] }));

    for (const comp of components) {
        const no = Number(comp.sectionNo) || DEFAULT_SECTION_COUNT;
        let group = groups.find((g) => g.sectionNo === no);
        if (!group) {
            group = { sectionNo: no, sectionName: comp.sectionName || `Section ${no}`, items: [] };
            groups.push(group);
        }
        group.items.push(comp);
    }

    return groups.sort((a, b) => a.sectionNo - b.sectionNo);
}

export function calcSectionSubtotals(components = []) {
    const map = new Map();
    for (const c of components) {
        const no = Number(c.sectionNo) || DEFAULT_SECTION_COUNT;
        const prev = map.get(no) || {
            sectionNo: no,
            sectionName: c.sectionName || DEFAULT_SECTION_NAME,
            rawMaterialCost: 0,
            pointsLabourCost: 0,
        };
        prev.rawMaterialCost += parseFloat(c.totalCost) || 0;
        prev.pointsLabourCost += parseFloat(c.pointsLabourCost) || 0;
        prev.sectionName = c.sectionName || prev.sectionName;
        map.set(no, prev);
    }
    return [...map.values()].sort((a, b) => a.sectionNo - b.sectionNo);
}

export function sectionLabel(section) {
    return `${section.sectionNo} — ${section.sectionName || DEFAULT_SECTION_NAME}`;
}
