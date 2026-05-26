import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import fs from 'fs';

import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get all backend models and ensure they are loaded in Mongoose
 */
const getModelsAndLoad = async () => {
    const modelsPath = path.join(__dirname, '..', 'models');
    try {
        const files = fs.readdirSync(modelsPath).filter(f => f.endsWith('.model.js'));
        
        for (const file of files) {
            try {
                // Use file:// protocol for Windows compatibility with absolute paths in ESM
                const modelPath = path.join(modelsPath, file);
                const fileUrl = `file://${modelPath.replace(/\\/g, '/')}`;
                await import(fileUrl);
            } catch (e) {
                // Already loaded or other issue
            }
        }
        
        return mongoose.modelNames();
    } catch (e) {
        console.error('Model discovery failed', e);
        return mongoose.modelNames();
    }
};

/**
 * Discover routes by parsing the index file
 */
const discoverRoutes = () => {
    const indexPath = path.join(__dirname, '..', 'routes', 'v1', 'index.js');
    try {
        const content = fs.readFileSync(indexPath, 'utf8');
        const routes = [];
        
        // Regex to find { path: '/...', route: ... }
        const regex = /path:\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = regex.exec(content)) !== null) {
            routes.push(match[1]);
        }
        return [...new Set(routes)]; // Unique routes
    } catch (e) {
        return [];
    }
};

export const getSystemDiscovery = asyncHandler(async (req, res) => {
    const modelNames = await getModelsAndLoad();
    const backendRoutes = discoverRoutes();
    
    let pkg = {};
    try {
        const pkgContent = fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8');
        pkg = JSON.parse(pkgContent);
    } catch (e) {}

    // Check DB status
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    const dbName = mongoose.connection.name || 'Unknown';
    const environment = process.env.NODE_ENV === 'production' ? 'Production' : 'Local Development';
    
    let dbCounts = {};
    if (mongoose.connection.readyState === 1) {
        try {
            // Count all discovered models
            const countResults = await Promise.all(
                modelNames.map(async (name) => {
                    try {
                        const count = await mongoose.model(name).countDocuments();
                        return { key: name, count };
                    } catch (err) {
                        return { key: name, count: 0 };
                    }
                })
            );

            // Sort counts: put common ones first, then alphabetical
            const priority = [
                'Customer', 'Item', 'SalesOrder', 'SalesInvoice', 'PurchaseOrder', 'Task',
                'Distributor', 'WorkOrder', 'AccountLedger',
                'ApprovalRule', 'ApprovalRequest', 'SecuritySettings', 'LoginHistory',
                'AccountingPeriodLock', 'AuditLog',
            ];
            
            countResults.sort((a, b) => {
                const idxA = priority.indexOf(a.key);
                const idxB = priority.indexOf(b.key);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return a.key.localeCompare(b.key);
            });

            countResults.forEach(res => {
                // Rename for UI if needed
                let uiKey = res.key;
                if (uiKey === 'AccountLedger') uiKey = 'Account Master';
                if (uiKey === 'WeChatGroup') uiKey = 'China Sourcing Group';
                
                dbCounts[uiKey] = res.count;
            });
        } catch (e) {
            console.error('Failed to get DB counts', e);
        }
    }

    // Basic system info
    const systemInfo = {
        version: pkg.version || '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
        uptime: Math.floor(process.uptime()),
        memoryUsage: process.memoryUsage(),
        database: dbStatus,
        databaseName: dbName,
        databaseCounts: dbCounts,
        environment: environment,
        safetyStatus: dbStatus === 'Connected' ? 'Safe' : 'Critical'
    };

    res.json({
        success: true,
        data: {
            system: systemInfo,
            discovery: {
                models: modelNames,
                backendRoutes,
                totalModels: modelNames.length,
                totalRoutes: backendRoutes.length
            },
            status: 'Deployment Safe'
        }
    });
});

export const getHealth = asyncHandler(async (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});
