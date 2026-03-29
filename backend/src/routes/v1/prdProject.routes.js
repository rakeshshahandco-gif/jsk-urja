import express from 'express';
import { protect } from '../../middlewares/auth.middleware.js';
import { requirePrdRole, requirePrdDeletePermission } from '../../middlewares/prdAuth.middleware.js';
import { prdUpload } from '../../middlewares/prdUpload.middleware.js';
import * as prdProjectController from '../../controllers/prdProject.controller.js';

const router = express.Router();

router.use(protect);

router
    .route('/')
    .get(
        requirePrdRole('rd_manager', 'hardware_dev', 'firmware_dev', 'testing_eng', 'qa_head', 'production', 'management_viewer'),
        prdProjectController.getProjects
    )
    .post(
        requirePrdRole('rd_manager'), // Typically only Manager or Admin creates new projects
        prdUpload.array('attachments', 5),
        prdProjectController.createProject
    );

router
    .route('/:id')
    .get(
        requirePrdRole('rd_manager', 'hardware_dev', 'firmware_dev', 'testing_eng', 'qa_head', 'production', 'management_viewer'),
        prdProjectController.getProjectById
    )
    .put(
        requirePrdRole('rd_manager', 'hardware_dev', 'firmware_dev'),
        prdUpload.array('attachments', 5),
        prdProjectController.updateProject
    )
    .delete(
        requirePrdDeletePermission,
        prdProjectController.deleteProject
    );

export default router;
