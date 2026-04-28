import httpStatus from 'http-status';
import { asyncHandler } from '../utils/asyncHandler.js';
import fs from 'fs';

import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get all backend models
 */
const getModels = () => {
    const modelsPath = path.join(__dirname, '..', 'models');
    try {
        const files = fs.readdirSync(modelsPath);
        return files
            .filter(f => f.endsWith('.js'))
            .map(f => f.replace('.model.js', '').replace('.js', ''));
    } catch (e) {
        return [];
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

import Customer from '../models/customer.model.js';
import { Item } from '../models/item.model.js';
import { SalesOrder } from '../models/salesOrder.model.js';
import { SalesInvoice } from '../models/salesInvoice.model.js';
import { PurchaseOrder } from '../models/purchaseOrder.model.js';
import { Task } from '../models/task.model.js';
import { WeChatGroup } from '../models/weChatGroup.model.js';
import { StockLedger } from '../models/stockLedger.model.js';

export const getSystemDiscovery = asyncHandler(async (req, res) => {
    const models = getModels();
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
            const modelsToCount = [
                { key: 'Customer', model: 'Customer' },
                { key: 'Item', model: 'Item' },
                { key: 'SalesOrder', model: 'SalesOrder' },
                { key: 'SalesInvoice', model: 'SalesInvoice' },
                { key: 'PurchaseOrder', model: 'PurchaseOrder' },
                { key: 'Task', model: 'Task' },
                { key: 'ChinaSourcingGroup', model: 'WeChatGroup' },
                { key: 'StockLedger', model: 'StockLedger' },
                { key: 'User', model: 'User' },
                { key: 'AccountMaster', model: 'AccountMaster' }
            ];

            const countResults = await Promise.all(
                modelsToCount.map(async (m) => {
                    try {
                        const count = await mongoose.model(m.model).countDocuments();
                        return { key: m.key, count };
                    } catch (err) {
                        return { key: m.key, count: 0 };
                    }
                })
            );

            countResults.forEach(res => {
                dbCounts[res.key] = res.count;
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
                models,
                backendRoutes,
                totalModels: models.length,
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
