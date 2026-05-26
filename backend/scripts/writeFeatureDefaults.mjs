import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '../src/constants/companyFeatureSettings.defaults.js');

const content = `/**
 * Default feature flags — all enabled so existing companies keep current behavior.
 */
export const DEFAULT_COMPANY_FEATURE_SETTINGS = {
    sales: {
        enableSalesInvoice: true,
        enableEstimate: true,
        enableSalesOrder: true,
        enableDeliveryChallan: true,
        enableBarcodeQr: true,
        enableItemWiseBarcode: true,
        enablePublicInvoiceQrLink: true,
    },
    gst: {
        gstApplicable: true,
        eInvoiceRequired: true,
        eWayBillRequired: true,
        gstr1Required: true,
        gstr3bRequired: true,
        gstr2a2bReconciliationRequired: true,
        exportLutRequired: true,
        gstRefundModuleRequired: true,
    },
    inventory: {
        inventoryRequired: true,
        stockDeductionOnSales: true,
        stockAdditionOnPurchase: true,
        batchSerialBarcodeTracking: true,
        negativeStockAllowed: true,
        warehouseLocationTracking: true,
    },
    accounting: {
        accountingRequired: true,
        autoLedgerPosting: true,
        voucherApprovalRequired: true,
        billWiseAdjustmentRequired: true,
        bankReconciliationRequired: true,
        interestPayableStatementRequired: true,
    },
    tdsTcs: {
        tdsRequired: true,
        tcsRequired: true,
        autoTdsDeduction: true,
        tdsChallanPaymentTracking: true,
    },
    manufacturing: {
        bomRequired: true,
        productionRequired: true,
        wipAccountingRequired: true,
        qcRequired: true,
    },
    saas: {
        moduleControlEnabled: true,
        userLimit: 0,
        subscriptionStatusActive: true,
        companyFeatureAccessEnabled: true,
    },
};
`;

fs.writeFileSync(target, content, 'utf8');
console.log('Wrote', target);
