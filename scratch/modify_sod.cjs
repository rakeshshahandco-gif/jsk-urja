const fs = require('fs');
const path = './src/features/sales/SalesOrderDetailPage.jsx';
let content = fs.readFileSync(path, 'utf8');

// Chunk 1
const t1 = `      {/* PRINT ONLY LAYOUT */}
      <div
        className="print-only"
        style={{ display: "none", width: "210mm", padding: 0 }}
      >
        <div
          className="print-content"
          style={{
            padding: "10mm",
            minHeight: "270mm",
            display: "flex",
            flexDirection: "column",
            background: "#fff",
            boxSizing: "border-box",
          }}
        >`;
const r1 = `      {/* PRINT ONLY LAYOUT */}
      <div className="print-only" style={{ display: "none", width: "210mm", padding: 0 }}>
        {(() => {
          const items = so.items || [];
          const itemsPerPageFirst = 7;
          const itemsPerPageOthers = 15;
          const pages = [];
          if (items.length <= itemsPerPageFirst) {
              pages.push(items);
          } else {
              pages.push(items.slice(0, itemsPerPageFirst));
              let remaining = items.slice(itemsPerPageFirst);
              while (remaining.length > 0) {
                  pages.push(remaining.slice(0, itemsPerPageOthers));
                  remaining = remaining.slice(itemsPerPageOthers);
              }
          }
          return pages.map((pageItems, pageIdx) => {
             const isFirstPage = pageIdx === 0;
             const isLastPage = pageIdx === pages.length - 1;
             const totalPages = pages.length;
             return (
               <div key={pageIdx} className="print-content" style={{ 
                 pageBreakAfter: isLastPage ? 'auto' : 'always', position: 'relative',
                 padding: "10mm", minHeight: "270mm", display: "flex", flexDirection: "column", background: "#fff", boxSizing: "border-box" 
               }}>
                 <div style={{ position: 'absolute', bottom: '5mm', right: '10mm', fontSize: '8pt', color: '#666' }}>
                     Page {pageIdx + 1} of {totalPages}
                 </div>
                 {isFirstPage ? (
                 <>`;

content = content.replace(t1, r1);

// Chunk 2
const t2 = `                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Items Table */}
          <table`;
const r2 = `                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          </>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #000', paddingBottom: '5px' }}>
                <div style={{ fontSize: '14pt', fontWeight: 900, textTransform: 'uppercase' }}>{company.companyName || "JSK URJA"}</div>
                <div style={{ textAlign: 'right', fontSize: '9pt' }}>
                    <strong>Order No:</strong> {so.soNumber} | <strong>Date:</strong> {fmt(so.soDate)}
                </div>
            </div>
          )}

          {/* Items Table */}
          <table`;
content = content.replace(t2, r2);

// Chunk 3
const t3 = `              </tr>
            </thead>
            <tbody>
              {(so.items || []).map((item, i) => (
                <tr key={i}>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "center",
                      verticalAlign: "top",
                    }}
                  >
                    {i + 1}
                  </td>`;
const r3 = `              </tr>
            </thead>
            <tbody>
              {pageItems.map((item, i) => {
                const srNo = (pageIdx === 0 ? 0 : itemsPerPageFirst + (pageIdx - 1) * itemsPerPageOthers) + i + 1;
                return (
                <tr key={i}>
                  <td
                    style={{
                      border: "1px solid #000",
                      padding: "6px",
                      textAlign: "center",
                      verticalAlign: "top",
                    }}
                  >
                    {srNo}
                  </td>`;
content = content.replace(t3, r3);

// Chunk 4
const t4 = `                  <td style={{ border: "1px solid #000", padding: "6px" }}></td>
                </tr>
              ))}
            </tbody>
            <tbody style={{ borderTop: "2px solid #000" }}>
              <tr style={{ background: "#f5f5f5" }}>`;
const r4 = `                  <td style={{ border: "1px solid #000", padding: "6px" }}></td>
                </tr>
                );
              })}
              {!isLastPage && (
                  <tr>
                      <td colSpan="9" style={{ border: '1px solid #000', padding: '8px', textAlign: 'right', fontStyle: 'italic', fontSize: '9pt', background: '#fafafa' }}>
                          Continued on next page...
                      </td>
                  </tr>
              )}
            </tbody>
            {isLastPage && (
            <tbody style={{ borderTop: "2px solid #000" }}>
              <tr style={{ background: "#f5f5f5" }}>`;
content = content.replace(t4, r4);

// Chunk 5
const t5 = `                </td>
              </tr>
            </tbody>
          </table>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginTop: "30px",
            }}
          >`;
const r5 = `                </td>
              </tr>
            </tbody>
            )}
          </table>

          {isLastPage && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              marginTop: "30px",
            }}
          >`;
content = content.replace(t5, r5);

// Chunk 6
const t6 = `              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Application Section (Screen Only) */}`;
const r6 = `              </div>
            </div>
          </div>
          )}
        </div>
             );
          });
        })()}
      </div>

      {/* Application Section (Screen Only) */}`;
content = content.replace(t6, r6);

fs.writeFileSync(path, content, 'utf8');
console.log('Done replacement.');
