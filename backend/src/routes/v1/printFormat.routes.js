import express from 'express';
import { protect, checkPermission } from '../../middlewares/auth.middleware.js';
import {
    listPrintFormats,
    getPrintFormat,
    getOriginalTemplate,
    pullOriginalFormat,
    pullBlankFormat,
    copyPrintFormat,
    importPrintFormat,
    updatePrintFormat,
    savePrintFormatDraft,
    approvePrintFormat,
    setDefaultPrintFormat,
    deletePrintFormat,
    previewPrintFormat,
    getActivePrintFormat,
    suggestSampleDocRef,
    listSampleDocumentRefs,
    getPrintDesignerSettingsHandler,
    updatePrintDesignerSettingsHandler,
} from '../../controllers/printFormat.controller.js';

const router = express.Router();
const canUseDesigner = checkPermission('admin.print_format_designer.view');

router.use(protect);

// Live print consumers (Sales Order etc.) — any authenticated user
router.get('/active', getActivePrintFormat);

// Designer APIs — require Print Format Designer permission (staff can be granted this alone)
router.get('/designer-settings', canUseDesigner, getPrintDesignerSettingsHandler);
router.patch('/designer-settings', canUseDesigner, updatePrintDesignerSettingsHandler);
router.get('/', canUseDesigner, listPrintFormats);
router.get('/original-template', canUseDesigner, getOriginalTemplate);
router.get('/sample-suggestion', canUseDesigner, suggestSampleDocRef);
router.get('/sample-documents', canUseDesigner, listSampleDocumentRefs);
router.get('/:id', canUseDesigner, getPrintFormat);
router.post('/pull-original', canUseDesigner, pullOriginalFormat);
router.post('/pull-blank', canUseDesigner, pullBlankFormat);
router.post('/copy', canUseDesigner, copyPrintFormat);
router.post('/import', canUseDesigner, importPrintFormat);
router.put('/:id', canUseDesigner, updatePrintFormat);
router.patch('/:id/draft', canUseDesigner, savePrintFormatDraft);
router.patch('/:id/approve', canUseDesigner, approvePrintFormat);
router.patch('/:id/set-default', canUseDesigner, setDefaultPrintFormat);
router.post('/:id/preview', canUseDesigner, previewPrintFormat);
router.delete('/:id', canUseDesigner, deletePrintFormat);

export default router;
