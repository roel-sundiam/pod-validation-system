import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { DeliveryModel } from "../models/delivery.model";
import { PODModel } from "../models/pod.model";
import { createAuditLog } from "../models/audit-log.model";
import { getFileChecksum } from "../config/multer";
import { AppError, asyncHandler } from "../middleware/error-handler";
import { logger } from "../middleware/logger";
import {
  DeliveryUploadResponse,
  DeliveryResponse,
  DeliveryListResponse,
  DeliveryValidationResponse,
  DeliveryValidationResult,
} from "../../../shared/types/delivery-schema";
import { ValidationStatus } from "../../../shared/types/pod-schema";
import { scheduleDeliveryProcessing } from "../services/processing.service";
import { revalidateDelivery } from "../services/delivery-validation.service";

/**
 * Upload Delivery (Batch Upload)
 * POST /api/v1/deliveries/upload
 */
export const uploadDelivery = asyncHandler(
  async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];
    const clientIdentifier = req.body.clientIdentifier as string | undefined;
    const deliveryReference = req.body.deliveryReference as string | undefined;

    if (!files || files.length === 0) {
      throw new AppError("No files uploaded", 400, "NO_FILES");
    }

    logger.info("Delivery upload started", {
      fileCount: files.length,
      clientIdentifier,
      deliveryReference,
      files: files.map((f) => ({
        name: f.originalname,
        size: f.size,
        type: f.mimetype,
      })),
    });

    // Generate delivery reference if not provided
    const finalDeliveryReference =
      deliveryReference || `DEL-${Date.now()}-${uuidv4().substring(0, 8)}`;

    // Create job ID for tracking
    const jobId = uuidv4();

    // Create delivery document
    const delivery = new DeliveryModel({
      deliveryReference: finalDeliveryReference,
      clientIdentifier,
      uploadedAt: new Date(),
      status: "UPLOADED",
      documents: [],
    });

    await delivery.save();

    logger.info("Delivery document created", {
      deliveryId: delivery._id.toString(),
      deliveryReference: finalDeliveryReference,
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
          deliveryId: delivery._id, // Link to parent delivery
          extractedData: {
            normalized: {
              items: [],
            },
          },
          validationResult: {
            status: "REVIEW",
            summary: "Processing...",
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
            ocrEngine: "tesseract.js",
          },
          status: "UPLOADED",
        });

        await pod.save();
        podIds.push(pod._id.toString());

        // Add to delivery documents array
        delivery.documents.push({
          podId: pod._id.toString(),
          required: true,
        });

        // Create audit log
        await createAuditLog(
          pod._id,
          "UPLOAD",
          {
            fileName: file.originalname,
            fileSize: file.size,
            mimeType: file.mimetype,
            clientIdentifier,
            deliveryId: delivery._id.toString(),
            deliveryReference: finalDeliveryReference,
          },
          {
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
          }
        );

        logger.info("POD document created and linked to delivery", {
          podId: pod._id.toString(),
          deliveryId: delivery._id.toString(),
          fileName: file.originalname,
        });
      } catch (error) {
        logger.error("Error creating POD document", {
          fileName: file.originalname,
          error,
        });
        // Continue with other files
      }
    }

    // Save delivery with all documents
    await delivery.save();

    // Create audit log for delivery
    await createAuditLog(delivery._id, "UPLOAD", {
      deliveryReference: finalDeliveryReference,
      clientIdentifier,
      documentCount: delivery.documents.length,
      jobId,
    });

    // Start async processing
    scheduleDeliveryProcessing(delivery._id.toString()).catch((err) =>
      logger.error("Delivery processing failed", {
        deliveryId: delivery._id.toString(),
        jobId,
        error: err,
      })
    );

    // Estimate processing time (3 seconds per file + 2 seconds for delivery validation)
    const estimatedProcessingTime = files.length * 3000 + 2000;

    const response: DeliveryUploadResponse = {
      success: true,
      data: {
        deliveryId: delivery._id.toString(),
        jobId,
        filesReceived: files.length,
        estimatedProcessingTime,
      },
    };

    res.status(200).json(response);
  }
);

/**
 * Get Delivery by ID
 * GET /api/v1/deliveries/:deliveryId
 */
export const getDeliveryById = asyncHandler(
  async (req: Request, res: Response) => {
    const { deliveryId } = req.params;

    const delivery = await DeliveryModel.findById(deliveryId);

    if (!delivery) {
      throw new AppError("Delivery not found", 404, "DELIVERY_NOT_FOUND");
    }

    const response: DeliveryResponse = {
      success: true,
      data: delivery.toObject() as any,
    };

    res.status(200).json(response);
  }
);

/**
 * Get Delivery Validation Result
 * GET /api/v1/deliveries/:deliveryId/validation
 */
export const getDeliveryValidation = asyncHandler(
  async (req: Request, res: Response) => {
    const { deliveryId } = req.params;

    const delivery = await DeliveryModel.findById(deliveryId);

    if (!delivery) {
      throw new AppError("Delivery not found", 404, "DELIVERY_NOT_FOUND");
    }

    // Load individual POD documents to include their validation results
    const podIds = delivery.documents.map((doc) => doc.podId);
    const pods = await PODModel.find({ _id: { $in: podIds } });

    const documentsWithValidation = delivery.documents.map((doc) => {
      const pod = pods.find((p) => p._id.toString() === doc.podId.toString());
      return {
        podId: doc.podId.toString(),
        documentType: doc.detectedType || "UNKNOWN",
        individualValidation: pod
          ? {
              status: pod.validationResult.status,
              peculiarities: pod.validationResult.peculiarities,
            }
          : null,
      };
    });

    // Build a complete validation response with all available data
    const validationData: DeliveryValidationResult = delivery.deliveryValidation
      ? {
          ...delivery.deliveryValidation,
          // Ensure checklist is included if it exists
          checklist: delivery.deliveryValidation.checklist,
        }
      : {
          status: "REVIEW" as ValidationStatus,
          summary: "Validation pending",
          timestamp: new Date(),
          documentCompleteness: {
            hasPallets: false,
            requiredDocuments: [],
            missingDocuments: [],
            extraDocuments: [],
          },
          crossDocumentChecks: [],
          peculiarities: [],
          checklist: undefined,
        };

    const response: DeliveryValidationResponse = {
      success: true,
      data: {
        deliveryId: delivery._id.toString(),
        validation: validationData,
        documents: documentsWithValidation as any,
      },
    };

    res.status(200).json(response);
  }
);

/**
 * Reprocess Delivery
 * POST /api/v1/deliveries/:deliveryId/reprocess
 */
export const reprocessDelivery = asyncHandler(
  async (req: Request, res: Response) => {
    const { deliveryId } = req.params;
    const { clientIdentifier } = req.body;

    const delivery = await DeliveryModel.findById(deliveryId);

    if (!delivery) {
      throw new AppError("Delivery not found", 404, "DELIVERY_NOT_FOUND");
    }

    // Update client identifier if provided
    if (clientIdentifier) {
      delivery.clientIdentifier = clientIdentifier;
      await delivery.save();
    }

    // Reset status to processing
    delivery.status = "PROCESSING";
    await delivery.save();

    // Create audit log
    await createAuditLog(
      delivery._id,
      "REPROCESS",
      {
        clientIdentifier,
        previousStatus: delivery.deliveryValidation?.status,
      },
      {
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      }
    );

    // Create new job for reprocessing
    const jobId = uuidv4();

    // Schedule revalidation
    await revalidateDelivery(deliveryId, clientIdentifier);

    logger.info("Delivery reprocessing triggered", { deliveryId, jobId });

    res.status(200).json({
      success: true,
      data: {
        jobId,
        deliveryId: delivery._id.toString(),
      },
    });
  }
);

/**
 * List Deliveries with Filters
 * GET /api/v1/deliveries
 */
export const listDeliveries = asyncHandler(
  async (req: Request, res: Response) => {
    const {
      clientIdentifier,
      status,
      dateFrom,
      dateTo,
      page = "1",
      limit = "20",
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build filter query
    const filter: any = {};

    if (clientIdentifier) {
      filter.clientIdentifier = clientIdentifier;
    }

    if (status) {
      filter.status = status;
    }

    if (dateFrom || dateTo) {
      filter.uploadedAt = {};
      if (dateFrom) {
        filter.uploadedAt.$gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        filter.uploadedAt.$lte = new Date(dateTo as string);
      }
    }

    // Execute query
    const [deliveries, totalItems] = await Promise.all([
      DeliveryModel.find(filter)
        .sort({ uploadedAt: -1 })
        .skip(skip)
        .limit(limitNum),
      DeliveryModel.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalItems / limitNum);

    const response: DeliveryListResponse = {
      success: true,
      data: {
        deliveries: deliveries.map((d) => d.toObject()) as any,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalItems,
          itemsPerPage: limitNum,
        },
      },
    };

    res.status(200).json(response);
  }
);

/**
 * Manual Document Classification Override
 * PATCH /api/v1/deliveries/:deliveryId/documents/:podId/classification
 */
export const overrideDocumentClassification = asyncHandler(
  async (req: Request, res: Response) => {
    const { deliveryId, podId } = req.params;
    const { detectedType, reason } = req.body;

    if (!detectedType || !reason) {
      throw new AppError(
        "detectedType and reason are required",
        400,
        "MISSING_FIELDS"
      );
    }

    // Validate document type
    const validTypes = [
      "PALLET_NOTIFICATION_LETTER",
      "LOSCAM_DOCUMENT",
      "CUSTOMER_PALLET_RECEIVING",
      "SHIP_DOCUMENT",
      "INVOICE",
      "RAR",
      "UNKNOWN",
    ];

    if (!validTypes.includes(detectedType)) {
      throw new AppError(
        `Invalid document type. Must be one of: ${validTypes.join(", ")}`,
        400,
        "INVALID_DOCUMENT_TYPE"
      );
    }

    logger.info("Manual classification override requested", {
      deliveryId,
      podId,
      detectedType,
      reason,
    });

    // Load POD document
    const pod = await PODModel.findById(podId);
    if (!pod) {
      throw new AppError("POD document not found", 404, "POD_NOT_FOUND");
    }

    // Verify POD belongs to this delivery
    if (!pod.deliveryId || pod.deliveryId.toString() !== deliveryId) {
      throw new AppError(
        "POD does not belong to this delivery",
        400,
        "DELIVERY_MISMATCH"
      );
    }

    // Update POD classification with manual override
    const previousType = pod.documentClassification?.detectedType;
    pod.documentClassification = {
      detectedType: detectedType as any,
      confidence: 100, // Manual override = 100% confidence
      keywords: pod.documentClassification?.keywords || [],
      alternativeTypes: pod.documentClassification?.alternativeTypes || [],
      manualOverride: true,
      overrideReason: reason,
      overrideTimestamp: new Date(),
      overrideBy: req.body.overrideBy || "manual", // Can be enhanced with auth
      inferredFromContext: false,
    };

    await pod.save();

    // Update delivery's documents array to reflect new type
    const delivery = await DeliveryModel.findById(deliveryId);
    if (!delivery) {
      throw new AppError("Delivery not found", 404, "DELIVERY_NOT_FOUND");
    }

    const docIndex = delivery.documents.findIndex(
      (d) => d.podId.toString() === podId
    );
    if (docIndex !== -1) {
      delivery.documents[docIndex].detectedType = detectedType as any;
      await delivery.save();
    }

    // Create audit log
    await createAuditLog(
      podId,
      "MANUAL_CLASSIFICATION_OVERRIDE" as any,
      {
        deliveryId,
        previousType,
        newType: detectedType,
        reason,
        performedBy: req.body.overrideBy || "manual",
      }
    );

    logger.info("Manual classification override applied", {
      deliveryId,
      podId,
      previousType,
      newType: detectedType,
    });

    // Trigger delivery revalidation
    logger.info("Triggering delivery revalidation", { deliveryId });
    await revalidateDelivery(deliveryId);

    // Fetch updated delivery to get validation status
    const updatedDelivery = await DeliveryModel.findById(deliveryId);

    res.status(200).json({
      success: true,
      data: {
        podId,
        previousClassification: previousType,
        newClassification: {
          detectedType,
          confidence: 100,
          manualOverride: true,
          reason,
        },
        revalidationTriggered: true,
        validationStatus: updatedDelivery?.deliveryValidation?.status || "UNKNOWN",
      },
    });
  }
);

/**
 * Get Classification Diagnostics for a Document
 * GET /api/v1/deliveries/:deliveryId/documents/:podId/diagnostics
 */
export const getDocumentDiagnostics = asyncHandler(
  async (req: Request, res: Response) => {
    const { deliveryId, podId } = req.params;

    logger.info("Document diagnostics requested", { deliveryId, podId });

    // Load POD document
    const pod = await PODModel.findById(podId);
    if (!pod) {
      throw new AppError("POD document not found", 404, "POD_NOT_FOUND");
    }

    // Verify POD belongs to this delivery
    if (!pod.deliveryId || pod.deliveryId.toString() !== deliveryId) {
      throw new AppError(
        "POD does not belong to this delivery",
        400,
        "DELIVERY_MISMATCH"
      );
    }

    const rawText = pod.extractedData?.rawText || "";
    const classification = pod.documentClassification;
    const ocrQuality = pod.processingMetadata;

    // Generate suggestions based on diagnosis
    const suggestions: string[] = [];

    if (ocrQuality && ocrQuality.ocrConfidence !== undefined && ocrQuality.ocrConfidence < 60) {
      suggestions.push(
        `OCR confidence is low (${ocrQuality.ocrConfidence.toFixed(1)}%). Consider uploading a clearer image.`
      );
    }

    if (
      classification &&
      classification.detectedType === "UNKNOWN" &&
      classification.alternativeTypes &&
      classification.alternativeTypes.length > 0
    ) {
      const topAlt = classification.alternativeTypes[0];
      suggestions.push(
        `Document was classified as ${topAlt.type} with ${topAlt.confidence.toFixed(1)}% confidence, just below the 25% threshold.`
      );
      suggestions.push(
        `Keywords found: ${classification.keywords.join(", ")} suggest this may be a ${topAlt.type} document.`
      );
    }

    if (classification && classification.detectedType === "UNKNOWN") {
      suggestions.push(
        "Try: (1) Manual override to correct document type, (2) Re-upload with better lighting/focus"
      );
    }

    if (classification && classification.manualOverride) {
      suggestions.push(
        `This document was manually classified as ${classification.detectedType}. Reason: ${classification.overrideReason}`
      );
    }

    const response = {
      success: true,
      data: {
        podId: pod._id.toString(),
        fileName: pod.fileMetadata?.originalName || "unknown",
        classification: {
          detectedType: classification?.detectedType || "UNKNOWN",
          confidence: classification?.confidence || 0,
          threshold: 25,
          matchedKeywords: classification?.keywords || [],
          alternativeTypes: classification?.alternativeTypes || [],
          manualOverride: classification?.manualOverride || false,
          overrideReason: classification?.overrideReason,
          inferredFromContext: classification?.inferredFromContext || false,
        },
        ocrQuality: {
          confidence: ocrQuality?.ocrConfidence || 0,
          textLength: rawText.length,
        },
        extractedTextPreview: rawText.substring(0, 500),
        fullTextAvailable: rawText.length > 500,
        suggestions,
      },
    };

    res.status(200).json(response);
  }
);
