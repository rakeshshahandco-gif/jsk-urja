import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from './src/models/customer.model.js';
import { Item } from './src/models/item.model.js';
import { CompanyProfile } from './src/models/companyProfile.model.js';
import { InvoiceSeries } from './src/models/invoiceSeries.model.js';

dotenv.config();

const runMigration = async () => {
    try {
        console.log("Connecting to DB...");
        await mongoose.connect(process.env.MONGODB_URL);
        console.log("Connected seamlessly.");

        // 1. UPDATE COMPANY PROFILE
        console.log("Migrating Company Profile...");
        await CompanyProfile.updateMany(
            {},
            {
                $set: {
                    aatoBracket: 'Up to 5Cr',
                    gstFilingFrequency: 'Monthly',
                }
            }
        );

        // 2. UPDATE CUSTOMERS
        console.log("Migrating Customers...");
        const customers = await Customer.find({});
        for (const cust of customers) {
            let updates = {};
            
            // Set Legal Name = Company Name
            if (!cust.legalName) {
                updates.legalName = cust.company || cust.customerName || '';
            }
            if (!cust.tradeName) {
                updates.tradeName = cust.company || cust.customerName || '';
            }

            // Extract numeric state code
            if (cust.gstNumber && cust.gstNumber.length >= 2) {
                updates.billingStateCode = cust.gstNumber.substring(0, 2);
                updates.customerActivityType = 'B2B';
                
                // Safety fix for old weird data
                if(!cust.gstRegistrationType || cust.gstRegistrationType === 'Unregistered'){
                    updates.gstRegistrationType = 'Registered';
                }
            } else {
                updates.customerActivityType = 'B2C';
                if(!cust.billingStateCode && cust.state) {
                    const st = cust.state.toLowerCase();
                    if(st.includes('maharashtra')) updates.billingStateCode = '27';
                    else if(st.includes('gujarat')) updates.billingStateCode = '24';
                    else if(st.includes('delhi')) updates.billingStateCode = '07';
                    // Fallback to empty if unknown
                }
            }

            if (Object.keys(updates).length > 0) {
                await Customer.findByIdAndUpdate(cust._id, { $set: updates }, { strict: false });
            }
        }

        // 3. UPDATE ITEMS
        console.log("Migrating Items...");
        const items = await Item.find({});
        for (const item of items) {
            let updates = {};
            if (!item.goodsOrService) {
                updates.goodsOrService = item.isServiceItem ? 'Service' : 'Goods';
            }
            if (!item.uqc && item.uom) {
                const map = {
                    'NOS': 'NOS-NUMBERS',
                    'PCS': 'PCS-PIECES',
                    'METER': 'MTR-METERS',
                    'KG': 'KGS-KILOGRAMS',
                    'BOX': 'BOX-BOXES',
                    'ROLL': 'ROL-ROLLS',
                    'SET': 'SET-SETS',
                    'LITRE': 'LTR-LITRES'
                };
                updates.uqc = map[item.uom] || item.uom;
            }
            if (Object.keys(updates).length > 0) {
                await Item.findByIdAndUpdate(item._id, { $set: updates }, { strict: false });
            }
        }
        
        // 4. INVOICE SERIES
        console.log("Migrating Document Series...");
        const series = await InvoiceSeries.find({});
        let tiSeriesId = null;
        let cnSeriesId = null;

        for (const s of series) {
            let updates = {};
            if(!s.documentType) {
                if(s.seriesName.toLowerCase().includes('credit')) {
                    updates.documentType = 'Credit Note';
                    cnSeriesId = s._id;
                } else if(s.seriesName.toLowerCase().includes('est')) {
                    updates.documentType = 'Estimate';
                } else if(s.seriesName.toLowerCase().includes('dc')) {
                    updates.documentType = 'Delivery Challan';
                } else {
                    updates.documentType = 'Tax Invoice';
                    tiSeriesId = s._id;
                }
            } else {
                 if(s.documentType === 'Tax Invoice') tiSeriesId = s._id;
                 if(s.documentType === 'Credit Note') cnSeriesId = s._id;
            }
            if (Object.keys(updates).length > 0) {
                await InvoiceSeries.findByIdAndUpdate(s._id, { $set: updates }, { strict: false });
            }
        }
        
        // Link default series to company profile
        if(tiSeriesId || cnSeriesId) {
            await CompanyProfile.updateMany({}, {
                $set: {
                    "defaultDocumentSeries.taxInvoice": tiSeriesId,
                    "defaultDocumentSeries.creditNote": cnSeriesId
                }
            });
        }

        console.log("Migration Complete! Exiting gracefully.");
        process.exit(0);

    } catch (e) {
        console.error("Migration Failed", e);
        process.exit(1);
    }
};

runMigration();
