/** Textile Work Order / Production Order labels and stage helpers (Handloom / TEXTILE template). */

export const TEXTILE_WO_DEFAULT_STAGES = [
    { seq: 1, name: 'Grey Fabric Inward', icon: '붿뿯붿' },
    { seq: 2, name: 'Dyeing', icon: '�붿' },
    { seq: 3, name: 'Printing', icon: '�붿붿' },
    { seq: 4, name: 'Embroidery', icon: '�붿' },
    { seq: 5, name: 'Stitching', icon: '✂붿' },
    { seq: 6, name: 'Washing', icon: '�붿' },
    { seq: 7, name: 'Pressing', icon: '붿붿' },
    { seq: 8, name: 'Finishing', icon: '✨' },
    { seq: 9, name: 'Packing', icon: '붿뿯붿' },
    { seq: 10, name: 'Finished Stock', icon: '✅' },
];

export const JSK_WO_DEFAULT_STAGES = [
    { seq: 1, name: 'PCB', icon: '붿붿' },
    { seq: 2, name: 'SMD Pick & Place', icon: '붿붿' },
    { seq: 3, name: 'TH Mounting', icon: '붿붿' },
    { seq: 4, name: 'Wave Soldering', icon: '붿붿' },
    { seq: 5, name: 'Touch Up', icon: '✏붿' },
    { seq: 6, name: 'Wire Insert', icon: '붿붿' },
    { seq: 7, name: '1st QC', icon: '붿붿', isGate: true },
    { seq: 8, name: 'Dummy Load Testing', icon: '뿯⚽', isGate: true },
    { seq: 9, name: 'Final QC', icon: '✅', isGate: true },
];

const STAGE_ICONS = {
    dyeing: '�붿',
    printing: '�붿붿',
    finishing: '✨',
    packing: '붿뿯붿',
    inspection: '붿붿',
    quality_control: '붿붿',
    testing: '뿯⚽',
    raw_material: '붿뿯붿',
    finished_goods: '✅',
    assembly: '붿붿',
};

export function getWorkOrderLabels(isTextile) {
    if (isTextile) {
        return {
            module: 'textile',
            title: 'Textile Production Orders',
            titleShort: 'Textile Job Orders',
            newButton: '+ New Textile Job Order',
            newTitle: 'New Textile Production Order',
            newSubtitle: 'Create a textile job order with fabric and process route',
            listEmpty: 'No Textile Production Orders',
            listEmptyHint: 'Create your first textile job order to start production',
            dashboardTitle: '붿뿯붿 Textile Production Dashboard',
            dashboardSubtitle: 'Overview of textile production orders and process stages',
            flowTitle: 'Textile Production Flow',
            flowLegend: '붿뿯붿 Fabric & process stages | 붿붿 QC / inspection gates',
            backLink: '뿯↽ Textile Production Orders',
            detailSupervisor: 'Assigned Vendor / Worker',
            qtyLabel: 'Order Qty (PCS)',
            printSheet: 'Print Job Sheet',
        };
    }
    return {
        module: 'electronics',
        title: 'Work Orders',
        titleShort: 'Work Orders',
        newButton: '+ New Work Order',
        newTitle: 'New Work Order',
        newSubtitle: 'Select BOM and define production targets',
        listEmpty: 'No Work Orders',
        listEmptyHint: 'Create your first WO to start production',
        dashboardTitle: '붿뿯붿 Production Dashboard',
        dashboardSubtitle: 'Real-time overview of all Work Orders',
        flowTitle: 'Production Flow',
        flowLegend: '붿붿 Assembly stages | 붿뿯붿 QC / Testing gates (mandatory pass to proceed)',
        backLink: '뿯↽ Work Orders',
        detailSupervisor: 'Supervisor',
        qtyLabel: 'Target Quantity',
        printSheet: 'Print Production Sheet',
    };
}

export function mapWorkflowPreviewToDisplayStages(previewStages = []) {
    if (!previewStages.length) return TEXTILE_WO_DEFAULT_STAGES;
    return previewStages.map((s, i) => {
        const stageType = s.stageType || 'general';
        return {
            seq: s.sequenceNo || i + 1,
            name: s.stageName,
            icon: STAGE_ICONS[stageType] || '붿뿯붿',
            isGate: ['quality_control', 'inspection', 'testing'].includes(stageType),
        };
    });
}

export function isTextileWorkOrder(wo) {
    return wo?.productionModule === 'textile';
}
