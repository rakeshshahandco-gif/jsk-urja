import express from 'express';
import * as locationController from '../../controllers/assetLocation.controller.js';
import { protect } from '../../middlewares/auth.middleware.js';

const router = express.Router();
router.use(protect);

router.route('/')
    .get(locationController.getLocations)
    .post(locationController.createLocation);

router.route('/:id')
    .put(locationController.updateLocation)
    .delete(locationController.deleteLocation);

export default router;
