import { MongoClient } from 'mongodb';

async function listDbs() {
    const url = 'mongodb://localhost:27017';
    const client = new MongoClient(url);
    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const dbs = await client.db().admin().listDatabases();
        console.log('Databases:', dbs.databases.map(d => d.name));
        
        for (const dbInfo of dbs.databases) {
            const dbName = dbInfo.name;
            if (dbName === 'admin' || dbName === 'local' || dbName === 'config') continue;
            
            const db = client.db(dbName);
            const collections = await db.listCollections().toArray();
            if (collections.some(c => c.name === 'salesinvoices')) {
                console.log(`Checking DB: ${dbName}`);
                const inv = await db.collection('salesinvoices').findOne({ 
                    $or: [
                        { invoiceNumber: '26-27/01' },
                        { displayInvoiceNumber: '26-27/01' }
                    ]
                });
                if (inv) {
                    console.log(`FOUND INVOICE in ${dbName}:`);
                    console.log(JSON.stringify(inv, null, 2));
                    break;
                }
            }
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await client.close();
    }
}

listDbs();
