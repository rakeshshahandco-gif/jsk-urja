const GSTIN_RE = /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/gi;
const DATE_RE = /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\b/g;
const MONEY_RE = /([\d,]+(?:\.\d{1,2})?)/;
const PINCODE_RE = /\b\d{6}\b/;
const COMPANY_HINT_RE = /\b(pvt|private|limited|ltd|llp|industries|enterprises|corporation|corp|company|co\.|inc|traders|works|engineering|electronics|solutions|services|industry|industries)\b/i;
const SKIP_HEADER_RE = /^(tax invoice|invoice|bill of supply|e-?way|original|duplicate|triplicate|recipient|buyer|consignee|ship to|bill to|dispatch|delivery|challan)/i;

const STATE_NAMES = {
    '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
    '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
    '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
    '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '28': 'Andhra Pradesh',
    '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
    '34': 'Puducherry', '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh',
    '38': 'Ladakh',
};

const STATE_NAME_LIST = Object.values(STATE_NAMES).sort((a, b) => b.length - a.length);

export function roundMoney(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function parseMoney(raw) {
    if (raw == null || raw === '') return 0;
    const n = Number(String(raw).replace(/,/g, '').trim());
    return Number.isFinite(n) ? roundMoney(n) : 0;
}

function normalizeDate(raw) {
    if (!raw) return '';
    const s = String(raw).trim();
    const monthNames = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
    };
    const named = s.match(/^(\d{1,2})[-\s/]([A-Za-z]+)[-\s/](\d{2,4})$/);
    if (named) {
        const mon = monthNames[named[2].slice(0, 4).toLowerCase()] || monthNames[named[2].slice(0, 3).toLowerCase()];
        if (mon) {
            const y = named[3].length === 2 ? `20${named[3]}` : named[3];
            return `${y}-${String(mon).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
        }
    }
    const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
    const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (dmy) {
        const y = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
        return `${y}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
    }
    return s.slice(0, 10);
}

function pickLabelValue(text, labels) {
    for (const label of labels) {
        const re = new RegExp(`${label}\\s*[:#-]?\\s*([^\\n\\r]{1,120})`, 'i');
        const m = text.match(re);
        if (m?.[1]) {
            const val = m[1].trim().replace(/\s{2,}.*/s, '').trim();
            if (val) return val;
        }
    }
    return '';
}

function findAllGstins(text) {
    const found = [];
    let m;
    GSTIN_RE.lastIndex = 0;
    while ((m = GSTIN_RE.exec(text)) !== null) found.push(m[1].toUpperCase());
    return [...new Set(found)];
}

function cleanCompanyName(raw) {
    return String(raw || '')
        .replace(/GSTIN.*/i, '')
        .replace(/PAN.*/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 120);
}

function isAddressOrLocationLine(line) {
    const s = String(line || '').trim();
    if (!s || s.length < 3) return true;
    if (PINCODE_RE.test(s)) return true;
    if (/^[A-Za-z .'-]+,\s*[A-Za-z .'-]+\s*-\s*\d{5,6}\b/.test(s)) return true;
    if (/^(maharashtra|gujarat|karnataka|tamil nadu|delhi|haryana|rajasthan|uttar pradesh|punjab|west bengal|telangana|andhra pradesh|madhya pradesh|bihar|odisha|kerala|goa|assam)\s*,/i.test(s)) {
        return true;
    }
    for (const st of STATE_NAME_LIST) {
        const escSt = st.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`^${escSt}\\s*,\\s*${escSt}`, 'i').test(s)) return true;
    }
    if (/^\d/.test(s)) return true;
    if (/^(plot|flat|floor|door|street|road|nagar|sector|pin\s*code|pincode|dist\.|district|city|state|country|phone|mobile|email|website|www\.)/i.test(s)) return true;
    if (/^[\d\s,.-]+$/.test(s)) return true;
    if (GSTIN_RE.test(s)) return true;
    return false;
}

function isCompanyNameLine(line) {
    const s = String(line || '').trim();
    if (s.length < 3 || s.length > 120) return false;
    if (isAddressOrLocationLine(s)) return false;
    if (SKIP_HEADER_RE.test(s)) return false;
    if (/invoice|bill|tax|gst|date|phone|email|address|pincode|pin code/i.test(s) && !COMPANY_HINT_RE.test(s)) return false;
    return COMPANY_HINT_RE.test(s) || (/^[A-Z][A-Za-z0-9&().,'\- ]{4,}$/.test(s) && !/\d{4,}/.test(s));
}

function inferSupplierFromFooter(text) {
    const m = text.match(/\bFor,?\s+([^\n\r]+)/i);
    if (m?.[1]) {
        const name = m[1].replace(/authorised.*/i, '').replace(/signatory.*/i, '').trim();
        if (name.length >= 3 && !isAddressOrLocationLine(name)) return cleanCompanyName(name);
    }
    return '';
}

function findBuyerBlockRange(text) {
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
    const toIdx = lines.findIndex((l) => /^To:?\b/i.test(l));
    if (toIdx < 0) return { start: -1, end: -1 };

    let end = lines.length;
    for (let i = toIdx + 1; i < lines.length; i += 1) {
        if (/^No\.?\s*Item/i.test(lines[i]) || /Item\s*&\s*Description/i.test(lines[i]) || /^S\.?\s*No\.?\s*Item/i.test(lines[i])) {
            end = i;
            break;
        }
    }
    return { start: toIdx, end };
}

function isInBuyerBlock(lineIndex, buyerRange) {
    if (buyerRange.start < 0) return false;
    return lineIndex >= buyerRange.start && lineIndex < buyerRange.end;
}

function inferSupplierName(text, gstin) {
    const footerName = inferSupplierFromFooter(text);
    if (footerName) return footerName;

    const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const buyerRange = findBuyerBlockRange(text);

    const byLabel = pickLabelValue(text, [
        'Supplier Name', 'Vendor Name', 'Party Name', 'Seller Name', 'Billed By', 'Bill From', 'Sold By', 'From',
    ]);
    if (byLabel && byLabel.length > 2 && !isAddressOrLocationLine(byLabel) && !GSTIN_RE.test(byLabel)) {
        return cleanCompanyName(byLabel);
    }

    const headerCandidates = [];
    for (let i = 0; i < Math.min(lines.length, 30); i += 1) {
        if (isInBuyerBlock(i, buyerRange)) continue;
        const line = lines[i];
        if (isCompanyNameLine(line)) headerCandidates.push({ line, score: COMPANY_HINT_RE.test(line) ? 3 : 1, idx: i });
    }
    if (headerCandidates.length) {
        headerCandidates.sort((a, b) => b.score - a.score || a.idx - b.idx);
        return cleanCompanyName(headerCandidates[0].line);
    }

    if (gstin) {
        const idx = text.toUpperCase().indexOf(gstin.toUpperCase());
        if (idx > 0) {
            const before = text.slice(Math.max(0, idx - 240), idx).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const nameCandidates = [];
            for (let i = before.length - 1; i >= 0; i -= 1) {
                const line = before[i];
                if (line.length < 3 || line.length > 120) continue;
                if (isAddressOrLocationLine(line)) continue;
                if (/^To:?\b/i.test(line)) continue;
                if (/invoice|bill|tax|gst|date|phone|email|address|pin/i.test(line) && !COMPANY_HINT_RE.test(line)) continue;
                if (/^\d/.test(line)) continue;
                nameCandidates.push(line);
            }
            const withHint = nameCandidates.find((l) => COMPANY_HINT_RE.test(l));
            if (withHint) return cleanCompanyName(withHint);
            if (nameCandidates[0]) return cleanCompanyName(nameCandidates[0]);
        }
    }
    return '';
}

function inferSupplierAddress(text, gstin) {
    const byLabel = pickLabelValue(text, ['Address', 'Supplier Address', 'Vendor Address', 'Regd. Office', 'Registered Office']);
    if (byLabel && isAddressOrLocationLine(byLabel)) return byLabel.slice(0, 200);

    if (gstin) {
        const idx = text.toUpperCase().indexOf(gstin.toUpperCase());
        if (idx > 0) {
            const before = text.slice(Math.max(0, idx - 240), idx).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            for (let i = before.length - 1; i >= 0; i -= 1) {
                const line = before[i];
                if (isAddressOrLocationLine(line) && line.length >= 8) return line.slice(0, 200);
            }
        }
    }
    return '';
}

function cleanInvoiceNo(raw) {
    const val = String(raw || '').trim().split(/\s{2,}/)[0];
    const cleaned = val.replace(/[^\w\-/]/g, '').slice(0, 40);
    return cleaned || val.slice(0, 40);
}

function inferInvoiceNumber(text) {
    const val = pickLabelValue(text, [
        'Invoice No', 'Invoice Number', 'Bill No', 'Bill Number', 'Supplier Invoice No', 'Tax Invoice No', 'Inv No', 'Invoice #',
        'PI No', 'P.I. No', 'Proforma Invoice No', 'Proforma No', 'Quotation No',
    ]);
    if (val) return cleanInvoiceNo(val);

    const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        const sameLine = line.match(/(?:invoice|bill)\s*(?:no|number|#)\.?\s*[:.]?\s*([A-Z0-9][\w\-/]{1,38})/i);
        if (sameLine) return cleanInvoiceNo(sameLine[1]);
        if (/^(invoice|bill)\s*(no|number|#)/i.test(line) && i + 1 < lines.length) {
            const next = lines[i + 1];
            if (/^[A-Z0-9][\w\-/]{2,}$/i.test(next) && !DATE_RE.test(next)) return cleanInvoiceNo(next);
        }
    }

    const m = text.match(/\b(?:INV|PI|BILL|FT|TI)[-/]?\d{2,}[\w\-/]*/i);
    return m ? cleanInvoiceNo(m[0]) : '';
}

function inferInvoiceDate(text) {
    const val = pickLabelValue(text, ['Invoice Date', 'Bill Date', 'Date of Invoice', 'Tax Invoice Date', 'Dated']);
    if (val) {
        const d = val.match(DATE_RE);
        if (d) return normalizeDate(d[0]);
        return normalizeDate(val.split(/\s+/)[0]);
    }
    const dateLine = pickLabelValue(text, ['Date']);
    if (dateLine) return normalizeDate(dateLine.split(/\s+/)[0]);
    const m = text.match(/(?:Invoice Date|Bill Date|Dated)[^\d]{0,20}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i);
    if (m) return normalizeDate(m[1]);
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
        if (/invoice date|bill date|dated/i.test(lines[i])) {
            const d = lines[i].match(DATE_RE) || (lines[i + 1] || '').match(DATE_RE);
            if (d) return normalizeDate(d[0]);
        }
    }
    return '';
}

function inferAmount(text, labels) {
    for (const label of labels) {
        const re = new RegExp(`${label}\\s*[:.]?\\s*${MONEY_RE.source}`, 'i');
        const m = text.match(re);
        if (m) {
            const n = parseMoney(m[1]);
            if (n > 0) return n;
        }
    }
    return 0;
}

function inferAmountFromLines(text, labelRes) {
    let best = 0;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const l = line.replace(/\s+/g, ' ').trim();
        for (const re of labelRes) {
            const m = l.match(re);
            if (m?.[1]) {
                const n = parseMoney(m[1]);
                if (n > best) best = n;
            }
        }
    }
    return best;
}

function inferTaxBreakup(text) {
    const cgstLabel = inferAmount(text, ['CGST', 'Central GST', 'C GST']);
    const sgstLabel = inferAmount(text, ['SGST', 'State GST', 'S GST']);
    const igstLabel = inferAmount(text, ['IGST', 'Integrated GST', 'I GST']);

    const cgstLine = inferAmountFromLines(text, [
        /\bCGST\b(?:\s*@\s*[\d.]+\s*%?)?[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bCentral GST\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
    ]);
    const sgstLine = inferAmountFromLines(text, [
        /\bSGST\b(?:\s*@\s*[\d.]+\s*%?)?[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bState GST\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
    ]);
    const igstLine = inferAmountFromLines(text, [
        /\bIGST\b(?:\s*@\s*[\d.]+\s*%?)?[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bAdd IGST\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bIntegrated GST\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
    ]);

    const cgst = cgstLine || cgstLabel;
    const sgst = sgstLine || sgstLabel;
    const igst = igstLine || igstLabel;

    const taxableLine = inferAmountFromLines(text, [
        /\bTaxable(?:\s+Value|\s+Amount)?\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bTotal Amount before Tax\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bAssessable Value\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bSub\s*Total\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
    ]);
    const taxableAmount = taxableLine || inferAmount(text, ['Taxable Amount', 'Taxable Value', 'Assessable Value', 'Sub Total', 'Subtotal', 'Total Amount before Tax']);

    const freight = inferAmountFromLines(text, [
        /\bFreight\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bTransport(?:ation)?\s+Charges?\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
    ]) || inferAmount(text, ['Freight', 'Transport Charges', 'Transportation Charges']);

    const otherCharges = inferAmountFromLines(text, [
        /\bOther Charges?\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bMisc(?:ellaneous)?\s+Charges?\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
    ]) || inferAmount(text, ['Other Charges', 'Misc Charges', 'Miscellaneous Charges']);

    const roundOff = inferAmountFromLines(text, [
        /\bRound(?:\s|-)?Off\b[^0-9]*(-?[\d,]+(?:\.\d{1,2})?)/i,
    ]) || inferAmount(text, ['Round Off', 'Roundoff']);

    const grandLine = inferAmountFromLines(text, [
        /\bGrand Total\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bTotal Amount\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bInvoice Value\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bNet Amount\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bAmount Payable\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
        /\bTotal Invoice Value\b[^0-9]*([\d,]+(?:\.\d{1,2})?)/i,
    ]);
    const grandTotal = grandLine || inferAmount(text, ['Grand Total', 'Total Amount', 'Invoice Value', 'Net Amount', 'Amount Payable', 'Total Invoice Value']);

    let gstType = 'CGST / SGST';
    if (igst > 0 && cgst === 0 && sgst === 0) gstType = 'IGST';

    return {
        cgst: roundMoney(cgst),
        sgst: roundMoney(sgst),
        igst: roundMoney(igst),
        taxableAmount: roundMoney(taxableAmount),
        freight: roundMoney(freight),
        otherCharges: roundMoney(otherCharges),
        roundOff: roundMoney(roundOff),
        grandTotal: roundMoney(grandTotal),
        gstType,
    };
}

function parseLineItems(text) {
    const items = [];
    const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const startIdx = lines.findIndex((l) => /description|particulars|item name|product name|hsn/i.test(l));
    const endIdx = lines.findIndex((l, i) => i > (startIdx >= 0 ? startIdx : 0) && /grand total|total amount|taxable|amount in words|total invoice/i.test(l));

    const slice = lines.slice(startIdx >= 0 ? startIdx + 1 : 0, endIdx > 0 ? endIdx : lines.length);
    for (const line of slice) {
        if (line.length < 5) continue;
        if (/^(total|sub total|cgst|sgst|igst|round off|freight|tax|hsn|s\.?\s*no)/i.test(line)) continue;

        const hsnMatch = line.match(/\b(\d{4,8})\b/);
        const gstMatch = line.match(/\b(0|5|12|18|28)(?:\s*%|\s*percent)?\b/i);
        const nums = [...line.matchAll(/([\d,]+(?:\.\d{1,2})?)/g)].map((m) => parseMoney(m[1])).filter((n) => n > 0);
        if (nums.length < 2) continue;

        let qty = 0;
        let rate = 0;
        let amount = nums[nums.length - 1];
        if (nums.length >= 3) {
            qty = nums[nums.length - 3];
            rate = nums[nums.length - 2];
        } else {
            qty = 1;
            rate = nums[0];
            amount = nums[1];
        }

        let itemName = line
            .replace(/\b\d{4,8}\b/g, ' ')
            .replace(/\b(0|5|12|18|28)\s*%?\b/gi, ' ')
            .replace(/[\d,]+(?:\.\d{1,2})?/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (itemName.length < 2) continue;
        if (qty <= 0 || rate <= 0) continue;

        items.push({
            itemName: itemName.slice(0, 120),
            hsnCode: hsnMatch?.[1] || '',
            qty,
            rate: roundMoney(rate),
            amount: roundMoney(amount),
            gstRate: gstMatch ? Number(gstMatch[1]) : 18,
        });
    }

    const dedup = [];
    const seen = new Set();
    for (const row of items) {
        const key = `${row.itemName}|${row.qty}|${row.rate}`;
        if (seen.has(key)) continue;
        seen.add(key);
        dedup.push(row);
    }
    return dedup.slice(0, 50);
}

export function parsePurchaseInvoiceText(text) {
    const raw = String(text || '');
    const gstins = findAllGstins(raw);
    const supplierGstin = gstins[0] || '';
    const buyerGstin = gstins[1] || '';
    const supplierName = inferSupplierName(raw, supplierGstin);
    const supplierAddress = inferSupplierAddress(raw, supplierGstin);
    const tax = inferTaxBreakup(raw);
    const stateCode = supplierGstin.slice(0, 2);
    const items = parseLineItems(raw);

    const itemTotal = roundMoney(items.reduce((s, r) => s + (r.amount || r.qty * r.rate), 0));
    let grandTotal = tax.grandTotal || itemTotal;
    if (!tax.grandTotal && tax.taxableAmount > 0) {
        grandTotal = roundMoney(tax.taxableAmount + tax.cgst + tax.sgst + tax.igst + tax.freight + tax.otherCharges + tax.roundOff);
    }

    return {
        supplierName,
        supplierGstin,
        buyerGstin,
        supplierAddress,
        supplierInvoiceNo: inferInvoiceNumber(raw),
        invoiceDate: inferInvoiceDate(raw) || new Date().toISOString().split('T')[0],
        poNumber: pickLabelValue(raw, ['PO Number', 'Purchase Order', 'PO No', 'Order No', 'P.O. No']),
        lrNumber: pickLabelValue(raw, ['LR Number', 'LR No', 'L.R. No', 'Lorry Receipt', 'Consignment No']),
        vehicleNumber: pickLabelValue(raw, ['Vehicle Number', 'Vehicle No', 'Veh No', 'Truck No', 'Transporter Vehicle']),
        gstType: tax.gstType,
        placeOfSupply: STATE_NAMES[stateCode] || '',
        taxableAmount: tax.taxableAmount,
        cgst: tax.cgst,
        sgst: tax.sgst,
        igst: tax.igst,
        freight: tax.freight,
        otherCharges: tax.otherCharges,
        roundOff: tax.roundOff,
        grandTotal,
        items,
    };
}

export function parseSalesInvoiceText(text) {
    const parsed = parsePurchaseInvoiceText(text);
    return {
        customerName: parsed.supplierName,
        customerGstin: parsed.supplierGstin,
        poNumber: parsed.poNumber || pickLabelValue(text, ['PO Number', 'Purchase Order', 'PO No', 'Order No']),
        invoiceDate: parsed.invoiceDate,
        gstType: parsed.gstType,
        items: parsed.items,
        grandTotal: parsed.grandTotal,
    };
}

export function parseExpenseBillText(text) {
    const parsed = parsePurchaseInvoiceText(text);
    return {
        vendorName: parsed.supplierName,
        billNo: parsed.supplierInvoiceNo,
        billDate: parsed.invoiceDate,
        narration: pickLabelValue(text, ['Narration', 'Description', 'Particulars']) || parsed.supplierName,
        taxableAmount: parsed.taxableAmount,
        cgst: parsed.cgst,
        sgst: parsed.sgst,
        igst: parsed.igst,
        freight: parsed.freight,
        otherCharges: parsed.otherCharges,
        grandTotal: parsed.grandTotal,
        suggestedKeywords: parsed.supplierName ? parsed.supplierName.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 5) : [],
    };
}

export function parseInvoiceText(text, moduleType) {
    if (moduleType === 'sales_invoice') return parseSalesInvoiceText(text);
    if (moduleType === 'expense_bill') return parseExpenseBillText(text);
    return parsePurchaseInvoiceText(text);
}
