import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { connectDatabase } from "./config/database";
import { logger, httpLogger } from "./middleware/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { initializeValidationRegistry } from "./services/validation-registry.service";
import { initializeDefaultConfigs } from "./services/client-config.service";
import routes from "./routes";

// Load environment variables
dotenv.config();

/**
 * Initialize Express Application
 */
const app: Application = express();
const PORT = process.env.PORT || 3000;

/**
 * Ensure required directories exist
 */
const ensureDirectories = () => {
  const directories = [
    path.join(__dirname, "../uploads"),
    path.join(__dirname, "../logs"),
  ];

  directories.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created directory: ${dir}`);
    }
  });
};

/**
 * Security Middleware
 */
const configureSecurityMiddleware = () => {
  // Helmet for security headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin resources for file uploads
    })
  );

  // CORS configuration - Allow Netlify frontend
  app.use(
    cors({
      origin: '*',
      credentials: false,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    })
  );

  // Rate limiting - disabled for development (uncomment for production)
  // const limiter = rateLimit({
  //   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'), // 1 minute
  //   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // 1000 requests per minute
  //   message: {
  //     success: false,
  //     error: {
  //       code: 'RATE_LIMIT_EXCEEDED',
  //       message: 'Too many requests from this IP, please try again later',
  //     },
  //   },
  //   standardHeaders: true,
  //   legacyHeaders: false,
  // });
  // app.use('/api/', limiter);
};

/**
 * General Middleware
 */
const configureMiddleware = () => {
  // Body parsing middleware
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // HTTP request logging
  app.use(httpLogger);

  // Serve uploaded files statically (for development/testing)
  app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
};

/**
 * Configure Routes
 */
const configureRoutes = () => {
  // API routes
  app.use("/api/v1", routes);

  // Root endpoint
  app.get("/", (_req, res) => {
    res.json({
      message: "POD Validation API",
      version: "1.0.0",
      documentation: "/api/v1/info",
      health: "/api/v1/health",
    });
  });

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);
};

/**
 * Start Server
 */
const startServer = async () => {
  try {
    // Ensure directories exist
    ensureDirectories();

    // Connect to database
    await connectDatabase();

    // Initialize default client configs (SUPER8 if not exists)
    await initializeDefaultConfigs();

    // Initialize validation registry with customer-specific validators
    await initializeValidationRegistry();

    // Configure middleware
    configureSecurityMiddleware();
    configureMiddleware();
    configureRoutes();

    // Start listening
    app.listen(PORT, () => {
      logger.info(`Server started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || "development",
        pid: process.pid,
      });
      logger.info(`API available at http://localhost:${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/api/v1/health`);
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  // Don't exit if it's a MongoDB connection error - we handle those gracefully
  if (
    reason &&
    typeof reason === "object" &&
    "name" in reason &&
    (reason.name === "MongooseServerSelectionError" ||
      reason.name === "MongooseError")
  ) {
    logger.warn(
      "MongoDB connection error caught in unhandledRejection handler - server will continue"
    );
    return;
  }
  process.exit(1);
});

// Start the server
startServer();

export default app;
