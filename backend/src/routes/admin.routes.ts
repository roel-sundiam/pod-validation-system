import { Router } from "express";
import * as clientConfigController from "../controllers/client-config.controller";

const router = Router();

/**
 * @route GET /api/admin/clients
 * @desc Get all client validation configs
 */
router.get("/clients", clientConfigController.getAllClients);

/**
 * @route GET /api/admin/clients/:clientId
 * @desc Get specific client validation config
 */
router.get("/clients/:clientId", clientConfigController.getClientConfig);

/**
 * @route POST /api/admin/clients
 * @desc Create new client validation config
 */
router.post("/clients", clientConfigController.createClientConfig);

/**
 * @route PUT /api/admin/clients/:clientId
 * @desc Update existing client validation config
 */
router.put("/clients/:clientId", clientConfigController.updateClientConfig);

/**
 * @route DELETE /api/admin/clients/:clientId
 * @desc Deactivate client validation config
 */
router.delete("/clients/:clientId", clientConfigController.deactivateClient);

/**
 * @route POST /api/admin/clients/cache/clear
 * @desc Clear client config cache
 */
router.post("/clients/cache/clear", clientConfigController.clearCache);

/**
 * @route GET /api/admin/clients/:clientId/preview
 * @desc Preview what validation checks would run for this client
 */
router.get(
  "/clients/:clientId/preview",
  clientConfigController.previewValidationChecks
);

export default router;
