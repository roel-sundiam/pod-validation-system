import { Request, Response } from 'express';
import { PODModel } from '../models/pod.model';
import { AppError, asyncHandler } from '../middleware/error-handler';
import { logger } from '../middleware/logger';
import { PODListResponse, StatisticsResponse } from '../../../shared/types/pod-schema';

/**
 * Get list of PODs with filtering and pagination
 * GET /api/v1/pods
 */
export const listPODs = asyncHandler(async (req: Request, res: Response) => {
  const {
    status,
    clientIdentifier,
    dateFrom,
    dateTo,
    page = '1',
    limit = '20',
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  // Build filter query
  const filter: any = {};

  if (status) {
    filter['validationResult.status'] = status;
  }

  if (clientIdentifier) {
    filter.clientIdentifier = clientIdentifier;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {
      filter.createdAt.$gte = new Date(dateFrom as string);
    }
    if (dateTo) {
      filter.createdAt.$lte = new Date(dateTo as string);
    }
  }

  // Pagination
  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  // Sort
  const sort: any = {};
  sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

  logger.info('Listing PODs', { filter, page: pageNum, limit: limitNum, sort });

  // Execute query
  const [pods, totalItems] = await Promise.all([
    PODModel.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limitNum)
      .select('-extractedData.rawText') // Exclude large raw text from list
      .lean(),
    PODModel.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalItems / limitNum);

  const response: PODListResponse = {
    success: true,
    data: {
      pods: pods as any,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems,
        itemsPerPage: limitNum,
      },
    },
  };

  res.status(200).json(response);
});

/**
 * Get statistics summary
 * GET /api/v1/statistics/summary
 */
export const getStatistics = asyncHandler(async (req: Request, res: Response) => {
  const { dateFrom, dateTo, clientIdentifier } = req.query;

  // Build filter query
  const filter: any = { status: 'COMPLETED' };

  if (clientIdentifier) {
    filter.clientIdentifier = clientIdentifier;
  }

  if (dateFrom || dateTo) {
    filter.createdAt = {};
    if (dateFrom) {
      filter.createdAt.$gte = new Date(dateFrom as string);
    }
    if (dateTo) {
      filter.createdAt.$lte = new Date(dateTo as string);
    }
  }

  logger.info('Getting statistics', { filter });

  // Get all completed PODs
  const pods = await PODModel.find(filter).select('validationResult processingMetadata').lean();

  // Calculate statistics
  const totalProcessed = pods.length;
  const statusBreakdown = {
    pass: pods.filter(p => p.validationResult.status === 'PASS').length,
    fail: pods.filter(p => p.validationResult.status === 'FAIL').length,
    review: pods.filter(p => p.validationResult.status === 'REVIEW').length,
  };

  // Count peculiarities
  const peculiarityCount: Record<string, number> = {};
  pods.forEach(pod => {
    pod.validationResult.peculiarities.forEach(p => {
      peculiarityCount[p.type] = (peculiarityCount[p.type] || 0) + 1;
    });
  });

  const commonPeculiarities = Object.entries(peculiarityCount)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5

  // Calculate average processing time
  const avgProcessingTime =
    pods.reduce((sum, p) => sum + (p.processingMetadata.processingTimeMs || 0), 0) / totalProcessed || 0;

  const response: StatisticsResponse = {
    success: true,
    data: {
      totalProcessed,
      statusBreakdown,
      commonPeculiarities,
      averageProcessingTime: Math.round(avgProcessingTime),
    },
  };

  res.status(200).json(response);
});

/**
 * Download original file
 * GET /api/v1/pods/:id/file
 */
export const downloadFile = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const pod = await PODModel.findById(id);

  if (!pod) {
    throw new AppError('POD not found', 404, 'POD_NOT_FOUND');
  }

  const { storagePath, originalName, mimeType } = pod.fileMetadata;

  logger.info('Downloading file', { podId: id, fileName: originalName });

  // Send file
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
  res.sendFile(storagePath);
});
