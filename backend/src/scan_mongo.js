import { MongoClient } from 'mongodb';

async function quickScan() {
    const ports = [27017, 27018, 27019];
    for (const port of ports) {
        const url = `mongodb://localhost:${port}`;
        console.log(`Scanning ${url}...`);
        const client = new MongoClient(url, { connectTimeoutMS: 2000 });
        try {
            await client.connect();
            console.log(`Connected to port ${port}`);
            const dbs = await client.db().admin().listDatabases();
            console.log('Databases:', dbs.databases.map(d => d.name));
            await client.close();
        } catch (err) {
            console.log(`Port ${port} failed: ${err.message}`);
        }
    }
}

quickScan();
