import { PODModel } from '../models/pod.model';
import { DeliveryModel } from '../models/delivery.model';
import { createAuditLog } from '../models/audit-log.model';
import { extractText } from './ocr.service';
import { parseStructuredFile, mapToNormalizedFormat, structuredDataToText } from './file-parser.service';
import { normalizeOCRText, mergeNormalizedData } from './normalization.service';
import { detectSignaturesCombined } from './signature-detection.service';
import { analyzeImageQuality } from './image-quality.service';
import { validatePOD } from './validation.service';
import { classifyDocument } from './document-classification.service';
import { detectStamps } from './stamp-detection.service';
import { validateDelivery } from './delivery-validation.service';
import { createModuleLogger } from '../middleware/logger';
import { NormalizedPODData, ExpectedPODData, SignatureDetectionResult } from '../../../shared/types/pod-schema';

const logger = createModuleLogger('ProcessingService');

/**
 * Process a single POD document
 */
export const processPOD = async (podId: string): Promise<void> => {
  const startTime = Date.now();

  try {
    logger.info('Starting POD processing', { podId });

    // Load POD document from database
    const pod = await PODModel.findById(podId);

    if (!pod) {
      throw new Error(`POD not found: ${podId}`);
    }

    // Update status to PROCESSING
    pod.status = 'PROCESSING';
    await pod.save();

    // Create audit log
    await createAuditLog(pod._id, 'PROCESS', {
      fileName: pod.fileMetadata.originalName,
      mimeType: pod.fileMetadata.mimeType,
    });

    const { storagePath, mimeType, originalName } = pod.fileMetadata;

    // Step 1: Extract data (OCR or parse structured file)
    let rawText = '';
    let normalized: NormalizedPODData;
    let ocrConfidence = 100;

    // Check if it's a structured file by MIME type or file extension
    const isStructuredFile =
      mimeType.includes('spreadsheet') ||
      mimeType.includes('excel') ||
      mimeType === 'text/csv' ||
      originalName.toLowerCase().endsWith('.csv') ||
      originalName.toLowerCase().endsWith('.xlsx') ||
      originalName.toLowerCase().endsWith('.xls');

    if (isStructuredFile) {
      // Parse structured file (Excel/CSV)
      logger.info('Processing structured file', { podId, mimeType, originalName });

      const parsedData = await parseStructuredFile(storagePath, mimeType);
      normalized = mapToNormalizedFormat(parsedData);
      rawText = structuredDataToText(parsedData);

      logger.info('Structured file parsed', {
        podId,
        itemCount: normalized.items.length,
      });
    } else {
      // Perform OCR on image/PDF
      logger.info('Performing OCR', { podId, mimeType });

      const ocrResult = await extractText(storagePath, mimeType);
      rawText = ocrResult.text;
      ocrConfidence = ocrResult.confidence;
      normalized = normalizeOCRText(rawText);

      logger.info('OCR complete', {
        podId,
        textLength: rawText.length,
        confidence: ocrConfidence.toFixed(2),
        itemCount: normalized.items.length,
      });
    }

    // Update POD with extracted data
    pod.extractedData = {
      rawText,
      normalized,
    };

    // Step 2: Detect signatures (for images/PDFs only)
    let signatures: SignatureDetectionResult = {
      found: 0,
      driverPresent: false,
      receiverPresent: false,
      confidence: 0,
      regions: [],
    };

    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
      logger.info('Detecting signatures', { podId });
      signatures = await detectSignaturesCombined(storagePath, rawText);

      logger.info('Signature detection complete', {
        podId,
        found: signatures.found,
        driverPresent: signatures.driverPresent,
        receiverPresent: signatures.receiverPresent,
      });
    } else {
      // For Excel/CSV, assume signatures are present (no image to analyze)
      signatures = {
        found: 2,
        driverPresent: true,
        receiverPresent: true,
        confidence: 100,
        regions: [],
      };
    }

    // Step 3: Analyze image quality (for images/PDFs only)
    let imageQuality;

    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
      logger.info('Analyzing image quality', { podId });
      imageQuality = await analyzeImageQuality(storagePath);

      logger.info('Image quality analysis complete', {
        podId,
        isBlurry: imageQuality.isBlurry,
        isLowContrast: imageQuality.isLowContrast,
      });
    }

    // Step 4: Document Classification (NEW)
    logger.info('Classifying document', { podId });
    try {
      const classification = await classifyDocument(podId, rawText);
      pod.documentClassification = classification;

      logger.info('Document classification complete', {
        podId,
        detectedType: classification.detectedType,
        confidence: classification.confidence.toFixed(2)
      });
    } catch (classError) {
      logger.warn('Document classification failed', { podId, error: classError });
      // Continue processing even if classification fails
    }

    // Step 5: Stamp Detection (NEW)
    logger.info('Detecting stamps and signatures', { podId });
    try {
      const stampDetection = await detectStamps(
        podId,
        rawText,
        signatures,  // Pass image-based signature detection results
        pod.documentClassification?.detectedType  // Pass document type for context-aware mapping
      );
      pod.stampDetection = stampDetection;

      logger.info('Stamp detection complete', {
        podId,
        stampsFound: stampDetection.stamps.length,
        signaturesFound: stampDetection.signatures.length,
        imageBasedUsed: signatures.found > 0
      });
    } catch (stampError) {
      logger.error('Stamp detection failed', { podId, error: stampError });
      // Continue processing with empty stamp detection
      pod.stampDetection = { stamps: [], signatures: [] };
    }

    // Step 6: Run validation
    logger.info('Running validation', { podId });

    const validationResult = validatePOD({
      normalized,
      signatures,
      imageQuality,
      ocrConfidence,
      expected: undefined, // Expected data can be provided via upload request
      mimeType,
    });

    logger.info('Validation complete', {
      podId,
      status: validationResult.status,
      peculiarityCount: validationResult.peculiarities.length,
    });

    // Update POD with validation result
    pod.validationResult = validationResult;

    // Step 5: Update processing metadata
    const processingTime = Date.now() - startTime;
    pod.processingMetadata = {
      processedAt: new Date(),
      processingTimeMs: processingTime,
      ocrEngine: mimeType.startsWith('image/') || mimeType === 'application/pdf' ? 'tesseract.js' : 'direct-parse',
      ocrConfidence,
    };

    // Mark as COMPLETED
    pod.status = 'COMPLETED';
    await pod.save();

    // Create audit log for validation
    await createAuditLog(pod._id, 'VALIDATE', {
      status: validationResult.status,
      peculiarityCount: validationResult.peculiarities.length,
      processingTime,
    });

    logger.info('POD processing complete', {
      podId,
      status: validationResult.status,
      processingTime: `${processingTime}ms`,
    });

  } catch (error) {
    logger.error('Error processing POD', { podId, error });

    // Update POD status to FAILED
    try {
      const pod = await PODModel.findById(podId);
      if (pod) {
        pod.status = 'FAILED';
        pod.validationResult = {
          status: 'FAIL',
          summary: `Processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
              matched: false,
              discrepancies: [],
            },
          },
          peculiarities: [],
        };

        const processingTime = Date.now() - startTime;
        pod.processingMetadata = {
          processedAt: new Date(),
          processingTimeMs: processingTime,
          ocrEngine: 'error',
        };

        await pod.save();

        // Create audit log for failure
        await createAuditLog(pod._id, 'PROCESS', {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } catch (updateError) {
      logger.error('Error updating POD status to FAILED', { podId, error: updateError });
    }

    throw error;
  }
};

/**
 * Process multiple PODs (batch processing)
 */
export const processPODBatch = async (podIds: string[]): Promise<void> => {
  logger.info('Starting batch processing', { count: podIds.length });

  // Process pods sequentially (can be parallelized with Promise.all for better performance)
  for (const podId of podIds) {
    try {
      await processPOD(podId);
    } catch (error) {
      logger.error('Error processing POD in batch', { podId, error });
      // Continue with other PODs
    }
  }

  logger.info('Batch processing complete', { count: podIds.length });
};

/**
 * Reprocess a POD (e.g., with different client identifier)
 */
export const reprocessPOD = async (podId: string, clientIdentifier?: string): Promise<void> => {
  logger.info('Reprocessing POD', { podId, clientIdentifier });

  const pod = await PODModel.findById(podId);

  if (!pod) {
    throw new Error(`POD not found: ${podId}`);
  }

  // Update client identifier if provided
  if (clientIdentifier) {
    pod.clientIdentifier = clientIdentifier;
    await pod.save();
  }

  // Process POD again
  await processPOD(podId);
};

/**
 * Schedule processing (for async job processing)
 * In production, this would use a job queue like Bull or BullMQ with Redis
 */
export const scheduleProcessing = async (podIds: string[]): Promise<void> => {
  logger.info('Scheduling POD processing', { count: podIds.length });

  // For MVP, process immediately
  // In production, this would add jobs to a queue
  setImmediate(async () => {
    await processPODBatch(podIds);
  });
};

/**
 * Process an entire delivery (multi-document)
 *
 * This function:
 * 1. Processes all POD documents in the delivery (OCR, classification, stamps)
 * 2. After all documents are processed, runs delivery-level validation
 */
export const processDelivery = async (deliveryId: string): Promise<void> => {
  logger.info('Starting delivery processing', { deliveryId });

  try {
    // Load delivery
    const delivery = await DeliveryModel.findById(deliveryId);

    if (!delivery) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    // Update status to PROCESSING
    delivery.status = 'PROCESSING';
    await delivery.save();

    // Get all POD IDs
    const podIds = delivery.documents.map(doc => doc.podId.toString());

    // Process all PODs in parallel
    logger.info('Processing individual documents', {
      deliveryId,
      documentCount: podIds.length
    });

    await Promise.all(
      podIds.map(async (podId) => {
        try {
          await processPOD(podId);
        } catch (error) {
          logger.error('Error processing POD in delivery', { deliveryId, podId, error });
          // Continue with other documents
        }
      })
    );

    logger.info('Individual documents processed, starting delivery-level validation', {
      deliveryId
    });

    // Update delivery's documents array with detected types from PODs
    const pods = await PODModel.find({ _id: { $in: podIds } });
    const deliveryToUpdate = await DeliveryModel.findById(deliveryId);

    if (deliveryToUpdate) {
      deliveryToUpdate.documents.forEach(doc => {
        const pod = pods.find(p => p._id.toString() === doc.podId.toString());
        if (pod && pod.documentClassification) {
          doc.detectedType = pod.documentClassification.detectedType;
        }
      });
      await deliveryToUpdate.save();

      logger.info('Delivery documents updated with detected types', {
        deliveryId,
        documentTypes: deliveryToUpdate.documents.map(d => ({
          podId: d.podId.toString(),
          type: d.detectedType
        }))
      });
    }

    // After all PODs are processed, run delivery-level validation
    await validateDelivery(deliveryId);

    logger.info('Delivery processing complete', { deliveryId });

  } catch (error) {
    logger.error('Error processing delivery', { deliveryId, error });

    // Update delivery status to FAILED
    try {
      const delivery = await DeliveryModel.findById(deliveryId);
      if (delivery) {
        delivery.status = 'FAILED';
        await delivery.save();
      }
    } catch (updateError) {
      logger.error('Error updating delivery status to FAILED', { deliveryId, error: updateError });
    }

    throw error;
  }
};

/**
 * Schedule delivery processing (for async job processing)
 */
export const scheduleDeliveryProcessing = async (deliveryId: string): Promise<void> => {
  logger.info('Scheduling delivery processing', { deliveryId });

  // For MVP, process immediately
  // In production, this would add a job to a queue
  setImmediate(async () => {
    await processDelivery(deliveryId);
  });
};
