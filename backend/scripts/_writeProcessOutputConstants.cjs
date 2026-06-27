const fs = require('fs');
const p = 'c:/Users/Admin/Desktop/Project/backend/src/constants/textileProcessOutput.constants.js';
const c = `/** Process output stock and transfer - Handloom / TEXTILE template only. */

export const TEXTILE_SOURCE_TYPES = ['PREVIOUS_PROCESS_OUTPUT', 'DIRECT_STOCK'];

export const TEXTILE_RETURN_NEXT_ACTIONS = [
    'KEEP_OUTPUT_STOCK',
    'SEND_TO_NEXT_PROCESS',
    'FINISHED_GOODS',
];

export const PROCESS_OUTPUT_WAREHOUSE = {
    Dyeing: 'Process Output - Dyed Stock',
    Printing: 'Process Output - Printed Stock',
    Embroidery: 'Process Output - Embroidered Stock',
    Washing: 'Process Output - Washed Stock',
    Pressing: 'Process Output - Pressed Stock',
    Finishing: 'Process Output - Finished Process Stock',
    Stitching: 'Process Output - Stitched Stock',
    Packing: 'Process Output - Packed Stock',
};

export const PROCESS_OUTPUT_STATUS = ['Available', 'Partially Consumed', 'Fully Consumed', 'Transferred To FG'];
`;
fs.writeFileSync(p, c, 'utf8');
console.log('written');
