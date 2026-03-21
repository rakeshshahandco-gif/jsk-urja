const ExcelJS = require('exceljs');
const path = require('path');

async function generateSampleBOM() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM Template');

    worksheet.columns = [
        { header: 'BOM Number (BOM-XXXX-XXX)', key: 'bomNumber', width: 30 },
        { header: 'Product Code*', key: 'productCode', width: 25 },
        { header: 'BOM Type (Production/Sub-Assembly/Service BOM)', key: 'bomType', width: 35 },
        { header: 'Version (V1, V2...)', key: 'version', width: 15 },
        { header: 'Status (Draft/Approved/Inactive)', key: 'status', width: 20 },
        { header: 'Production Qty (Finished Product Output)', key: 'productionQuantity', width: 35 },
        { header: 'Revision Date (YYYY-MM-DD)', key: 'revisionDate', width: 25 },
        { header: 'Is Default? (TRUE/FALSE)', key: 'isDefault', width: 15 },
        { header: 'Labour Rate Per Point (₹)', key: 'labourCostPerPoint', width: 25 },
        { header: 'Process Cost (₹)', key: 'totalProcessCost', width: 20 },
        { header: 'Overhead Cost (₹)', key: 'overheadCost', width: 20 },
        { header: 'Other Labour Cost (₹)', key: 'labourCost', width: 20 },
        { header: 'SMT Assembly? (TRUE/FALSE)', key: 'smtAssembly', width: 20 },
        { header: 'Manual Assembly? (TRUE/FALSE)', key: 'manualAssembly', width: 22 },
        { header: 'Testing Required? (TRUE/FALSE)', key: 'testingRequired', width: 20 },
        { header: 'QC Required? (TRUE/FALSE)', key: 'qcRequired', width: 18 },
        { header: 'Packing Required? (TRUE/FALSE)', key: 'packingRequired', width: 20 },
        { header: 'Scrap Account', key: 'scrapAccount', width: 25 },
        { header: 'Header Remarks', key: 'remarks', width: 30 },
        { header: 'Component Code*', key: 'componentCode', width: 25 },
        { header: 'Component Qty*', key: 'componentQty', width: 15 },
        { header: 'Component Rate (₹)', key: 'rate', width: 18 },
        { header: 'Component Points (Labour)', key: 'points', width: 22 },
        { header: 'Component Remark', key: 'componentRemarks', width: 30 }
    ];

    // Data for MULTIMODE GATEWAY (Item Code: MULTIMODE GATEWAY - I should verify this)
    // Actually let's use a generic item code or one I know exists.
    // From previous verification, "MULTIMODE GATEWAY" exists.
    
    // Row 1 for BOM
    worksheet.addRow({
        bomNumber: 'BOM-TEST-001',
        productCode: 'MULTIMODE GATEWAY',
        bomType: 'Production',
        version: 'V1',
        status: 'Approved',
        productionQuantity: 10,
        revisionDate: '2026-03-20',
        isDefault: 'TRUE',
        labourCostPerPoint: 0.5,
        totalProcessCost: 100,
        overheadCost: 50,
        labourCost: 30,
        smtAssembly: 'TRUE',
        manualAssembly: 'TRUE',
        testingRequired: 'TRUE',
        qcRequired: 'TRUE',
        packingRequired: 'TRUE',
        scrapAccount: 'Test Scrap',
        remarks: 'Import Test Header',
        componentCode: 'MULTIMODE GATEWAY', // Using same for test if needed, or another one
        componentQty: 1,
        rate: 1500,
        points: 5,
        componentRemarks: 'Test Comp Remark'
    });

    const filePath = path.join(process.cwd(), 'sample_bom_import.xlsx');
    await workbook.xlsx.writeFile(filePath);
    console.log(`Sample BOM created at: ${filePath}`);
}

generateSampleBOM();
