/**
 * Delivery Validation Service
 *
 * Orchestrates multi-document validation for deliveries.
 * This service:
 * 1. Loads delivery with all associated POD documents
 * 2. Routes to appropriate customer-specific validator
 * 3. Executes validation
 * 4. Saves results back to delivery document
 */

import { DeliveryModel } from '../models/delivery.model';
import { validationRegistry } from './validation-registry.service';
import { createAuditLog } from '../models/audit-log.model';
import { createModuleLogger } from '../middleware/logger';

const logger = createModuleLogger('DeliveryValidationService');

/**
 * Validate a delivery using customer-specific rules
 */
export const validateDelivery = async (deliveryId: string): Promise<void> => {
  const startTime = Date.now();

  try {
    logger.info('Starting delivery validation', { deliveryId });

    // Load delivery document with populated POD references
    const delivery = await DeliveryModel.findById(deliveryId);

    if (!delivery) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    // Update status to PROCESSING
    delivery.status = 'PROCESSING';
    await delivery.save();

    // Get the appropriate validator based on clientIdentifier
    const validator = validationRegistry.getValidator(delivery.clientIdentifier);

    logger.info('Validator selected for delivery', {
      deliveryId,
      clientIdentifier: delivery.clientIdentifier || 'null',
      validatorName: validator.getName ? validator.getName() : validator.constructor.name
    });

    // Execute validation
    const validationResult = await validator.validate(delivery);

    // Calculate processing time
    const processingTime = Date.now() - startTime;

    // Count documents processed and failed
    const documentsProcessed = delivery.documents.length;
    const documentsFailed = delivery.documents.filter(doc => !doc.detectedType || doc.detectedType === 'UNKNOWN').length;

    // Update delivery with validation result
    delivery.deliveryValidation = validationResult;
    delivery.processingMetadata = {
      processedAt: new Date(),
      processingTimeMs: processingTime,
      documentsProcessed,
      documentsFailed
    };
    delivery.status = 'COMPLETED';

    await delivery.save();

    // Create audit log
    await createAuditLog(
      delivery._id,
      'VALIDATE',
      {
        validationStatus: validationResult.status,
        peculiarityCount: validationResult.peculiarities.length,
        crossDocumentCheckCount: validationResult.crossDocumentChecks.length,
        processingTime
      }
    );

    logger.info('Delivery validation complete', {
      deliveryId,
      status: validationResult.status,
      peculiarityCount: validationResult.peculiarities.length,
      processingTime: `${processingTime}ms`
    });

  } catch (error) {
    logger.error('Error validating delivery', {
      deliveryId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    // Update delivery status to FAILED
    try {
      const delivery = await DeliveryModel.findById(deliveryId);
      if (delivery) {
        delivery.status = 'FAILED';
        delivery.deliveryValidation = {
          status: 'FAIL',
          summary: `Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          timestamp: new Date(),
          documentCompleteness: {
            requiredDocuments: [],
            missingDocuments: [],
            extraDocuments: []
          },
          crossDocumentChecks: [],
          peculiarities: []
        };

        const processingTime = Date.now() - startTime;
        delivery.processingMetadata = {
          processedAt: new Date(),
          processingTimeMs: processingTime,
          documentsProcessed: delivery.documents.length,
          documentsFailed: delivery.documents.length
        };

        await delivery.save();

        // Create audit log for failure
        await createAuditLog(
          delivery._id,
          'VALIDATE',
          {
            status: 'FAILED',
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        );
      }
    } catch (updateError) {
      logger.error('Error updating delivery status to FAILED', { deliveryId, error: updateError });
    }

    throw error;
  }
};

/**
 * Revalidate a delivery (e.g., after updating documents or changing client identifier)
 */
export const revalidateDelivery = async (deliveryId: string, newClientIdentifier?: string): Promise<void> => {
  logger.info('Revalidating delivery', { deliveryId, newClientIdentifier });

  const delivery = await DeliveryModel.findById(deliveryId);

  if (!delivery) {
    throw new Error(`Delivery not found: ${deliveryId}`);
  }

  // Update client identifier if provided
  if (newClientIdentifier) {
    delivery.clientIdentifier = newClientIdentifier;
    await delivery.save();
  }

  // Run validation again
  await validateDelivery(deliveryId);
};

/**
 * Get delivery validation status (without re-running validation)
 */
export const getDeliveryValidationStatus = async (deliveryId: string) => {
  const delivery = await DeliveryModel.findById(deliveryId);

  if (!delivery) {
    throw new Error(`Delivery not found: ${deliveryId}`);
  }

  return {
    deliveryId: delivery._id,
    deliveryReference: delivery.deliveryReference,
    clientIdentifier: delivery.clientIdentifier,
    status: delivery.status,
    validationResult: delivery.deliveryValidation,
    processingMetadata: delivery.processingMetadata,
    documentCount: delivery.documents.length
  };
};

/**
 * Batch validate multiple deliveries
 */
export const validateDeliveryBatch = async (deliveryIds: string[]): Promise<void> => {
  logger.info('Starting batch delivery validation', { count: deliveryIds.length });

  // Process deliveries sequentially (can be parallelized with Promise.all for better performance)
  for (const deliveryId of deliveryIds) {
    try {
      await validateDelivery(deliveryId);
    } catch (error) {
      logger.error('Error validating delivery in batch', { deliveryId, error });
      // Continue with other deliveries
    }
  }

  logger.info('Batch delivery validation complete', { count: deliveryIds.length });
};

/**
 * Schedule delivery validation (for async job processing)
 * In production, this would use a job queue like Bull or BullMQ with Redis
 */
export const scheduleDeliveryValidation = async (deliveryId: string): Promise<void> => {
  logger.info('Scheduling delivery validation', { deliveryId });

  // For MVP, process immediately
  // In production, this would add a job to a queue
  setImmediate(async () => {
    await validateDelivery(deliveryId);
  });
};
