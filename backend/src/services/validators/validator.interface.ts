/**
 * Validator Interface
 *
 * Common contract for all customer-specific validators.
 * Each customer (Super 8, Walmart, Target, etc.) implements this interface
 * with their own unique validation logic.
 */

import { DeliveryValidationResult } from '../../../../shared/types/delivery-schema';
import { IDeliveryModel } from '../../models/delivery.model';

/**
 * Delivery Validator Interface
 *
 * All customer-specific validators must implement this interface.
 * The validate method receives a complete delivery with all associated documents
 * and returns a comprehensive validation result.
 */
export interface IDeliveryValidator {
  /**
   * Validate a delivery according to customer-specific rules
   *
   * @param delivery - The delivery document with all associated POD documents
   * @returns Promise<DeliveryValidationResult> - Complete validation result including:
   *   - Overall status (PASS/REVIEW/FAIL)
   *   - Document completeness check
   *   - Cross-document validation results
   *   - All peculiarities found
   */
  validate(delivery: IDeliveryModel): Promise<DeliveryValidationResult>;

  /**
   * Optional: Get validator name/identifier
   */
  getName?(): string;

  /**
   * Optional: Get validator version
   */
  getVersion?(): string;
}

/**
 * Base Validator Abstract Class
 *
 * Provides common utility methods that all validators can use.
 * Customer-specific validators can extend this class to inherit common functionality.
 */
export abstract class BaseValidator implements IDeliveryValidator {
  /**
   * Abstract method that must be implemented by each validator
   */
  abstract validate(delivery: IDeliveryModel): Promise<DeliveryValidationResult>;

  /**
   * Get validator name
   */
  getName(): string {
    return this.constructor.name;
  }

  /**
   * Get validator version
   */
  getVersion(): string {
    return '1.0.0';
  }

  /**
   * Helper: Find a document of specific type in delivery
   */
  protected findDocument(delivery: IDeliveryModel, documentType: string): any {
    return delivery.documents.find(doc => doc.detectedType === documentType);
  }

  /**
   * Helper: Check if delivery has all required documents
   */
  protected checkRequiredDocuments(
    delivery: IDeliveryModel,
    requiredTypes: string[]
  ): { missing: string[], present: string[] } {
    const presentTypes = delivery.documents
      .map(doc => doc.detectedType)
      .filter(type => type !== undefined && type !== 'UNKNOWN') as string[];

    const missing = requiredTypes.filter(type => !presentTypes.includes(type));
    const present = requiredTypes.filter(type => presentTypes.includes(type));

    return { missing, present };
  }

  /**
   * Helper: Determine overall status based on peculiarities
   */
  protected determineStatus(peculiarities: any[]): 'PASS' | 'REVIEW' | 'FAIL' {
    if (peculiarities.length === 0) {
      return 'PASS';
    }

    const highSeverity = peculiarities.filter(p => p.severity === 'HIGH').length;
    const mediumSeverity = peculiarities.filter(p => p.severity === 'MEDIUM').length;

    // High severity always triggers REVIEW
    if (highSeverity > 0) {
      return 'REVIEW';
    }

    // Multiple medium severity triggers REVIEW
    if (mediumSeverity >= 2) {
      return 'REVIEW';
    }

    // Any peculiarity triggers REVIEW (can be customized per customer)
    return 'REVIEW';
  }

  /**
   * Helper: Generate summary message
   */
  protected generateSummary(status: string, peculiarities: any[]): string {
    if (status === 'PASS') {
      return 'Delivery validation passed. All checks successful.';
    }

    if (status === 'FAIL') {
      return 'Delivery validation failed. Critical issues detected.';
    }

    // REVIEW status
    if (peculiarities.length === 0) {
      return 'Delivery requires review.';
    }

    const highPriority = peculiarities.filter(p => p.severity === 'HIGH');
    if (highPriority.length > 0) {
      return `Delivery requires review: ${highPriority[0].description}`;
    }

    return `Delivery requires review: ${peculiarities[0].description}`;
  }
}
