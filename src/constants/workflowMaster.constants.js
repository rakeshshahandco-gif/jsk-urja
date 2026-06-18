export const WORKFLOW_STAGE_TYPES = [
    'general', 'raw_material', 'assembly', 'processing', 'testing', 'quality_control',
    'inspection', 'packing', 'finished_goods', 'purchase', 'shipping',
    'export_documentation', 'payment_collection', 'dyeing', 'printing', 'finishing',
];

export const WORKFLOW_STAGE_TYPE_LABELS = {
    general: 'General',
    raw_material: 'Raw Material',
    assembly: 'Assembly',
    processing: 'Processing',
    testing: 'Testing',
    quality_control: 'Quality Control',
    inspection: 'Inspection',
    packing: 'Packing',
    finished_goods: 'Finished Goods',
    purchase: 'Purchase',
    shipping: 'Shipping',
    export_documentation: 'Export Documentation',
    payment_collection: 'Payment Collection',
    dyeing: 'Dyeing',
    printing: 'Printing',
    finishing: 'Finishing',
};

export const WORKFLOW_STAGE_PRESETS = {
    ELECTRONICS: [
        { stageName: 'Raw Material', stageType: 'raw_material' },
        { stageName: 'PCB Assembly', stageType: 'assembly' },
        { stageName: 'SMD', stageType: 'assembly' },
        { stageName: 'Testing', stageType: 'testing' },
        { stageName: 'QC', stageType: 'quality_control' },
        { stageName: 'Packing', stageType: 'packing' },
        { stageName: 'Finished Goods', stageType: 'finished_goods' },
    ],
    TEXTILE: [
        { stageName: 'Grey Fabric', stageType: 'raw_material' },
        { stageName: 'Dyeing', stageType: 'dyeing' },
        { stageName: 'Printing', stageType: 'printing' },
        { stageName: 'Finishing', stageType: 'finishing' },
        { stageName: 'Inspection', stageType: 'inspection' },
        { stageName: 'Packing', stageType: 'packing' },
        { stageName: 'Finished Fabric', stageType: 'finished_goods' },
    ],
    EXPORTER: [
        { stageName: 'Purchase', stageType: 'purchase' },
        { stageName: 'Packing', stageType: 'packing' },
        { stageName: 'Shipping', stageType: 'shipping' },
        { stageName: 'Export Documentation', stageType: 'export_documentation' },
        { stageName: 'Payment Collection', stageType: 'payment_collection' },
    ],
};

export function emptyStage(sequenceNo = 1) {
    return {
        stageName: '',
        sequenceNo,
        stageType: 'general',
        allowStart: true,
        allowComplete: true,
        allowSkip: false,
        remarksRequired: false,
        attachmentRequired: false,
    };
}

export function presetToStages(presetKey) {
    const preset = WORKFLOW_STAGE_PRESETS[presetKey] || [];
    return preset.map((s, idx) => ({ ...emptyStage(idx + 1), ...s, sequenceNo: idx + 1 }));
}
