import express from 'express';
import {
  uploadDelivery,
  getDeliveryById,
  getDeliveryValidation,
  reprocessDelivery,
  listDeliveries,
  overrideDocumentClassification,
  getDocumentDiagnostics,
} from '../controllers/delivery.controller';
import { upload } from '../config/multer';

const router = express.Router();

/**
 * Delivery Routes
 *
 * These routes handle multi-document deliveries for customers like Super 8.
 */

/**
 * POST /api/v1/deliveries/upload
 * Upload multiple documents as a single delivery
 *
 * Body (multipart/form-data):
 * - files: Array of files (required)
 * - clientIdentifier: Customer identifier (e.g., "SUPER8") (optional)
 * - deliveryReference: Reference number for delivery (optional, auto-generated if not provided)
 */
router.post('/upload', upload.array('files', 20), uploadDelivery);

/**
 * GET /api/v1/deliveries/:deliveryId
 * Get delivery details by ID
 *
 * Params:
 * - deliveryId: Delivery document ID
 */
router.get('/:deliveryId', getDeliveryById);

/**
 * GET /api/v1/deliveries/:deliveryId/validation
 * Get delivery validation results
 *
 * Params:
 * - deliveryId: Delivery document ID
 *
 * Returns:
 * - Delivery-level validation result
 * - Individual document validation results
 * - Cross-document check results
 */
router.get('/:deliveryId/validation', getDeliveryValidation);

/**
 * POST /api/v1/deliveries/:deliveryId/reprocess
 * Reprocess a delivery (re-run validation)
 *
 * Params:
 * - deliveryId: Delivery document ID
 *
 * Body:
 * - clientIdentifier: New customer identifier (optional)
 */
router.post('/:deliveryId/reprocess', reprocessDelivery);

/**
 * GET /api/v1/deliveries
 * List deliveries with filters and pagination
 *
 * Query params:
 * - clientIdentifier: Filter by customer (optional)
 * - status: Filter by status (UPLOADED, PROCESSING, COMPLETED, FAILED) (optional)
 * - dateFrom: Filter by date range start (optional)
 * - dateTo: Filter by date range end (optional)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 */
router.get('/', listDeliveries);

/**
 * PATCH /api/v1/deliveries/:deliveryId/documents/:podId/classification
 * Manually override document classification
 *
 * Params:
 * - deliveryId: Delivery document ID
 * - podId: POD document ID
 *
 * Body:
 * - detectedType: The document type to set (required)
 * - reason: Reason for manual override (required)
 * - overrideBy: User/admin identifier (optional)
 */
router.patch('/:deliveryId/documents/:podId/classification', overrideDocumentClassification);

/**
 * GET /api/v1/deliveries/:deliveryId/documents/:podId/diagnostics
 * Get classification diagnostics for a document
 *
 * Params:
 * - deliveryId: Delivery document ID
 * - podId: POD document ID
 *
 * Returns:
 * - Classification details
 * - OCR quality metrics
 * - Extracted text preview
 * - Suggestions for improvement
 */
router.get('/:deliveryId/documents/:podId/diagnostics', getDocumentDiagnostics);

export default router;
