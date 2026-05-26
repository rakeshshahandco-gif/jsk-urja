import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '../src/constants/industryTemplates.defaults.js');

const content = `/**
 * Industry / production process templates.
 * JSK URJA uses legacy-compatible mode - existing PRODUCTION_STAGES in workOrder.model.js.
 */

export const BEHAVIOR_MODES = {
    LEGACY: 'legacy-compatible',
    TEMPLATE: 'template-driven',
};

export const DEFAULT_JSK_INDUSTRY_CONFIG = {
    companyDisplayName: 'JSK URJA',
    industryTemplate: 'Electronics Manufacturer',
    productionProcessTemplate: 'JSK Electronics Standard Process',
    behaviorMode: BEHAVIOR_MODES.LEGACY,
};

export const JSK_ELECTRONICS_STANDARD_STAGES = [
    { seq: 1, stageName: 'PCB', isQcGate: false, isTestGate: false },
    { seq: 2, stageName: 'SMD Pick & Place', isQcGate: false, isTestGate: false },
    { seq: 3, stageName: 'TH Mounting', isQcGate: false, isTestGate: false },
    { seq: 4, stageName: 'Wave Soldering', isQcGate: false, isTestGate: false },
    { seq: 5, stageName: 'Touch Up', isQcGate: false, isTestGate: false },
    { seq: 6, stageName: 'Wire Insert', isQcGate: false, isTestGate: false },
    { seq: 7, stageName: '1st QC', isQcGate: true, isTestGate: false },
    { seq: 8, stageName: 'Dummy Load Testing', isQcGate: false, isTestGate: true },
    { seq: 9, stageName: 'Final QC', isQcGate: true, isTestGate: false },
    { seq: 10, stageName: 'Packing', isQcGate: false, isTestGate: false },
];

export const INDUSTRY_TEMPLATES = {
    'Electronics Manufacturer': {
        id: 'Electronics Manufacturer',
        label: 'Electronics Manufacturer',
        productionProcesses: {
            'JSK Electronics Standard Process': {
                id: 'JSK Electronics Standard Process',
                label: 'JSK Electronics Standard Process',
                stages: JSK_ELECTRONICS_STANDARD_STAGES,
                description: 'Default JSK URJA electronics assembly line (legacy workflow).',
            },
        },
    },
};
`;

fs.writeFileSync(target, content, 'utf8');
console.log('Wrote', target);
