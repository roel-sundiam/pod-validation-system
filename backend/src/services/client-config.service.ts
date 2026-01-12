import {
  ClientConfigModel,
  IClientConfigModel,
} from "../models/client-config.model";
import {
  ClientValidationConfig,
  ValidationRuleSet,
  SUPER8_VALIDATION_CONFIG,
} from "../../../shared/types/client-config.schema";
import { createModuleLogger } from "../middleware/logger";

const logger = createModuleLogger("ClientConfigService");

// In-memory cache for performance (cleared on update)
const configCache = new Map<string, ValidationRuleSet>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cacheTimestamps = new Map<string, number>();

/**
 * Get validation rules for a client
 * Returns hardcoded SUPER8 config if no database config exists
 * This ensures backward compatibility
 */
export const getClientValidationConfig = async (
  clientId: string
): Promise<ValidationRuleSet> => {
  try {
    const upperClientId = clientId.toUpperCase();

    // Check cache first
    const cached = configCache.get(upperClientId);
    const cacheTime = cacheTimestamps.get(upperClientId);

    if (cached && cacheTime && Date.now() - cacheTime < CACHE_TTL) {
      logger.debug("Returning cached config", { clientId: upperClientId });
      return cached;
    }

    // Try to load from database
    const dbConfig = await ClientConfigModel.findByClientId(upperClientId);

    if (dbConfig && dbConfig.isActive) {
      logger.info("Loaded config from database", { clientId: upperClientId });

      // Cache it
      configCache.set(upperClientId, dbConfig.validationRules);
      cacheTimestamps.set(upperClientId, Date.now());

      return dbConfig.validationRules;
    }

    // FALLBACK: Use hardcoded SUPER8 config for backward compatibility
    if (upperClientId === "SUPER8") {
      logger.info("Using hardcoded SUPER8 config (no database config found)", {
        clientId: upperClientId,
      });
      return SUPER8_VALIDATION_CONFIG;
    }

    // For other clients without config, throw error
    throw new Error(`No validation config found for client: ${clientId}`);
  } catch (error) {
    logger.error("Error loading client config", { clientId, error });

    // SAFETY FALLBACK: Return SUPER8 config if it's SUPER8
    if (clientId.toUpperCase() === "SUPER8") {
      logger.warn("Falling back to hardcoded SUPER8 config due to error");
      return SUPER8_VALIDATION_CONFIG;
    }

    throw error;
  }
};

/**
 * Check if client has a database config (vs using hardcoded)
 */
export const hasCustomConfig = async (clientId: string): Promise<boolean> => {
  try {
    const config = await ClientConfigModel.findByClientId(
      clientId.toUpperCase()
    );
    return !!config;
  } catch (error) {
    logger.error("Error checking for custom config", { clientId, error });
    return false;
  }
};

/**
 * Create or update client validation config
 */
export const saveClientConfig = async (
  clientId: string,
  clientName: string,
  validationRules: ValidationRuleSet,
  updatedBy?: string,
  description?: string
): Promise<IClientConfigModel> => {
  try {
    const upperClientId = clientId.toUpperCase();

    // Check if config already exists
    let config = await ClientConfigModel.findOne({ clientId: upperClientId });

    if (config) {
      // Update existing
      config.clientName = clientName;
      config.description = description;
      config.validationRules = validationRules;
      config.updatedBy = updatedBy;
      config.isActive = true;
      await config.save();

      logger.info("Updated client config", {
        clientId: upperClientId,
        updatedBy,
      });
    } else {
      // Create new
      config = new ClientConfigModel({
        clientId: upperClientId,
        clientName,
        description,
        validationRules,
        isActive: true,
        createdBy: updatedBy,
        updatedBy,
      });
      await config.save();

      logger.info("Created client config", {
        clientId: upperClientId,
        createdBy: updatedBy,
      });
    }

    // Clear cache
    clearClientCache(upperClientId);

    return config;
  } catch (error) {
    logger.error("Error saving client config", { clientId, error });
    throw error;
  }
};

/**
 * Get all active client configs
 */
export const getAllClientConfigs = async (): Promise<any[]> => {
  try {
    const configs = await ClientConfigModel.find({ isActive: true })
      .sort({ clientName: 1 })
      .lean();

    return configs;
  } catch (error) {
    logger.error("Error fetching all client configs", { error });
    throw error;
  }
};

/**
 * Get a specific client config by ID
 */
export const getClientConfigById = async (clientId: string): Promise<any> => {
  try {
    const config = await ClientConfigModel.findByClientId(
      clientId.toUpperCase()
    );
    return config ? config.toObject() : null;
  } catch (error) {
    logger.error("Error fetching client config", { clientId, error });
    throw error;
  }
};

/**
 * Deactivate a client config (soft delete)
 */
export const deactivateClientConfig = async (
  clientId: string,
  deactivatedBy?: string
): Promise<void> => {
  try {
    const upperClientId = clientId.toUpperCase();

    // Prevent deactivating SUPER8
    if (upperClientId === "SUPER8") {
      throw new Error("Cannot deactivate SUPER8 config");
    }

    await ClientConfigModel.updateOne(
      { clientId: upperClientId },
      { isActive: false, updatedBy: deactivatedBy }
    );

    clearClientCache(upperClientId);

    logger.info("Deactivated client config", {
      clientId: upperClientId,
      deactivatedBy,
    });
  } catch (error) {
    logger.error("Error deactivating client config", { clientId, error });
    throw error;
  }
};

/**
 * Clear cache for a specific client
 */
export const clearClientCache = (clientId?: string): void => {
  if (clientId) {
    const upperClientId = clientId.toUpperCase();
    configCache.delete(upperClientId);
    cacheTimestamps.delete(upperClientId);
    logger.debug("Cleared cache for client", { clientId: upperClientId });
  } else {
    configCache.clear();
    cacheTimestamps.clear();
    logger.debug("Cleared all client config cache");
  }
};

/**
 * Initialize default configs (run on startup)
 */
export const initializeDefaultConfigs = async (): Promise<void> => {
  try {
    // Check if SUPER8 config exists in database
    const super8Config = await ClientConfigModel.findByClientId("SUPER8");

    if (!super8Config) {
      logger.info("Creating default SUPER8 config in database");

      await ClientConfigModel.create({
        clientId: "SUPER8",
        clientName: "Super 8 Logistics",
        description:
          "Default Super 8 validation configuration with full requirements",
        validationRules: SUPER8_VALIDATION_CONFIG,
        isActive: true,
        createdBy: "SYSTEM",
      });

      logger.info("Default SUPER8 config created");
    }
  } catch (error) {
    logger.error("Error initializing default configs", { error });
    // Don't throw - system should still work with hardcoded configs
  }
};
