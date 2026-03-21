import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function verifyImport() {
    const filePath = path.join(__dirname, 'sample_bom_import.xlsx');
    if (!fs.existsSync(filePath)) {
        console.error('Test file not found!');
        return;
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));

    try {
        // First login to get token
        const loginRes = await axios.post('http://localhost:5000/api/v1/auth/login', {
            username: 'admin',
            password: 'admin123'
        });
        
        const token = loginRes.data.data.token;
        console.log('Login successful, token obtained.');

        const response = await axios.post('http://localhost:5000/api/v1/boms/import/excel', form, {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Import API Response:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('Import failed:', error.response?.data || error.message);
    }
}

verifyImport().catch(console.error);
