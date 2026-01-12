import { Router } from 'express';
import { getStatistics } from '../controllers/results.controller';

const router = Router();

/**
 * Get statistics summary
 * GET /api/v1/statistics/summary
 */
router.get('/summary', getStatistics);

export default router;
