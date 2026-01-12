import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { PODModel } from '../models/pod.model';
import { createAuditLog } from '../models/audit-log.model';
import { getFileChecksum } from '../config/multer';
import { AppError, asyncHandler } from '../middleware/error-handler';
import { logger } from '../middleware/logger';
import { UploadResponse, JobStatusResponse, PODResponse } from '../../../shared/types/pod-schema';
import { scheduleProcessing } from '../services/processing.service';

/**
 * In-memory job tracking
 * In production, use Redis or a similar solution
 */
interface Job {
  id: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  filesProcessed: number;
  filesTotal: number;
  podIds: string[];
  error?: string;
}

const jobs: Map<string, Job> = new Map();

/**
 * Upload POD Files
 * POST /api/v1/pods/upload
 */
export const uploadPODs = asyncHandler(async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  const clientIdentifier = req.body.clientIdentifier as string | undefined;
  const expectedData = req.body.expectedData ? JSON.parse(req.body.expectedData) : undefined;

  logger.info('Files uploaded', {
    count: files.length,
    clientIdentifier,
    files: files.map(f => ({ name: f.originalname, size: f.size, type: f.mimetype })),
  });

  // Create job ID
  const jobId = uuidv4();

  // Initialize job tracking
  jobs.set(jobId, {
    id: jobId,
    status: 'PROCESSING',
    progress: 0,
    filesProcessed: 0,
    filesTotal: files.length,
    podIds: [],
  });

  // Create POD documents for each file
  const podIds: string[] = [];

  for (const file of files) {
    try {
      // Calculate file checksum
      const checksum = await getFileChecksum(file.path);

      // Create POD document in database with initial status
      const pod = new PODModel({
        fileMetadata: {
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
          storagePath: file.path,
          checksum,
        },
        clientIdentifier,
        extractedData: {
          normalized: {
            items: [],
          },
        },
        validationResult: {
          status: 'REVIEW',
          summary: 'Processing...',
          timestamp: new Date(),
          checks: {
            signatures: {
              expected: 2,
              found: 0,
              driverPresent: false,
              receiverPresent: false,
            },
            imageQuality: {
              blurry: false,
              incomplete: false,
              lowContrast: false,
            },
            requiredFields: {
              missing: [],
              present: [],
            },
            itemsValidation: {
              matched: true,
              discrepancies: [],
            },
          },
          peculiarities: [],
        },
        processingMetadata: {
          processedAt: new Date(),
          processingTimeMs: 0,
          ocrEngine: 'tesseract.js',
        },
        status: 'UPLOADED',
      });

      await pod.save();
      podIds.push(pod._id.toString());

      // Create audit log
      await createAuditLog(
        pod._id,
        'UPLOAD',
        {
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
          clientIdentifier,
        },
        {
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        }
      );

      logger.info('POD document created', {
        podId: pod._id.toString(),
        fileName: file.originalname,
      });

    } catch (error) {
      logger.error('Error creating POD document', {
        fileName: file.originalname,
        error,
      });
      // Continue with other files
    }
  }

  // Update job with POD IDs
  const job = jobs.get(jobId);
  if (job) {
    job.podIds = podIds;
  }

  // Start async processing
  scheduleProcessing(podIds).catch(err => logger.error('Job processing failed', { jobId, error: err }));

  // Estimate processing time (2 seconds per file)
  const estimatedProcessingTime = files.length * 2000;

  const response: UploadResponse = {
    success: true,
    data: {
      jobId,
      filesReceived: files.length,
      estimatedProcessingTime,
    },
  };

  res.status(200).json(response);
});

/**
 * Get Job Status
 * GET /api/v1/pods/:jobId/status
 */
export const getJobStatus = asyncHandler(async (req: Request, res: Response) => {
  const { jobId } = req.params;

  const job = jobs.get(jobId);

  if (!job) {
    throw new AppError('Job not found', 404, 'JOB_NOT_FOUND');
  }

  // Get actual POD statuses from database
  const pods = await PODModel.find({ _id: { $in: job.podIds } }, 'status');
  const completedCount = pods.filter(p => p.status === 'COMPLETED').length;
  const failedCount = pods.filter(p => p.status === 'FAILED').length;
  const processingCount = pods.filter(p => p.status === 'PROCESSING').length;

  // Update job status
  if (completedCount + failedCount === job.filesTotal) {
    job.status = 'COMPLETED';
    job.progress = 100;
    job.filesProcessed = job.filesTotal;
  } else {
    job.progress = Math.round((completedCount + failedCount) / job.filesTotal * 100);
    job.filesProcessed = completedCount + failedCount;
  }

  const response: JobStatusResponse = {
    success: true,
    data: {
      status: job.status === 'COMPLETED' ? 'COMPLETED' : processingCount > 0 ? 'PROCESSING' : 'UPLOADED',
      progress: job.progress,
      filesProcessed: job.filesProcessed,
      filesTotal: job.filesTotal,
      podIds: job.podIds,
    },
  };

  res.status(200).json(response);
});

/**
 * Get POD by ID
 * GET /api/v1/pods/:id
 */
export const getPODById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const pod = await PODModel.findById(id);

  if (!pod) {
    throw new AppError('POD not found', 404, 'POD_NOT_FOUND');
  }

  const response: PODResponse = {
    success: true,
    data: pod.toObject() as any,
  };

  res.status(200).json(response);
});

/**
 * Trigger reprocessing of a POD
 * POST /api/v1/pods/:id/reprocess
 */
export const reprocessPOD = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { clientIdentifier } = req.body;

  const pod = await PODModel.findById(id);

  if (!pod) {
    throw new AppError('POD not found', 404, 'POD_NOT_FOUND');
  }

  // Update client identifier if provided
  if (clientIdentifier) {
    pod.clientIdentifier = clientIdentifier;
  }

  // Reset status to processing
  pod.status = 'PROCESSING';
  await pod.save();

  // Create audit log
  await createAuditLog(
    pod._id,
    'REPROCESS',
    {
      clientIdentifier,
      previousStatus: pod.validationResult.status,
    },
    {
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    }
  );

  // Create new job for this POD
  const jobId = uuidv4();
  jobs.set(jobId, {
    id: jobId,
    status: 'PROCESSING',
    progress: 0,
    filesProcessed: 0,
    filesTotal: 1,
    podIds: [pod._id.toString()],
  });

  logger.info('POD reprocessing triggered', { podId: id, jobId });

  res.status(200).json({
    success: true,
    data: {
      jobId,
      podId: pod._id.toString(),
    },
  });
});
