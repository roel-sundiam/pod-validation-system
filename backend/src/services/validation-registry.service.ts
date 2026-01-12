/**
 * Validation Registry Service
 *
 * This is the CORE of the multi-customer architecture.
 * It acts as a factory/router that dynamically routes deliveries to
 * the appropriate customer-specific validator based on clientIdentifier.
 *
 * Adding a new customer requires only 3 steps:
 * 1. Create validator class implementing IDeliveryValidator
 * 2. Import the validator
 * 3. Register it: validationRegistry.register('CUSTOMER_ID', new CustomerValidator())
 */

import { IDeliveryValidator } from './validators/validator.interface';
import { createModuleLogger } from '../middleware/logger';

const logger = createModuleLogger('ValidationRegistry');

/**
 * Validation Registry Class
 *
 * Manages all customer-specific validators and routes to the correct one
 */
class ValidationRegistry {
  private validators: Map<string, IDeliveryValidator> = new Map();
  private defaultValidator: IDeliveryValidator | null = null;

  /**
   * Register a validator for a specific customer
   *
   * @param clientId - Customer identifier (e.g., 'SUPER8', 'WALMART', 'TARGET')
   * @param validator - Validator instance implementing IDeliveryValidator
   */
  registerValidator(clientId: string, validator: IDeliveryValidator): void {
    const normalizedId = clientId.toUpperCase();
    this.validators.set(normalizedId, validator);

    const validatorName = validator.getName ? validator.getName() : validator.constructor.name;
    logger.info('Validator registered', {
      clientId: normalizedId,
      validatorName,
      version: validator.getVersion ? validator.getVersion() : 'unknown'
    });
  }

  /**
   * Set the default validator (used when clientId is null or unknown)
   *
   * @param validator - Default validator instance
   */
  setDefaultValidator(validator: IDeliveryValidator): void {
    this.defaultValidator = validator;
    const validatorName = validator.getName ? validator.getName() : validator.constructor.name;
    logger.info('Default validator set', { validatorName });
  }

  /**
   * Get the appropriate validator for a client
   *
   * @param clientId - Customer identifier (optional)
   * @returns IDeliveryValidator - The appropriate validator instance
   */
  getValidator(clientId?: string | null): IDeliveryValidator {
    // If no client ID, use default validator
    if (!clientId) {
      if (!this.defaultValidator) {
        throw new Error('No default validator configured');
      }
      logger.debug('Using default validator', { clientId: 'null' });
      return this.defaultValidator;
    }

    // Normalize client ID (uppercase)
    const normalizedId = clientId.toUpperCase();

    // Try to find customer-specific validator
    const validator = this.validators.get(normalizedId);

    if (!validator) {
      // Customer not registered, use default validator
      logger.warn('Customer validator not found, using default', {
        clientId: normalizedId,
        availableCustomers: this.listRegisteredCustomers()
      });

      if (!this.defaultValidator) {
        throw new Error(`No validator found for client: ${clientId}, and no default validator configured`);
      }

      return this.defaultValidator;
    }

    logger.debug('Using customer-specific validator', {
      clientId: normalizedId,
      validatorName: validator.getName ? validator.getName() : validator.constructor.name
    });

    return validator;
  }

  /**
   * Check if a validator is registered for a specific client
   *
   * @param clientId - Customer identifier
   * @returns boolean - True if validator exists
   */
  hasValidator(clientId: string): boolean {
    return this.validators.has(clientId.toUpperCase());
  }

  /**
   * Get list of all registered customer IDs
   *
   * @returns string[] - Array of registered customer identifiers
   */
  listRegisteredCustomers(): string[] {
    return Array.from(this.validators.keys());
  }

  /**
   * Get count of registered validators
   *
   * @returns number - Number of registered customer validators
   */
  getValidatorCount(): number {
    return this.validators.size;
  }

  /**
   * Unregister a validator (useful for testing or dynamic updates)
   *
   * @param clientId - Customer identifier to unregister
   * @returns boolean - True if validator was removed
   */
  unregisterValidator(clientId: string): boolean {
    const normalizedId = clientId.toUpperCase();
    const removed = this.validators.delete(normalizedId);

    if (removed) {
      logger.info('Validator unregistered', { clientId: normalizedId });
    }

    return removed;
  }

  /**
   * Clear all registered validators (useful for testing)
   */
  clearAll(): void {
    this.validators.clear();
    this.defaultValidator = null;
    logger.info('All validators cleared');
  }

  /**
   * Get validator info (for debugging/monitoring)
   */
  getRegistryInfo(): {
    defaultValidator: string | null;
    customers: { id: string; validator: string; version: string }[];
    totalCount: number;
  } {
    const customers = Array.from(this.validators.entries()).map(([id, validator]) => ({
      id,
      validator: validator.getName ? validator.getName() : validator.constructor.name,
      version: validator.getVersion ? validator.getVersion() : 'unknown'
    }));

    return {
      defaultValidator: this.defaultValidator
        ? (this.defaultValidator.getName ? this.defaultValidator.getName() : this.defaultValidator.constructor.name)
        : null,
      customers,
      totalCount: this.validators.size
    };
  }
}

/**
 * Singleton instance of ValidationRegistry
 *
 * This is the main instance used throughout the application.
 * Validators are registered during application startup.
 */
export const validationRegistry = new ValidationRegistry();

/**
 * Initialize the validation registry with all customer validators
 *
 * This function is called during application startup to register all
 * customer-specific validators. Add new customers here as they are implemented.
 */
export const initializeValidationRegistry = async (): Promise<void> => {
  logger.info('Initializing validation registry...');

  try {
    // Import validators
    const { Super8Validator } = await import('./validators/super8.validator');
    // const { GenericValidator } = await import('./validators/generic.validator');
    // const { WalmartValidator } = await import('./validators/walmart.validator');

    // Register customer-specific validators
    const super8Validator = new Super8Validator();
    validationRegistry.registerValidator('SUPER8', super8Validator);

    // Set Super8 as default validator (since it's the only one currently implemented)
    validationRegistry.setDefaultValidator(super8Validator);
    // validationRegistry.registerValidator('WALMART', new WalmartValidator());
    // validationRegistry.registerValidator('TARGET', new TargetValidator());

    logger.info('Validation registry initialized', {
      info: validationRegistry.getRegistryInfo()
    });
  } catch (error) {
    logger.error('Failed to initialize validation registry', { error });
    throw error;
  }
};

/**
 * Export the ValidationRegistry class for testing purposes
 */
export { ValidationRegistry };
