import { Router } from 'express';
import { upload } from '../config/multer';
import { validateUploadedFiles, requireFiles } from '../middleware/file-validator';
import {
  uploadPODs,
  getJobStatus,
  getPODById,
  reprocessPOD,
} from '../controllers/upload.controller';

const router = Router();

/**
 * Upload POD files
 * POST /api/v1/pods/upload
 */
router.post(
  '/upload',
  upload.array('files', 10), // Max 10 files
  requireFiles,
  validateUploadedFiles,
  uploadPODs
);

/**
 * Get job status
 * GET /api/v1/pods/:jobId/status
 */
router.get('/:jobId/status', getJobStatus);

/**
 * Get POD by ID
 * GET /api/v1/pods/:id
 */
router.get('/:id', getPODById);

/**
 * Reprocess POD
 * POST /api/v1/pods/:id/reprocess
 */
router.post('/:id/reprocess', reprocessPOD);

export default router;
