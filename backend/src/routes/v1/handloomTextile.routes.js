/**
 * Handloom / Textile-only API route registrations.
 * Loaded dynamically only when isHandloomRuntimeEnabled() is true,
 * so JSK startups do not import Textile Mongoose models.
 */
import textileProductionLotRoute from './textileProductionLot.routes.js';
import textileJobWorkRateRoute from './textileJobWorkRate.routes.js';
import textileConversionRoute from './textileConversion.routes.js';
import textileDyeingChallanRoute from './textileDyeingChallan.routes.js';
import textileJobWorkChallanRoute from './textileJobWorkChallan.routes.js';
import textileProcessRoute from './textileProcessRoute.routes.js';
import textileProductionOrderRoute from './textileProductionOrder.routes.js';
import textileProcessOutputRoute from './textileProcessOutput.routes.js';

const handloomTextileRoutes = [
    {
        path: '/textile-production-lots',
        route: textileProductionLotRoute,
    },
    {
        path: '/textile-job-work-rates',
        route: textileJobWorkRateRoute,
    },
    {
        path: '/textile-conversions',
        route: textileConversionRoute,
    },
    {
        path: '/textile-dyeing-challans',
        route: textileDyeingChallanRoute,
    },
    {
        path: '/textile-job-work-challans/:processType',
        route: textileJobWorkChallanRoute,
    },
    {
        path: '/textile-process-routes',
        route: textileProcessRoute,
    },
    {
        path: '/textile-production-orders',
        route: textileProductionOrderRoute,
    },
    {
        path: '/textile-process-output',
        route: textileProcessOutputRoute,
    },
];

export default handloomTextileRoutes;
