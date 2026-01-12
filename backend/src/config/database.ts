import mongoose from "mongoose";
import { logger } from "../middleware/logger";

/**
 * Connect to MongoDB
 */
export const connectDatabase = async (): Promise<void> => {
  try {
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://localhost:27017/pod_validation";

    // Check if MongoDB URI is configured
    if (!process.env.MONGODB_URI) {
      logger.warn(
        "MONGODB_URI not set in environment variables, using default: mongodb://localhost:27017/pod_validation"
      );
    }

    // Connection options
    const options = {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 30000, // Increased from 5000 to 30000
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4 to avoid IPv6 DNS issues
    };

    // Set up connection event handlers BEFORE connecting
    mongoose.connection.on("error", (err) => {
      logger.error("MongoDB connection error:", err);
    });

    mongoose.connection.on("disconnected", () => {
      logger.warn("MongoDB disconnected");
    });

    mongoose.connection.on("reconnected", () => {
      logger.info("MongoDB reconnected");
    });

    // Connect to MongoDB
    await mongoose.connect(mongoUri, options);

    logger.info("MongoDB connected successfully", {
      host: mongoose.connection.host,
      database: mongoose.connection.name,
    });
  } catch (error) {
    logger.error("MongoDB connection failed:", error);
    logger.warn(
      "Application will continue without database. Database operations will fail until MongoDB is available."
    );
    // Don't exit - allow app to start even if MongoDB is not available
    // This is useful for development when MongoDB might be set up later
  }
};

/**
 * Check if database is connected
 */
export const isDatabaseConnected = (): boolean => {
  return mongoose.connection.readyState === 1;
};

/**
 * Get database connection status
 */
export const getDatabaseStatus = (): "connected" | "disconnected" => {
  return mongoose.connection.readyState === 1 ? "connected" : "disconnected";
};
