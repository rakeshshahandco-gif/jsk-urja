import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dirs = [
    'src/controllers',
    'src/routes/v1',
    'src/models'
];

dirs.forEach(dir => {
    const fullDir = path.join(__dirname, dir);
    const files = fs.readdirSync(fullDir).filter(f => f.startsWith('prd') && f.endsWith('.js') && f !== 'prdAuth.middleware.js');

    files.forEach(file => {
        const fullPath = path.join(fullDir, file);
        let content = fs.readFileSync(fullPath, 'utf8');

        // Mongoose Models
        if (dir.includes('models')) {
            content = content.replace(/const\s+mongoose\s*=\s*require\('mongoose'\);/g, "import mongoose from 'mongoose';");
            content = content.replace(/module\.exports\s*=\s*mongoose\.model\(([^)]+)\);/g, "export const Model = mongoose.model($1);\nexport default Model;");
            content = content.replace(/module\.exports\s*=\s*([a-zA-Z0-9_]+);/g, "export const $1Exp = $1;\nexport default $1;");
            content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*mongoose\.model\(/g, "export const $1 = mongoose.model(");
        }

        // Controllers
        if (dir.includes('controllers')) {
            content = content.replace(/const\s+([a-zA-Z0-9_]+)\s*=\s*require\('([^']+)'\);/g, "import { $1 } from '$2.js';"); // Models import
            content = content.replace(/import\s+\{\s*([a-zA-Z0-9_]+)\s*\}\s+from\s+'\.\.\/models\//g, "import $1 from '../models/");
            content = content.replace(/exports\.([a-zA-Z0-9_]+)\s*=\s*/g, "export const $1 = ");
            content = content.replace(/const\s+\{\s*([a-zA-Z0-9_]+)\s*\}\s*=\s*require\('([^']+)'\);/g, "import { $1 } from '$2.js';");
        }

        // Routes
        if (dir.includes('routes')) {
            content = content.replace(/const\s+([a-zA-Z0-9_{}\s,]+)\s*=\s*require\('([^']+)'\);/g, (match, p1, p2) => {
                if (p1.includes('{')) {
                    return `import ${p1} from '${p2}.js';`;
                } else if (p2 === 'express') {
                    return `import express from 'express';`;
                } else {
                    return `import * as ${p1} from '${p2}.js';`;
                }
            });
            content = content.replace(/module\.exports\s*=\s*router;/g, "export default router;");
        }

        fs.writeFileSync(fullPath, content, 'utf8');
    });
});

console.log('Conversion completed.');
