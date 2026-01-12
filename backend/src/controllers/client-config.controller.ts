import { Request, Response, NextFunction } from "express";
import * as clientConfigService from "../services/client-config.service";
import { ValidationRuleSet } from "../../../shared/types/client-config.schema";
import { createModuleLogger } from "../middleware/logger";

const logger = createModuleLogger("ClientConfigController");

/**
 * Get all active client configs
 */
export const getAllClients = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const clients = await clientConfigService.getAllClientConfigs();

    res.json({
      success: true,
      data: clients,
      count: clients.length,
    });
  } catch (error) {
    logger.error("Error fetching all clients", { error });
    next(error);
  }
};

/**
 * Get specific client config
 */
export const getClientConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { clientId } = req.params;

    const config = await clientConfigService.getClientConfigById(clientId);

    if (!config) {
      res.status(404).json({
        success: false,
        error: `Client config not found: ${clientId}`,
      });
      return;
    }

    // Check if this is using hardcoded config
    const hasCustom = await clientConfigService.hasCustomConfig(clientId);

    res.json({
      success: true,
      data: config,
      meta: {
        hasCustomConfig: hasCustom,
        isHardcoded: !hasCustom && clientId.toUpperCase() === "SUPER8",
      },
    });
  } catch (error) {
    logger.error("Error fetching client config", {
      clientId: req.params.clientId,
      error,
    });
    next(error);
  }
};

/**
 * Create new client config
 */
export const createClientConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { clientId, clientName, description, validationRules } = req.body;

    // Validation
    if (!clientId || !clientName || !validationRules) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: clientId, clientName, validationRules",
      });
      return;
    }

    // Check if already exists
    const existing = await clientConfigService.getClientConfigById(clientId);
    if (existing) {
      res.status(409).json({
        success: false,
        error: `Client config already exists: ${clientId}. Use PUT to update.`,
      });
      return;
    }

    const updatedBy = req.body.updatedBy || "ADMIN"; // TODO: Get from auth context

    const config = await clientConfigService.saveClientConfig(
      clientId,
      clientName,
      validationRules as ValidationRuleSet,
      updatedBy,
      description
    );

    logger.info("Client config created", { clientId, createdBy: updatedBy });

    res.status(201).json({
      success: true,
      data: config,
      message: `Client config created: ${clientId}`,
    });
  } catch (error) {
    logger.error("Error creating client config", { body: req.body, error });
    next(error);
  }
};

/**
 * Update existing client config
 */
export const updateClientConfig = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { clientId } = req.params;
    const { clientName, description, validationRules } = req.body;

    // Validation
    if (!clientName || !validationRules) {
      res.status(400).json({
        success: false,
        error: "Missing required fields: clientName, validationRules",
      });
      return;
    }

    // Check if exists
    const existing = await clientConfigService.getClientConfigById(clientId);
    if (!existing) {
      res.status(404).json({
        success: false,
        error: `Client config not found: ${clientId}. Use POST to create.`,
      });
      return;
    }

    const updatedBy = req.body.updatedBy || "ADMIN"; // TODO: Get from auth context

    const config = await clientConfigService.saveClientConfig(
      clientId,
      clientName,
      validationRules as ValidationRuleSet,
      updatedBy,
      description
    );

    logger.info("Client config updated", { clientId, updatedBy });

    res.json({
      success: true,
      data: config,
      message: `Client config updated: ${clientId}`,
    });
  } catch (error) {
    logger.error("Error updating client config", {
      clientId: req.params.clientId,
      error,
    });
    next(error);
  }
};

/**
 * Deactivate client config (soft delete)
 */
export const deactivateClient = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { clientId } = req.params;

    // Prevent deactivating SUPER8
    if (clientId.toUpperCase() === "SUPER8") {
      res.status(403).json({
        success: false,
        error: "Cannot deactivate SUPER8 config",
      });
      return;
    }

    const deactivatedBy = req.body.deactivatedBy || "ADMIN"; // TODO: Get from auth context

    await clientConfigService.deactivateClientConfig(clientId, deactivatedBy);

    logger.info("Client config deactivated", { clientId, deactivatedBy });

    res.json({
      success: true,
      message: `Client config deactivated: ${clientId}`,
    });
  } catch (error) {
    logger.error("Error deactivating client config", {
      clientId: req.params.clientId,
      error,
    });
    next(error);
  }
};

/**
 * Clear client config cache
 */
export const clearCache = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { clientId } = req.body;

    clientConfigService.clearClientCache(clientId);

    logger.info("Cache cleared", { clientId: clientId || "ALL" });

    res.json({
      success: true,
      message: clientId
        ? `Cache cleared for: ${clientId}`
        : "All cache cleared",
    });
  } catch (error) {
    logger.error("Error clearing cache", { error });
    next(error);
  }
};

/**
 * Preview validation checks for a client
 * Returns a summary of what checks would be performed
 */
export const previewValidationChecks = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { clientId } = req.params;

    const config = await clientConfigService.getClientValidationConfig(
      clientId
    );

    // Build a human-readable summary
    const summary = {
      clientId: clientId.toUpperCase(),
      documentCompleteness: {
        required: [] as string[],
        optional: [] as string[],
        scenario: config.documentCompleteness.palletScenario,
      },
      validationChecks: {
        palletDocuments: config.palletValidation.enabled,
        shipDocument: config.shipDocumentValidation.enabled,
        invoice: config.invoiceValidation.enabled,
        crossDocument: config.crossDocumentValidation.enabled,
      },
      details: {
        palletValidation: config.palletValidation.enabled
          ? {
              warehouseStamp: config.palletValidation.requireWarehouseStamp,
              warehouseSignature:
                config.palletValidation.requireWarehouseSignature,
              customerSignature:
                config.palletValidation.requireCustomerSignature,
              driverSignature: config.palletValidation.requireDriverSignature,
              loscamStamp: config.palletValidation.requireLoscamStamp,
            }
          : null,
        shipDocument: config.shipDocumentValidation.enabled
          ? {
              dispatchStamp: config.shipDocumentValidation.requireDispatchStamp,
              palletStamp: config.shipDocumentValidation.requirePalletStamp,
              noPalletStamp: config.shipDocumentValidation.requireNoPalletStamp,
              securitySignature:
                config.shipDocumentValidation.requireSecuritySignature,
              timeOutField: config.shipDocumentValidation.requireTimeOutField,
              driverSignature:
                config.shipDocumentValidation.requireDriverSignature,
            }
          : null,
        invoice: config.invoiceValidation.enabled
          ? {
              poMatch: config.invoiceValidation.requirePOMatch,
              totalCasesMatch: config.invoiceValidation.requireTotalCasesMatch,
              itemLevelMatch: config.invoiceValidation.requireItemLevelMatch,
              allowedVariance:
                config.invoiceValidation.allowedVariancePercent + "%",
              compareFields: config.invoiceValidation.compareFields,
            }
          : null,
        crossDocument: config.crossDocumentValidation.enabled
          ? {
              invoiceRARComparison:
                config.crossDocumentValidation.validateInvoiceRAR,
              allowedDiscrepancies:
                config.crossDocumentValidation.allowedDiscrepancyCount,
              strictMode: config.crossDocumentValidation.strictMode,
            }
          : null,
      },
    };

    // Build required/optional document lists
    const docComp = config.documentCompleteness;
    if (docComp.requireInvoice)
      summary.documentCompleteness.required.push("Invoice");
    if (docComp.requireRAR) summary.documentCompleteness.required.push("RAR");
    if (docComp.requireShipDocument)
      summary.documentCompleteness.required.push("Ship Document");
    if (docComp.requirePalletNotificationLetter)
      summary.documentCompleteness.required.push("Pallet Notification Letter");
    if (docComp.requireLoscamDocument)
      summary.documentCompleteness.required.push("Loscam Document");
    if (docComp.requireCustomerPalletReceiving)
      summary.documentCompleteness.required.push("Customer Pallet Receiving");

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    logger.error("Error previewing validation checks", {
      clientId: req.params.clientId,
      error,
    });
    next(error);
  }
};
