import express from 'express';
import * as rdSampleController from '../../controllers/rdSample.controller.js';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';

const router = express.Router();

router.use(protect);

// Projects
router.route('/projects')
    .get(checkPermission('rd_samples.projects.view'), rdSampleController.getProjects)
    .post(checkPermission('rd_samples.projects.manage'), rdSampleController.createProject);

router.route('/projects/:projectId')
    .get(checkPermission('rd_samples.projects.view'), rdSampleController.getProject)
    .patch(checkPermission('rd_samples.projects.manage'), rdSampleController.updateProject)
    .delete(checkPermission('rd_samples.projects.manage'), rdSampleController.deleteProject);

// Samples
router.route('/samples')
    .get(checkPermission('rd_samples.samples.view'), rdSampleController.getSamples)
    .post(checkPermission('rd_samples.samples.manage'), rdSampleController.createSample);

router.route('/samples/:sampleId')
    .get(checkPermission('rd_samples.samples.view'), rdSampleController.getSample)
    .patch(checkPermission('rd_samples.samples.manage'), rdSampleController.updateSample)
    .delete(checkPermission('rd_samples.samples.manage'), rdSampleController.deleteSample);

router.post('/samples/:sampleId/test', checkPermission('rd_samples.samples.test'), rdSampleController.addTestHistory);

router.get('/reports/comparison', checkPermission('rd_samples.samples.compare'), rdSampleController.getComparisonReport);

export default router;
