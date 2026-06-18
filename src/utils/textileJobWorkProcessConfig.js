import { PATHS } from '@/routes/paths';

const PROCESS_PATHS = {
    Dyeing: {
        list: PATHS.PRODUCTION.TEXTILE_DYEING_CHALLANS,
        new: PATHS.PRODUCTION.TEXTILE_DYEING_CHALLAN_NEW,
        detail: PATHS.PRODUCTION.TEXTILE_DYEING_CHALLAN_DETAIL,
        return: PATHS.PRODUCTION.TEXTILE_DYEING_CHALLAN_RETURN,
        stock: PATHS.PRODUCTION.TEXTILE_STOCK_WITH_DYERS,
        reports: PATHS.PRODUCTION.TEXTILE_DYEING_REPORTS,
        apiBase: '/textile-dyeing-challans',
    },
    Embroidery: {
        list: PATHS.PRODUCTION.TEXTILE_EMBROIDERY_CHALLANS,
        new: PATHS.PRODUCTION.TEXTILE_EMBROIDERY_CHALLAN_NEW,
        detail: PATHS.PRODUCTION.TEXTILE_EMBROIDERY_CHALLAN_DETAIL,
        return: PATHS.PRODUCTION.TEXTILE_EMBROIDERY_CHALLAN_RETURN,
        stock: PATHS.PRODUCTION.TEXTILE_STOCK_WITH_EMBROIDERY,
        reports: PATHS.PRODUCTION.TEXTILE_EMBROIDERY_REPORTS,
        apiBase: '/textile-job-work-challans/Embroidery',
    },
};

function buildGenericProcessPaths(processType) {
    return {
        list: PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW,
        new: PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW,
        detail: (id) => PATHS.PRODUCTION.TEXTILE_PROCESS_CHALLAN_DETAIL(processType, id),
        return: PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW,
        stock: PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW,
        reports: PATHS.PRODUCTION.TEXTILE_PRODUCTION_WORKFLOW,
        apiBase: `/textile-job-work-challans/${processType}`,
    };
}

export function getTextileJobWorkProcessConfig(processType = 'Dyeing') {
    const pt = processType || 'Dyeing';
    const paths = PROCESS_PATHS[pt] || buildGenericProcessPaths(pt);
    const vendorLabel = 'Job Worker / Supplier';
    const vendorLabelShort = 'Job Worker';
    const vendorWiseTabLabel = 'Job Worker Wise';
    const stockWithLabel = 'Stock With Job Workers';

    return {
        processType: pt,
        vendorLabel,
        vendorLabelShort,
        vendorWiseTabLabel,
        vendorField: 'dyerName',
        stockWithLabel,
        showColourFields: pt === 'Dyeing',
        showDesignField: pt !== 'Dyeing',
        designLabel: pt === 'Embroidery' ? 'Embroidery Design / Pattern' : `${pt} Design / Pattern`,
        inputItemLabel: 'Input Item',
        issueTitle: `${pt} Issue Challan`,
        returnTitle: `${pt} Return`,
        newIssueTitle: `New ${pt} Issue Challan`,
        listSubtitle: 'Issue material to job workers / suppliers — meter, PCS, or than',
        emptyListText: `No ${pt.toLowerCase()} challans yet`,
        labourSectionTitle: `Default Labour (${pt}) — applies to all lines`,
        paths,
        apiBase: paths.apiBase,
    };
}

export function getChallanDetailPath(processType, challanId) {
    const cfg = getTextileJobWorkProcessConfig(processType);
    return cfg.paths.detail(challanId);
}

export function getChallanIssueTitle(processType) {
    const pt = processType || 'Dyeing';
    return pt === 'Dyeing' ? 'Dyeing Issue Challan' : `${pt} Issue Challan`;
}

export const TEXTILE_JOB_WORK_PROCESS_TYPES = [
    'Dyeing',
    'Embroidery',
    'Printing',
    'Washing',
    'Pressing',
    'Finishing',
    'Stitching',
    'Packing',
    'Other',
];
