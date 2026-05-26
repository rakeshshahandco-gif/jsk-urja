import moment from 'moment';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { Item } from '../models/item.model.js';
import {
    resolveLineGp,
    isExportInvoice,
    getCostingSettings,
    COST_SOURCES,
} from './productCostEngine.service.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function baseInvoiceFilters(query = {}) {
    const filters = {
        isDeleted: { $ne: true },
        status: { $nin: ['Cancelled', 'Draft'] },
    };
    if (query.financialYear) filters.financialYear = String(query.financialYear).trim();
    if (query.customerId) filters.customerId = query.customerId;
    if (query.startDate || query.endDate) {
        filters.invoiceDate = {};
        if (query.startDate) filters.invoiceDate.$gte = moment(query.startDate).startOf('day').toDate();
        if (query.endDate) filters.invoiceDate.$lte = moment(query.endDate).endOf('day').toDate();
    }
    if (query.exportFilter === 'export') {
        filters.$or = [
            { customerRegistrationType: /export/i },
            { invoiceType: 'Deemed Export' },
            { exportCountry: { $nin: [null, '', 'India'] } },
        ];
    } else if (query.exportFilter === 'domestic') {
        filters.$and = [
            { customerRegistrationType: { $not: /export/i } },
            { invoiceType: { $ne: 'Deemed Export' } },
        ];
    }
    return filters;
}

async function loadInvoicesWithLines(query) {
    return SalesInvoice.find(baseInvoiceFilters(query))
        .select(
            'invoiceNumber invoiceDate customerId customerName customerRegistrationType exportCountry gstType invoiceType orderCategory documentType items financialYear',
        )
        .lean();
}

export async function getProductWiseGpReport(query = {}) {
    const invoices = await loadInvoicesWithLines(query);
    const byProduct = new Map();

    for (const inv of invoices) {
        for (const line of inv.items || []) {
            if (!line.itemId && !line.itemCode) continue;
            if (inv.orderCategory === 'Replacement') continue;
            if (query.itemId && String(line.itemId) !== String(query.itemId)) continue;
            if (query.category) {
                const itemDoc = line.itemId ? await Item.findById(line.itemId).select('itemCategory itemGroupName').lean() : null;
                if (itemDoc?.itemCategory !== query.category && itemDoc?.itemGroupName !== query.category) continue;
            }

            const gp = await resolveLineGp(line, inv.invoiceDate);
            const key = String(line.itemId || line.itemCode);
            const row = byProduct.get(key) || {
                itemId: line.itemId,
                itemCode: line.itemCode,
                itemName: line.itemName,
                qtySold: 0,
                salesValue: 0,
                costValue: 0,
                gpAmount: 0,
                invoiceCount: 0,
                costSources: {},
                estimatedLines: 0,
            };

            row.qtySold += Number(line.qty) || 0;
            row.salesValue = r2(row.salesValue + gp.salesValue);
            row.costValue = r2(row.costValue + gp.totalCost);
            row.gpAmount = r2(row.gpAmount + gp.gpAmount);
            row.invoiceCount += 1;
            row.costSources[gp.costSource] = (row.costSources[gp.costSource] || 0) + 1;
            if (gp.costEstimated) row.estimatedLines += 1;

            byProduct.set(key, row);
        }
    }

    return [...byProduct.values()]
        .map((r) => ({
            ...r,
            gpPercent: r.salesValue > 0 ? r2((r.gpAmount / r.salesValue) * 100) : 0,
            avgSaleRate: r.qtySold > 0 ? r2(r.salesValue / r.qtySold) : 0,
            avgCostRate: r.qtySold > 0 ? r2(r.costValue / r.qtySold) : 0,
            primaryCostSource: Object.entries(r.costSources).sort((a, b) => b[1] - a[1])[0]?.[0] || '',
        }))
        .sort((a, b) => b.gpAmount - a.gpAmount);
}

export async function getCustomerWiseGpReport(query = {}) {
    const invoices = await loadInvoicesWithLines(query);
    const byCustomer = new Map();

    for (const inv of invoices) {
        const key = String(inv.customerId || inv.customerName);
        const row = byCustomer.get(key) || {
            customerId: inv.customerId,
            customerName: inv.customerName,
            salesValue: 0,
            costValue: 0,
            gpAmount: 0,
            invoiceCount: 0,
            exportSales: 0,
            domesticSales: 0,
        };

        let invSales = 0;
        let invCost = 0;
        for (const line of inv.items || []) {
            if (inv.orderCategory === 'Replacement') continue;
            const gp = await resolveLineGp(line, inv.invoiceDate);
            invSales += gp.salesValue;
            invCost += gp.totalCost;
        }

        row.salesValue = r2(row.salesValue + invSales);
        row.costValue = r2(row.costValue + invCost);
        row.gpAmount = r2(row.gpAmount + (invSales - invCost));
        row.invoiceCount += 1;
        if (isExportInvoice(inv)) row.exportSales = r2(row.exportSales + invSales);
        else row.domesticSales = r2(row.domesticSales + invSales);

        byCustomer.set(key, row);
    }

    return [...byCustomer.values()]
        .map((r) => ({
            ...r,
            gpPercent: r.salesValue > 0 ? r2((r.gpAmount / r.salesValue) * 100) : 0,
            exportLocal: r.exportSales >= r.domesticSales ? 'Export' : 'Domestic',
        }))
        .sort((a, b) => b.gpAmount - a.gpAmount);
}

export async function getInvoiceWiseGpReport(query = {}) {
    const invoices = await loadInvoicesWithLines(query);
    const rows = [];

    for (const inv of invoices) {
        for (const line of inv.items || []) {
            if (inv.orderCategory === 'Replacement') continue;
            const gp = await resolveLineGp(line, inv.invoiceDate);
            rows.push({
                invoiceId: inv._id,
                invoiceNumber: inv.invoiceNumber,
                invoiceDate: inv.invoiceDate,
                customerName: inv.customerName,
                itemCode: line.itemCode,
                itemName: line.itemName,
                qty: line.qty,
                salesValue: gp.salesValue,
                costValue: gp.totalCost,
                gpAmount: gp.gpAmount,
                gpPercent: gp.gpPercent,
                costSource: gp.costSource,
                costEstimated: gp.costEstimated,
                gpWarning: line.gpWarning || '',
                exportDomestic: isExportInvoice(inv) ? 'Export' : 'Domestic',
            });
        }
    }

    return rows.sort((a, b) => new Date(b.invoiceDate) - new Date(a.invoiceDate));
}

export async function getNegativeGpReport(query = {}) {
    const settings = await getCostingSettings();
    const threshold = Number(settings.negativeGpThresholdPercent ?? 0);
    const rows = await getInvoiceWiseGpReport(query);
    return rows.filter((r) => r.gpPercent < threshold || r.gpAmount < 0);
}

export async function getExportDomesticGpSummary(query = {}) {
    const invoices = await loadInvoicesWithLines(query);
    const summary = {
        export: { salesValue: 0, costValue: 0, gpAmount: 0, invoiceCount: 0 },
        domestic: { salesValue: 0, costValue: 0, gpAmount: 0, invoiceCount: 0 },
    };

    for (const inv of invoices) {
        const bucket = isExportInvoice(inv) ? summary.export : summary.domestic;
        let invSales = 0;
        let invCost = 0;
        for (const line of inv.items || []) {
            if (inv.orderCategory === 'Replacement') continue;
            const gp = await resolveLineGp(line, inv.invoiceDate);
            invSales += gp.salesValue;
            invCost += gp.totalCost;
        }
        bucket.salesValue = r2(bucket.salesValue + invSales);
        bucket.costValue = r2(bucket.costValue + invCost);
        bucket.gpAmount = r2(bucket.gpAmount + (invSales - invCost));
        bucket.invoiceCount += 1;
    }

    for (const k of ['export', 'domestic']) {
        summary[k].gpPercent =
            summary[k].salesValue > 0 ? r2((summary[k].gpAmount / summary[k].salesValue) * 100) : 0;
    }
    return summary;
}

export async function getHighLowMarginProducts(query = {}, mode = 'high') {
    const settings = await getCostingSettings();
    const all = await getProductWiseGpReport(query);
    const highCut = Number(settings.highMarginThresholdPercent ?? 25);
    const lowCut = Number(settings.lowMarginThresholdPercent ?? 10);

    if (mode === 'high') return all.filter((r) => r.gpPercent >= highCut && r.salesValue > 0);
    return all.filter((r) => r.gpPercent <= lowCut && r.salesValue > 0);
}

export async function getCostSourceExceptionReport(query = {}) {
    const rows = await getInvoiceWiseGpReport(query);
    return rows.filter(
        (r) =>
            r.costEstimated ||
            r.costSource === COST_SOURCES.ESTIMATED ||
            r.costSource === COST_SOURCES.VALUATION ||
            r.gpWarning,
    );
}

/** Backend-ready director dashboard summary */
export async function getDirectorGpSummary(query = {}) {
    const [products, customers, negative, exportDomestic] = await Promise.all([
        getProductWiseGpReport(query),
        getCustomerWiseGpReport(query),
        getNegativeGpReport(query),
        getExportDomesticGpSummary(query),
    ]);

    return {
        topProfitProducts: products.slice(0, 10),
        lowProfitProducts: [...products].sort((a, b) => a.gpPercent - b.gpPercent).slice(0, 10),
        negativeGpInvoices: negative.slice(0, 20),
        highestMarginCustomers: customers.slice(0, 10),
        exportProfitPercent: exportDomestic.export.gpPercent,
        domesticProfitPercent: exportDomestic.domestic.gpPercent,
        exportDomestic,
        totals: {
            salesValue: r2(products.reduce((s, p) => s + p.salesValue, 0)),
            costValue: r2(products.reduce((s, p) => s + p.costValue, 0)),
            gpAmount: r2(products.reduce((s, p) => s + p.gpAmount, 0)),
        },
    };
}
