/**
 * Unit tests for the GST portal GSTR-2B Excel/CSV parser.
 * Tests use in-memory ExcelJS buffers that mimic actual GST portal downloads:
 *   - Multiple sheets (B2B, B2BA, CDNR, IMPG, …)
 *   - Title / instruction rows before the real header row
 *   - GST-portal column names with Rs / rupee symbols
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  parseGstrCsvBuffer,
  parseGstrExcelBuffer,
  parseGstrFile,
} from "../src/services/gstReconciliation/parseGstrPortal.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildExcelBuffer(sheets) {
  const wb = new ExcelJS.Workbook();
  for (const { name, rows } of sheets) {
    const ws = wb.addWorksheet(name);
    rows.forEach((r) => ws.addRow(r));
  }
  return wb.xlsx.writeBuffer();
}

const B2B_TITLE = ["GSTR-2B B2B Invoices (Auto-drafted)"];
const B2B_BLANK = [];
const B2B_HEADER = [
  "GSTIN of Supplier",
  "Trade/Legal Name of the Supplier",
  "Invoice Number",
  "Invoice Type",
  "Invoice Date",
  "Invoice Value",
  "Place Of Supply",
  "Reverse Charge",
  "Applicable % of Tax Rate",
  "Taxable Value",
  "Integrated Tax Amount",
  "Central Tax Amount",
  "State/UT Tax Amount",
  "Cess Amount",
  "GSTR-1/IFF/GSTR-5 Period",
  "ITC Availability",
];

function b2bRow(gstin, name, inv, date, txval, igst, cgst, sgst, cess, itc) {
  return [
    gstin,
    name,
    inv,
    "Regular B2B",
    date,
    txval + igst + cgst + sgst + cess,
    "27-Maharashtra",
    "N",
    "18",
    txval,
    igst,
    cgst,
    sgst,
    cess,
    "032025",
    itc || "Yes",
  ];
}

// ---------------------------------------------------------------------------
// CSV tests
// ---------------------------------------------------------------------------

describe("parseGstrCsvBuffer", () => {
  it("parses standard GST portal CSV headers", () => {
    const csv = [
      "GSTIN of Supplier,Invoice Number,Invoice Date,Integrated Tax Amount,Central Tax Amount,State/UT Tax Amount,Cess Amount",
      "27AAAAA0000A1Z5,INV-001,10/04/2025,1800,0,0,0",
      "27BBBBB0000B1Z5,INV-002,15/04/2025,0,450,450,0",
    ].join("\n");
    const r = parseGstrCsvBuffer(Buffer.from(csv));
    assert.equal(r.records.length, 2);
    assert.equal(r.records[0].supplierGstin, "27AAAAA0000A1Z5");
    assert.equal(r.records[0].igst, 1800);
    assert.equal(r.records[1].totalTax, 900);
  });

  it("detects header even with title rows above it", () => {
    const csv = [
      "GSTR-2B Details Report",
      "",
      "GSTIN of Supplier,Invoice Number,Invoice Date,Integrated Tax Amount",
      "27AAAAA0000A1Z5,INV-T01,01/04/2025,3600",
    ].join("\n");
    const r = parseGstrCsvBuffer(Buffer.from(csv));
    assert.equal(r.records.length, 1);
    assert.equal(r.records[0].igst, 3600);
  });

  it("computes totalTax = IGST+CGST+SGST+Cess", () => {
    const csv = [
      "GSTIN of Supplier,Invoice Number,Invoice Date,Integrated Tax Amount,Central Tax Amount,State/UT Tax Amount,Cess Amount",
      "27AAAAA0000A1Z5,INV-001,01/04/2025,0,900,900,50",
    ].join("\n");
    const r = parseGstrCsvBuffer(Buffer.from(csv));
    assert.equal(r.records[0].totalTax, 1850);
  });

  it("reports skipped rows with reason", () => {
    const csv = [
      "GSTIN of Supplier,Invoice Number,Invoice Date,Integrated Tax Amount",
      "27AAAAA0000A1Z5,,10/04/2025,1800",
      "27BBBBB0000B1Z5,INV-002,BADDATE,900",
      "27CCCC00000C1Z5,INV-003,01/04/2025,500",
    ].join("\n");
    const r = parseGstrCsvBuffer(Buffer.from(csv));
    assert.equal(r.records.length, 1);
    assert.ok(r.errors.length >= 2);
  });

  it("returns empty result with sheet summary for empty file", () => {
    const r = parseGstrCsvBuffer(Buffer.from(""));
    assert.equal(r.records.length, 0);
    assert.ok(r.sheetSummary[0].reason.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Excel – B2B sheet
// ---------------------------------------------------------------------------

describe("parseGstrExcelBuffer - B2B", () => {
  it("parses GST portal B2B sheet with title rows", async () => {
    const buf = await buildExcelBuffer([
      {
        name: "B2B",
        rows: [
          B2B_TITLE,
          B2B_BLANK,
          B2B_HEADER,
          b2bRow("27AAAAA0000A1Z5", "Alpha", "INV-A01", "10/04/2025", 10000, 1800, 0, 0, 0),
          b2bRow("27BBBBB0000B1Z5", "Beta", "INV-B01", "15/04/2025", 5000, 0, 450, 450, 0),
        ],
      },
    ]);
    const r = await parseGstrExcelBuffer(buf);
    assert.equal(r.records.length, 2);
    assert.equal(r.records[0].igst, 1800);
    assert.equal(r.records[1].totalTax, 900);
    assert.equal(r.sheetSummary[0].headerDetected, true);
    assert.equal(r.sheetSummary[0].parsed, 2);
  });

  it("strips rupee symbol from column names", async () => {
    const buf = await buildExcelBuffer([
      {
        name: "B2B",
        rows: [
          ["GSTIN of Supplier", "Invoice Number", "Invoice Date", "Integrated Tax Amount(Rs)", "Central Tax Amount(Rs)", "State/UT Tax Amount(Rs)"],
          ["27CCCC00000C1Z5", "INV-C01", "01/05/2025", 0, 720, 720],
        ],
      },
    ]);
    const r = await parseGstrExcelBuffer(buf);
    assert.equal(r.records.length, 1);
    assert.equal(r.records[0].cgst, 720);
    assert.equal(r.records[0].totalTax, 1440);
  });

  it("marks ITC availability correctly", async () => {
    const buf = await buildExcelBuffer([
      {
        name: "B2B",
        rows: [
          ["GSTIN of Supplier", "Invoice Number", "Invoice Date", "Integrated Tax Amount", "ITC Availability"],
          ["27AAAAA0000A1Z5", "INV-D01", "01/04/2025", 1800, "Ineligible (Section 17(5))"],
          ["27BBBBB0000B1Z5", "INV-D02", "02/04/2025", 900, "Yes"],
        ],
      },
    ]);
    const r = await parseGstrExcelBuffer(buf);
    assert.equal(r.records[0].itcAvailable, "No");
    assert.equal(r.records[1].itcAvailable, "Yes");
  });

  it("reports non-detected header in sheetSummary", async () => {
    const buf = await buildExcelBuffer([
      {
        name: "B2B",
        rows: [["Random row"], ["Another row"], ["Still no header"]],
      },
    ]);
    const r = await parseGstrExcelBuffer(buf);
    assert.equal(r.records.length, 0);
    assert.equal(r.sheetSummary[0].headerDetected, false);
    assert.ok(r.sheetSummary[0].reason.length > 0);
  });
});

// ---------------------------------------------------------------------------
// Excel – multi-sheet (B2B + CDNR)
// ---------------------------------------------------------------------------

describe("parseGstrExcelBuffer - multi-sheet", () => {
  it("collects records from B2B and CDNR sheets", async () => {
    const cdnrHeader = [
      "GSTIN of Supplier",
      "Trade/Legal Name of the Supplier",
      "Note Number",
      "Note Date",
      "Note Type",
      "Integrated Tax Amount",
      "Central Tax Amount",
      "State/UT Tax Amount",
    ];
    const buf = await buildExcelBuffer([
      {
        name: "B2B",
        rows: [
          B2B_TITLE,
          B2B_BLANK,
          B2B_HEADER,
          b2bRow("27AAAAA0000A1Z5", "Alpha", "INV-001", "10/04/2025", 10000, 1800, 0, 0, 0),
        ],
      },
      {
        name: "CDNR",
        rows: [
          ["GSTR-2B Credit/Debit Notes"],
          cdnrHeader,
          ["27BBBBB0000B1Z5", "Beta", "CDN-001", "12/04/2025", "C", 0, 500, 500],
        ],
      },
    ]);
    const r = await parseGstrExcelBuffer(buf);
    assert.equal(r.records.length, 2);
    assert.equal(r.sheetSummary.length, 2);
    const cdn = r.records.find((x) => x.sheetName === "CDNR");
    assert.ok(cdn.invoiceType === "CDNR" || cdn.invoiceType === "C", "invoice type should be CDNR or C (credit note)");
    assert.equal(cdn.totalTax, 1000);
  });

  it("provides per-sheet summary with parsed + skipped counts", async () => {
    const buf = await buildExcelBuffer([
      {
        name: "B2B",
        rows: [
          B2B_HEADER,
          b2bRow("27AAAAA0000A1Z5", "S1", "INV-001", "01/04/2025", 5000, 900, 0, 0, 0),
          b2bRow("27BBBBB0000B1Z5", "S2", "INV-002", "02/04/2025", 3000, 540, 0, 0, 0),
          ["", "", "", "", ""],
        ],
      },
      {
        name: "CDNR",
        rows: [["Garbage row only"]],
      },
    ]);
    const r = await parseGstrExcelBuffer(buf);
    assert.equal(r.records.length, 2);
    const b2b = r.sheetSummary.find((s) => s.sheetName === "B2B");
    assert.equal(b2b.parsed, 2);
    assert.ok(b2b.skipped >= 1);
    const cdnr = r.sheetSummary.find((s) => s.sheetName === "CDNR");
    assert.equal(cdnr.headerDetected, false);
  });
});

// ---------------------------------------------------------------------------
// Excel – IMPG (imports, no supplier GSTIN)
// ---------------------------------------------------------------------------

describe("parseGstrExcelBuffer - IMPG", () => {
  it("parses IMPG rows and uses synthetic GSTIN", async () => {
    const buf = await buildExcelBuffer([
      {
        name: "IMPG",
        rows: [
          ["Bill of Entry Number", "Bill of Entry Date", "Port Code", "Taxable Value", "Integrated Tax Amount", "Cess Amount"],
          ["1234567", "10/04/2025", "INBOM4", 50000, 9000, 0],
        ],
      },
    ]);
    const r = await parseGstrExcelBuffer(buf);
    assert.equal(r.records.length, 1);
    assert.ok(r.records[0].supplierGstin.startsWith("IMPG-"));
    assert.equal(r.records[0].igst, 9000);
    assert.equal(r.records[0].invoiceType, "IMPG");
  });
});

// ---------------------------------------------------------------------------
// parseGstrFile dispatch
// ---------------------------------------------------------------------------

describe("parseGstrFile - file type dispatch", () => {
  it("handles .xlsx", async () => {
    const buf = await buildExcelBuffer([
      {
        name: "B2B",
        rows: [
          B2B_HEADER,
          b2bRow("27AAAAA0000A1Z5", "S1", "INV-001", "01/04/2025", 10000, 1800, 0, 0, 0),
        ],
      },
    ]);
    const r = await parseGstrFile(buf, "GSTR2B.xlsx");
    assert.equal(r.fileType, "xlsx");
    assert.equal(r.records.length, 1);
  });

  it("handles .csv", async () => {
    const csv = "GSTIN of Supplier,Invoice Number,Invoice Date,Integrated Tax Amount\n27AAAAA0000A1Z5,INV-001,01/04/2025,1800";
    const r = await parseGstrFile(Buffer.from(csv), "gstr2b.csv");
    assert.equal(r.fileType, "csv");
    assert.equal(r.records.length, 1);
  });

  it("returns error for unsupported format", async () => {
    const r = await parseGstrFile(Buffer.from("data"), "data.pdf");
    assert.equal(r.fileType, "unknown");
    assert.equal(r.records.length, 0);
    assert.ok(r.errors[0].reason.toLowerCase().includes("unsupported"));
  });
});

