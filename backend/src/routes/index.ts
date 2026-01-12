import { Router } from "express";
import { getDatabaseStatus } from "../config/database";

const router = Router();

/**
 * Health Check Endpoint
 * GET /api/v1/health
 */
router.get("/health", (req, res) => {
  const dbStatus = getDatabaseStatus();
  const isHealthy = dbStatus === "connected";

  res.status(isHealthy ? 200 : 503).json({
    success: true,
    data: {
      status: isHealthy ? "healthy" : "degraded",
      database: dbStatus,
      ocrService: "available", // Tesseract.js is always available
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * API Info Endpoint
 * GET /api/v1/info
 */
router.get("/info", (req, res) => {
  res.json({
    success: true,
    data: {
      name: "POD Validation API",
      version: "1.0.0",
      description:
        "Multi-customer POD validation system with OCR and document classification",
      features: [
        "Multi-customer support (Super 8, Walmart, Target, etc.)",
        "Batch document upload",
        "Automatic document type classification",
        "Stamp and signature detection",
        "Cross-document validation",
        "Context-aware validation rules",
      ],
      endpoints: {
        health: "/api/v1/health",
        // Single document endpoints
        uploadPOD: "/api/v1/pods/upload",
        pods: "/api/v1/pods",
        statistics: "/api/v1/statistics/summary",
        // Multi-document delivery endpoints
        uploadDelivery: "/api/v1/deliveries/upload",
        deliveries: "/api/v1/deliveries",
        deliveryValidation: "/api/v1/deliveries/:id/validation",
      },
    },
  });
});

// Import route modules
import uploadRoutes from "./upload.routes";
import resultsRoutes from "./results.routes";
import statisticsRoutes from "./statistics.routes";
import deliveryRoutes from "./delivery.routes";
import adminRoutes from "./admin.routes";

// Mount routes
router.use("/pods", uploadRoutes);
router.use("/pods", resultsRoutes);
router.use("/statistics", statisticsRoutes);
router.use("/deliveries", deliveryRoutes); // Multi-document delivery routes
router.use("/admin", adminRoutes); // Admin configuration routes

export default router;
