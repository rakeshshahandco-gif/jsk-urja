import express from 'express';
const router = express.Router();
router.get('/', (req, res) => {
    res.send({
        message: 'CONNECTIVITY_OK',
        timestamp: new Date().toISOString(),
        directory: 'c:\\Users\\Admin\\Desktop\\Project\\backend'
    });
});
export default router;
