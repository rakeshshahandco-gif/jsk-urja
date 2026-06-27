# Textile Job Work - Production Process Guide (Handloom / Textile Only)

Saved reference for Issue Challan, Return Entry, and Stock flow.
Scope: Handloom / Textile companies only. Not for JSK URJA / Electronics.

## 1. Menu and URLs

| Step | Menu | URL |
|------|------|-----|
| Hub | Production > Textile Job Work | /production/textile-job-work |
| Issue | Issue Challan | /production/textile-job-work/issue |
| Return | Return Entry | /production/textile-job-work/return |
| Stock | Stock With Job Worker | /production/textile-job-work/stock |
| Reports | Job Work Reports | /production/textile-job-work/reports |
| Rate Master | Job Work Rate Master | /production/textile-job-work-rates |

Process Type dropdown: Dyeing, Printing, Embroidery, Washing, Pressing, Finishing, Stitching, Packing, Other.

## 2. Setup before first challan

1. Select Handloom / Textile company (top bar)
2. Job Work Rate Master: Process = Dyeing (match Issue), Vendor name, Rate, Active = Yes
3. Item Master: input items with stock

## 3. Issue Challan fields

- Input Qty + Input UOM = what you SEND (e.g. 200 Meter)
- Meter Per PCS on SAME line = Expected PCS (200 / 8 = 25 PCS)
- Expected Return Plan block shows per lot/colour
- Dyer Name from Rate Master dropdown

## 4. Return Entry

- Return Qty + UOM (PCS or Meter) - NOT on Issue screen
- Load by QR scan or pending challan list

## 5. Stock flow

Issue: Available -> Stock With Job Worker
Return: Job Worker -> Processed stock

## 6. Quick steps

1. Rate Master -> add dyer for Dyeing
2. Issue Challan -> pick dyer, fill lines, save
3. Return Entry -> enter actual PCS returned
4. Stock With Job Worker -> check pending

## 7. Troubleshooting

- Dyer dropdown empty: add Job Work Rate Master row, same process, Active, correct company
- Expected PCS zero: Input Qty and Meter Per PCS on same line
- Insufficient stock: reduce qty or add item stock

Local: backend :5000, frontend :4000, DB jskurja-dev (dev only).