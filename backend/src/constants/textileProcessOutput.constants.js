/** Process output stock and transfer - Handloom / TEXTILE template only. */

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

/** Localhost demo only — identified by sourceChallanNo; never mixed with real challans. */
export const TEXTILE_PROCESS_OUTPUT_DEMO = {
    CHALLAN_NO: 'TDC-DEMO-00001',
    RETURN_NO: 'DR-DEMO-001',
    ITEM_NAME: 'KATHA SILK',
    COLOUR: 'BLUE',
    VENDOR: 'ABC Dyeing',
    PROCESS_TYPE: 'Dyeing',
    QTY_PCS: 20,
    METER: 50,
    FG_ITEM_NAME: 'FINISHED PRODUCT',
};

export function isDemoProcessOutputStock(doc) {
    return String(doc?.sourceChallanNo || '') === TEXTILE_PROCESS_OUTPUT_DEMO.CHALLAN_NO;
}
