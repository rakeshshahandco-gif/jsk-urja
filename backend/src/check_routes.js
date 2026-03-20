import { app } from './app.js';
import listEndpoints from 'express-list-endpoints';

console.log('--- REGISTERED ROUTES ---');
const endpoints = listEndpoints(app);
endpoints.forEach(route => {
    console.log(`${route.methods.join(',')} ${route.path}`);
});
process.exit();
