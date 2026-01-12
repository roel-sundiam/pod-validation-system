import { Router } from 'express';
import { listPODs, getStatistics, downloadFile } from '../controllers/results.controller';

const router = Router();

/**
 * List PODs with filtering and pagination
 * GET /api/v1/pods
 */
router.get('/', listPODs);

/**
 * Download original file
 * GET /api/v1/pods/:id/file
 */
router.get('/:id/file', downloadFile);

export default router;
