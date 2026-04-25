export const generateSalesOrderHTML = (so, company) => {
  const isIGST = so.gstType === 'IGST';
  const gstApplicable = so.gstApplicable !== false;
  
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
  
  let itemsHtml = so.items.map((item, idx) => `
    <tr>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; padding: 6px;">
        <strong>${item.itemCode || ''}</strong><br/>
        <span style="font-size: 10px;">${item.itemName || ''}</span>
        ${item.additionalNotes ? `<br/><span style="font-size: 9px; font-style: italic;">Note: ${item.additionalNotes}</span>` : ''}
      </td>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${item.hsnCode || ''}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${item.qty} ${item.uom || 'NOS'}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(item.rate).toFixed(2)}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(item.discountAmount || 0).toFixed(2)}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(item.lineTaxable).toFixed(2)}</td>
      ${gstApplicable ? `
        <td style="border: 1px solid #000; padding: 6px; text-align: right;">${item.gstRate}%<br/>${Number(item.lineGst).toFixed(2)}</td>
      ` : ''}
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(item.total).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #000; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .company-details { flex: 1; }
          .title-details { text-align: right; }
          h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
          h2 { margin: 0; font-size: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          th { background: #f0f0f0; border: 1px solid #000; padding: 8px; font-weight: bold; }
          .summary-table { width: 300px; float: right; border: 1px solid #000; }
          .summary-table td { border: 1px solid #000; padding: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-details">
            <h2>${company.companyName || 'JSK URJA'}</h2>
            <p style="margin: 4px 0; font-size: 12px; max-width: 300px;">
              ${company.address || ''}<br/>
              ${company.city || ''} ${company.state || ''} - ${company.pincode || ''}<br/>
              ${gstApplicable ? `<strong>GSTIN: ${company.gstNumber || ''}</strong>` : ''}
            </p>
          </div>
          <div class="title-details">
            <h1>SALES ORDER</h1>
            <p style="font-size: 16px; font-weight: bold; margin: 4px 0;">${so.soNumber}</p>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 20px;">
          <div style="width: 50%;">
            <table style="border: none;">
              <tr><td style="font-weight: bold; width: 120px;">Customer Name:</td><td>${so.customerName}</td></tr>
              <tr><td style="font-weight: bold;">Address:</td><td>${so.billingAddress || so.shippingAddress || '—'}</td></tr>
              <tr><td style="font-weight: bold;">State:</td><td>${so.customerState || ''} ${so.customerStateCode ? `(${so.customerStateCode})` : ''}</td></tr>
              <tr><td style="font-weight: bold;">Contact No:</td><td>${so.customerPhone || '—'}</td></tr>
              ${gstApplicable ? `<tr><td style="font-weight: bold;">GST No:</td><td>${so.customerGstin || '—'}</td></tr>` : ''}
            </table>
          </div>
          <div style="width: 40%;">
            <table style="border: none;">
              <tr><td style="font-weight: bold; width: 120px;">Date:</td><td>${formatDate(so.soDate)}</td></tr>
              <tr><td style="font-weight: bold;">Delivery Date:</td><td>${formatDate(so.deliveryDate)}</td></tr>
              <tr><td style="font-weight: bold;">Customer PO:</td><td>${so.customerPO || 'VERBAL'}</td></tr>
              <tr><td style="font-weight: bold;">PO Date:</td><td>${formatDate(so.customerPODate || so.soDate)}</td></tr>
              <tr><td style="font-weight: bold;">Order Category:</td><td>${so.orderCategory || 'Regular'}</td></tr>
            </table>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 5%;">SR</th>
              <th style="width: 35%; text-align: left;">Product Description</th>
              <th style="width: 10%;">HSN</th>
              <th style="width: 10%; text-align: right;">Qty</th>
              <th style="width: 10%; text-align: right;">Rate</th>
              <th style="width: 10%; text-align: right;">Discount</th>
              <th style="width: 10%; text-align: right;">Taxable</th>
              ${gstApplicable ? `<th style="width: 10%; text-align: right;">GST</th>` : ''}
              <th style="width: 10%; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <table class="summary-table">
          <tr><td><strong>Sub Total:</strong></td><td style="text-align: right;">₹${Number(so.subTotal).toFixed(2)}</td></tr>
          ${gstApplicable ? `
            ${isIGST ? `
              <tr><td><strong>IGST:</strong></td><td style="text-align: right;">₹${Number(so.totalGst).toFixed(2)}</td></tr>
            ` : `
              <tr><td><strong>CGST:</strong></td><td style="text-align: right;">₹${(Number(so.totalGst)/2).toFixed(2)}</td></tr>
              <tr><td><strong>SGST:</strong></td><td style="text-align: right;">₹${(Number(so.totalGst)/2).toFixed(2)}</td></tr>
            `}
          ` : ''}
          <tr><td><strong>Freight:</strong></td><td style="text-align: right;">₹${Number(so.freightAmount || 0).toFixed(2)}</td></tr>
          <tr><td style="font-size: 16px;"><strong>Grand Total:</strong></td><td style="font-size: 16px; font-weight: bold; text-align: right;">₹${Number(so.grandTotal).toLocaleString('en-IN')}</td></tr>
        </table>
        
        <div style="clear: both;"></div>

        ${so.remarks ? `
          <div style="margin-top: 30px; font-size: 12px;">
            <strong>Remarks:</strong><br/>
            ${so.remarks}
          </div>
        ` : ''}

      </body>
    </html>
  `;
};

export const generateSalesInvoiceHTML = (inv, company) => {
  // Almost identical to Sales Order but with Invoice headers and additional fields
  const isIGST = inv.gstType === 'IGST';
  const gstApplicable = inv.gstApplicable !== false;
  
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—';
  
  let itemsHtml = inv.items.map((item, idx) => `
    <tr>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${idx + 1}</td>
      <td style="border: 1px solid #000; padding: 6px;">
        <strong>${item.itemCode || ''}</strong><br/>
        <span style="font-size: 10px;">${item.itemName || ''}</span>
      </td>
      <td style="border: 1px solid #000; padding: 6px; text-align: center;">${item.hsnCode || ''}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${item.qty} ${item.uom || 'NOS'}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(item.rate).toFixed(2)}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(item.discountAmount || 0).toFixed(2)}</td>
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(item.taxableAmount || item.lineTaxable).toFixed(2)}</td>
      ${gstApplicable ? `
        <td style="border: 1px solid #000; padding: 6px; text-align: right;">${item.gstRate}%<br/>${Number(item.totalAmount - item.taxableAmount).toFixed(2)}</td>
      ` : ''}
      <td style="border: 1px solid #000; padding: 6px; text-align: right;">${Number(item.totalAmount || item.total).toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
        <style>
          body { font-family: 'Helvetica', 'Arial', sans-serif; padding: 20px; color: #000; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #000; padding-bottom: 10px; }
          .company-details { flex: 1; }
          .title-details { text-align: right; }
          h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
          h2 { margin: 0; font-size: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
          th { background: #f0f0f0; border: 1px solid #000; padding: 8px; font-weight: bold; }
          .summary-table { width: 300px; float: right; border: 1px solid #000; }
          .summary-table td { border: 1px solid #000; padding: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-details">
            <h2>${company.companyName || 'JSK URJA'}</h2>
            <p style="margin: 4px 0; font-size: 12px; max-width: 300px;">
              ${company.address || ''}<br/>
              ${company.city || ''} ${company.state || ''} - ${company.pincode || ''}<br/>
              ${gstApplicable ? `<strong>GSTIN: ${company.gstNumber || ''}</strong>` : ''}
            </p>
          </div>
          <div class="title-details">
            <h1>TAX INVOICE</h1>
            <p style="font-size: 16px; font-weight: bold; margin: 4px 0;">${inv.invoiceNumber}</p>
            <p style="font-size: 12px; margin: 0;">Date: ${formatDate(inv.invoiceDate)}</p>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 20px;">
          <div style="width: 50%;">
            <table style="border: none;">
              <tr><td style="font-weight: bold; width: 120px;">Customer Name:</td><td>${inv.customerName}</td></tr>
              <tr><td style="font-weight: bold;">Address:</td><td>${inv.billingAddress || inv.shippingAddress || '—'}</td></tr>
              <tr><td style="font-weight: bold;">State:</td><td>${inv.customerState || ''} ${inv.customerStateCode ? `(${inv.customerStateCode})` : ''}</td></tr>
              ${gstApplicable ? `<tr><td style="font-weight: bold;">GST No:</td><td>${inv.customerGstin || '—'}</td></tr>` : ''}
            </table>
          </div>
          <div style="width: 40%;">
            <table style="border: none;">
              <tr><td style="font-weight: bold; width: 120px;">Vehicle No:</td><td>${inv.vehicleNo || '—'}</td></tr>
              <tr><td style="font-weight: bold;">Customer PO:</td><td>${inv.customerPO || '—'}</td></tr>
            </table>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 5%;">SR</th>
              <th style="width: 35%; text-align: left;">Description of Goods</th>
              <th style="width: 10%;">HSN</th>
              <th style="width: 10%; text-align: right;">Qty</th>
              <th style="width: 10%; text-align: right;">Rate</th>
              <th style="width: 10%; text-align: right;">Discount</th>
              <th style="width: 10%; text-align: right;">Taxable</th>
              ${gstApplicable ? `<th style="width: 10%; text-align: right;">GST</th>` : ''}
              <th style="width: 10%; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <table class="summary-table">
          <tr><td><strong>Sub Total:</strong></td><td style="text-align: right;">₹${Number(inv.subTotal).toFixed(2)}</td></tr>
          ${gstApplicable ? `
            ${isIGST ? `
              <tr><td><strong>IGST:</strong></td><td style="text-align: right;">₹${Number(inv.totalGst).toFixed(2)}</td></tr>
            ` : `
              <tr><td><strong>CGST:</strong></td><td style="text-align: right;">₹${(Number(inv.totalGst)/2).toFixed(2)}</td></tr>
              <tr><td><strong>SGST:</strong></td><td style="text-align: right;">₹${(Number(inv.totalGst)/2).toFixed(2)}</td></tr>
            `}
          ` : ''}
          <tr><td><strong>Freight:</strong></td><td style="text-align: right;">₹${Number(inv.freightAmount || 0).toFixed(2)}</td></tr>
          <tr><td style="font-size: 16px;"><strong>Grand Total:</strong></td><td style="font-size: 16px; font-weight: bold; text-align: right;">₹${Number(inv.roundedTotal || inv.grandTotal).toLocaleString('en-IN')}</td></tr>
        </table>
        
        <div style="clear: both;"></div>
        
        <div style="margin-top: 40px; font-size: 12px; display: flex; justify-content: space-between;">
           <div>
             <strong>Terms & Conditions:</strong><br/>
             1. Goods once sold will not be taken back.<br/>
             2. Subject to local jurisdiction.
           </div>
           <div style="text-align: right; margin-top: 20px;">
             <strong>For ${company.companyName || 'JSK URJA'}</strong><br/><br/><br/>
             Authorized Signatory
           </div>
        </div>

      </body>
    </html>
  `;
};
