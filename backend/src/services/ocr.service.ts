import { createWorker, Worker, RecognizeResult, PSM } from "tesseract.js";
import { preprocessImage } from "../utils/image-processor";
import {
  hasExtractableText,
  extractTextFromPDF,
  convertPDFToImages,
} from "../utils/pdf-converter";
import {
  analyzeImageQuality,
  isAcceptableQuality,
} from "./image-quality.service";
import { OCRResult } from "../../../shared/types/pod-schema";
import { createModuleLogger } from "../middleware/logger";
import path from "path";
import fs from "fs";

const logger = createModuleLogger("OCRService");

/**
 * Tesseract Worker Pool
 * Reuse workers for better performance
 */
let workerPool: Worker[] = [];
const WORKER_POOL_SIZE = 1; // Reduced for low-memory environments
let lastWorkerUsage = Date.now();
const WORKER_IDLE_TIMEOUT = 60000; // Terminate idle workers after 60 seconds

/**
 * Initialize Tesseract Worker Pool
 */
const initializeWorkerPool = async (): Promise<void> => {
  if (workerPool.length > 0) {
    return; // Already initialized
  }

  logger.info("Initializing Tesseract worker pool", {
    poolSize: WORKER_POOL_SIZE,
  });

  const language = process.env.TESSERACT_LANG || "eng";

  for (let i = 0; i < WORKER_POOL_SIZE; i++) {
    const worker = await createWorker(language, 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          logger.debug(
            `Tesseract worker ${i}: ${m.status} ${(m.progress * 100).toFixed(
              0
            )}%`
          );
        }
      },
    });

    workerPool.push(worker);
  }

  logger.info("Tesseract worker pool initialized");
};

/**
 * Get available worker from pool
 */
const getWorker = async (): Promise<Worker> => {
  if (workerPool.length === 0) {
    await initializeWorkerPool();
  }

  // Simple round-robin selection
  return workerPool[Math.floor(Math.random() * workerPool.length)];
};

/**
 * Extract text from image using Tesseract.js
 */
export const extractTextFromImage = async (
  imagePath: string
): Promise<OCRResult> => {
  try {
    logger.info("Starting OCR on image", { imagePath });

    // Analyze image quality first
    const quality = await analyzeImageQuality(imagePath);

    // Preprocess image for better OCR results
    let processedImagePath = imagePath;
    try {
      processedImagePath = await preprocessImage(imagePath);
    } catch (preprocessError) {
      logger.warn("Image preprocessing failed, using original", {
        imagePath,
        error: preprocessError,
      });
    }

    // Get worker from pool
    const worker = await getWorker();

    // Configure Tesseract for better form document recognition
    // PSM 3 = Fully automatic page segmentation, but no OSD (best for forms)
    // OEM 1 = Neural nets LSTM engine only (best accuracy)
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO, // Auto page segmentation
      tessedit_ocr_engine_mode: "1", // LSTM neural net
      preserve_interword_spaces: "1", // Keep spacing
    });

    // Perform OCR with multiple attempts for better accuracy
    let result: RecognizeResult;
    try {
      // First attempt with standard settings
      result = await worker.recognize(processedImagePath);

      // If confidence is low, try again with different PSM mode for sparse text
      if (result.data.confidence < 60) {
        logger.info("Low confidence detected, trying alternative OCR mode", {
          imagePath,
          firstConfidence: result.data.confidence,
        });

        // PSM 6 = Assume a single uniform block of text (better for stamps/forms)
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        });

        const result2 = await worker.recognize(processedImagePath);

        // Use whichever result has higher confidence
        if (result2.data.confidence > result.data.confidence) {
          logger.info("Alternative mode produced better results", {
            originalConfidence: result.data.confidence,
            newConfidence: result2.data.confidence,
          });
          result = result2;
        }
      }
    } catch (ocrError) {
      logger.error("OCR recognition failed", { imagePath, error: ocrError });
      throw ocrError;
    }

    // Clean up processed image if different from original
    if (processedImagePath !== imagePath && fs.existsSync(processedImagePath)) {
      try {
        await fs.promises.unlink(processedImagePath);
      } catch (err) {
        // Ignore cleanup errors
      }
    }

    const ocrResult: OCRResult = {
      text: result.data.text,
      confidence: result.data.confidence,
      quality: {
        blurry: quality.isBlurry,
        blurScore: quality.blurScore,
        lowContrast: quality.isLowContrast,
      },
    };

    logger.info("OCR complete", {
      imagePath,
      textLength: ocrResult.text.length,
      confidence: ocrResult.confidence.toFixed(2),
      isBlurry: quality.isBlurry,
    });

    return ocrResult;
  } catch (error) {
    logger.error("Error extracting text from image", { imagePath, error });
    throw error;
  }
};

/**
 * Extract text from PDF
 * Attempts direct text extraction first, falls back to OCR if needed
 */
export const extractTextFromPDFDocument = async (
  pdfPath: string
): Promise<OCRResult> => {
  try {
    logger.info("Starting PDF text extraction", { pdfPath });

    // Check if PDF has extractable text
    const hasText = await hasExtractableText(pdfPath);

    if (hasText) {
      // Direct text extraction
      logger.info("PDF has extractable text, using direct extraction");
      const text = await extractTextFromPDF(pdfPath);

      return {
        text,
        confidence: 100, // Direct extraction is 100% confident
        quality: {
          blurry: false,
          blurScore: 1000,
          lowContrast: false,
        },
      };
    } else {
      // Convert PDF to images and perform OCR
      logger.info("PDF is scanned, converting to images for OCR");
      const imagePaths = await convertPDFToImages(pdfPath);

      if (imagePaths.length === 0) {
        throw new Error("Failed to convert PDF to images");
      }

      // Perform OCR on all pages
      const ocrResults: OCRResult[] = [];

      for (const imagePath of imagePaths) {
        try {
          const result = await extractTextFromImage(imagePath);
          ocrResults.push(result);

          // Clean up temporary image
          await fs.promises.unlink(imagePath);
        } catch (pageError) {
          logger.error("Error processing PDF page", {
            imagePath,
            error: pageError,
          });
          // Continue with other pages
        }
      }

      if (ocrResults.length === 0) {
        throw new Error("Failed to extract text from any PDF page");
      }

      // Combine results from all pages
      const combinedText = ocrResults
        .map((r) => r.text)
        .join("\n\n--- PAGE BREAK ---\n\n");
      const avgConfidence =
        ocrResults.reduce((sum, r) => sum + r.confidence, 0) /
        ocrResults.length;
      const worstQuality = ocrResults.reduce((worst, r) => {
        return r.quality.blurScore < worst.blurScore ? r.quality : worst;
      }, ocrResults[0].quality);

      logger.info("PDF OCR complete", {
        pdfPath,
        pages: ocrResults.length,
        textLength: combinedText.length,
        avgConfidence: avgConfidence.toFixed(2),
      });

      return {
        text: combinedText,
        confidence: avgConfidence,
        quality: worstQuality,
      };
    }
  } catch (error) {
    logger.error("Error extracting text from PDF", { pdfPath, error });
    throw error;
  }
};

/**
 * Extract text from file (auto-detect type)
 */
export const extractText = async (
  filePath: string,
  mimeType: string
): Promise<OCRResult> => {
  try {
    logger.info("Extracting text from file", { filePath, mimeType });

    let result: OCRResult;
    
    if (mimeType === "application/pdf") {
      result = await extractTextFromPDFDocument(filePath);
    } else if (mimeType.startsWith("image/")) {
      result = await extractTextFromImage(filePath);
    } else {
      throw new Error(`Unsupported file type for OCR: ${mimeType}`);
    }

    // Aggressive memory cleanup for free tier (512MB limit)
    // Force garbage collection if available
    if (global.gc) {
      logger.debug("Triggering garbage collection after OCR");
      global.gc();
    }

    lastWorkerUsage = Date.now();
    
    return result;
  } catch (error) {
    logger.error("Error extracting text", { filePath, mimeType, error });
    throw error;
  }
};

/**
 * Terminate idle workers to free memory
 */
const terminateIdleWorkers = async (): Promise<void> => {
  const idleTime = Date.now() - lastWorkerUsage;
  
  if (idleTime > WORKER_IDLE_TIMEOUT && workerPool.length > 0) {
    logger.info("Terminating idle Tesseract workers to free memory", {
      idleTimeSeconds: Math.floor(idleTime / 1000)
    });
    
    await cleanupWorkerPool();
  }
};

/**
 * Cleanup worker pool (call on app shutdown)
 */
export const cleanupWorkerPool = async (): Promise<void> => {
  logger.info("Cleaning up Tesseract worker pool");

  for (const worker of workerPool) {
    await worker.terminate();
  }

  workerPool = [];
  logger.info("Tesseract worker pool cleaned up");
};

// Periodically check and terminate idle workers
setInterval(terminateIdleWorkers, 30000); // Check every 30 seconds

// Handle process termination
process.on("SIGINT", async () => {
  await cleanupWorkerPool();
});

process.on("SIGTERM", async () => {
  await cleanupWorkerPool();
});
