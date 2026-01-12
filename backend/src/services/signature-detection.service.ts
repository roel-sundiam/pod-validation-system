import sharp from "sharp";
import { SignatureDetectionResult } from "../../../shared/types/pod-schema";
import { createModuleLogger } from "../middleware/logger";

const logger = createModuleLogger("SignatureDetectionService");

/**
 * Signature Detection Configuration
 */
const CONFIG = {
  MIN_SIGNATURE_WIDTH: 50,
  MIN_SIGNATURE_HEIGHT: 20,
  MAX_SIGNATURE_WIDTH: 350,  // Slightly increased for better coverage
  MAX_SIGNATURE_HEIGHT: 180, // Slightly increased
  MIN_DENSITY_THRESHOLD: 0.04, // Slightly more sensitive than original 0.05
  MAX_DENSITY_THRESHOLD: 0.95,
};

/**
 * Detected Region
 */
interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
  density: number;
}

/**
 * Analyze image to detect potential signature regions
 * This is a simple heuristic-based approach
 */
export const detectSignatures = async (
  imagePath: string
): Promise<SignatureDetectionResult> => {
  try {
    logger.info("Detecting signatures in image", { imagePath });

    // Load image and convert to grayscale
    const image = sharp(imagePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error("Unable to read image dimensions");
    }

    const { data, info } = await image
      .grayscale()
      .normalize() // Enhance contrast
      .threshold(128) // Binarize image
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;

    logger.debug("Image processed for signature detection", {
      width,
      height,
      dataSize: data.length,
    });

    // Scan image in grid pattern for potential signature regions
    const regions: Region[] = [];
    const stepSize = 20; // Scan grid step size

    for (let y = 0; y < height - CONFIG.MIN_SIGNATURE_HEIGHT; y += stepSize) {
      for (let x = 0; x < width - CONFIG.MIN_SIGNATURE_WIDTH; x += stepSize) {
        // Check multiple region sizes
        for (const regionWidth of [100, 150, 200, 250]) {
          for (const regionHeight of [40, 60, 80, 100]) {
            if (x + regionWidth > width || y + regionHeight > height) continue;

            const density = calculateRegionDensity(
              data,
              width,
              height,
              x,
              y,
              regionWidth,
              regionHeight
            );

            // Check if density matches signature characteristics
            if (
              density >= CONFIG.MIN_DENSITY_THRESHOLD &&
              density <= CONFIG.MAX_DENSITY_THRESHOLD
            ) {
              regions.push({
                x,
                y,
                width: regionWidth,
                height: regionHeight,
                density,
              });
            }
          }
        }
      }
    }

    // Merge overlapping regions and filter duplicates
    const mergedRegions = mergeOverlappingRegions(regions);

    // Filter regions that are too large or too small
    const filteredRegions = mergedRegions.filter(
      (r) =>
        r.width >= CONFIG.MIN_SIGNATURE_WIDTH &&
        r.width <= CONFIG.MAX_SIGNATURE_WIDTH &&
        r.height >= CONFIG.MIN_SIGNATURE_HEIGHT &&
        r.height <= CONFIG.MAX_SIGNATURE_HEIGHT
    );

    // Sort by density (higher density likely signature)
    const sortedRegions = filteredRegions.sort((a, b) => b.density - a.density);

    // Take top candidates from BOTH sides to ensure we don't miss signatures
    // Get best candidates from left and right sides separately
    const leftSideRegions = sortedRegions.filter((r) => r.x < width / 2);
    const rightSideRegions = sortedRegions.filter((r) => r.x >= width / 2);

    // Take top 2 from each side to ensure we catch both driver and receiver
    const selectedRegions = [
      ...leftSideRegions.slice(0, 2),
      ...rightSideRegions.slice(0, 2)
    ];

    const signatureRegions = selectedRegions.length > 0 ? selectedRegions : sortedRegions.slice(0, 4);

    // Classify signatures (driver vs receiver) based on position
    // Simple heuristic: left side = driver, right side = receiver
    const driverPresent = signatureRegions.some((r) => r.x < width / 2);
    const receiverPresent = signatureRegions.some((r) => r.x >= width / 2);

    // Calculate overall confidence based on number and quality of detections
    let confidence = 0;
    if (signatureRegions.length > 0) {
      const validDensities = signatureRegions
        .map((r) => r.density)
        .filter((d) => typeof d === "number" && !isNaN(d));
      const avgDensity =
        validDensities.length > 0
          ? validDensities.reduce((sum, d) => sum + d, 0) /
            validDensities.length
          : 0;
      const calculatedConfidence =
        (signatureRegions.length / 2) * 50 + avgDensity * 50;
      confidence = Math.min(100, calculatedConfidence);
    }

    // Ensure confidence is always a valid number
    const finalConfidence =
      isNaN(confidence) || !isFinite(confidence) ? 0 : Math.round(confidence);

    const result: SignatureDetectionResult = {
      found: signatureRegions.length,
      driverPresent,
      receiverPresent,
      confidence:
        typeof finalConfidence === "number" && !isNaN(finalConfidence)
          ? finalConfidence
          : 0,
      regions: signatureRegions.map((r) => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        isRightSide: width > 0 ? r.x >= width / 2 : false, // Classify side based on position
      })),
    };

    logger.info("Signature detection complete", {
      imagePath,
      found: result.found,
      driverPresent: result.driverPresent,
      receiverPresent: result.receiverPresent,
      confidence: result.confidence,
    });

    return result;
  } catch (error) {
    logger.error("Error detecting signatures", { imagePath, error });

    // Return default result on error
    return {
      found: 0,
      driverPresent: false,
      receiverPresent: false,
      confidence: 0,
      regions: [],
    };
  }
};

/**
 * Calculate pixel density in a region
 * Density = (number of dark pixels) / (total pixels)
 */
const calculateRegionDensity = (
  imageData: Buffer,
  imageWidth: number,
  imageHeight: number,
  x: number,
  y: number,
  regionWidth: number,
  regionHeight: number
): number => {
  let darkPixels = 0;
  let totalPixels = 0;

  for (let dy = 0; dy < regionHeight; dy++) {
    for (let dx = 0; dx < regionWidth; dx++) {
      const px = x + dx;
      const py = y + dy;

      if (px >= imageWidth || py >= imageHeight) continue;

      const index = py * imageWidth + px;
      const pixel = imageData[index];

      totalPixels++;

      // In binary image, 0 is dark (signature ink), 255 is white (background)
      if (pixel < 128) {
        darkPixels++;
      }
    }
  }

  return totalPixels > 0 ? darkPixels / totalPixels : 0;
};

/**
 * Merge overlapping regions
 */
const mergeOverlappingRegions = (regions: Region[]): Region[] => {
  if (regions.length === 0) return [];

  const merged: Region[] = [];
  const used: boolean[] = new Array(regions.length).fill(false);

  for (let i = 0; i < regions.length; i++) {
    if (used[i]) continue;

    let current = regions[i];
    used[i] = true;

    // Find all overlapping regions
    for (let j = i + 1; j < regions.length; j++) {
      if (used[j]) continue;

      if (regionsOverlap(current, regions[j])) {
        current = mergeRegions(current, regions[j]);
        used[j] = true;
      }
    }

    merged.push(current);
  }

  return merged;
};

/**
 * Check if two regions overlap
 */
const regionsOverlap = (a: Region, b: Region): boolean => {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
};

/**
 * Merge two regions into bounding box
 */
const mergeRegions = (a: Region, b: Region): Region => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);

  return {
    x,
    y,
    width: x2 - x,
    height: y2 - y,
    density: (a.density + b.density) / 2,
  };
};

/**
 * Simple text-based signature detection from OCR text
 * Looks for common signature indicators in text
 */
export const detectSignaturesFromText = (
  ocrText: string
): SignatureDetectionResult => {
  const lowerText = ocrText.toLowerCase();

  // Look for signature-related keywords
  const hasDriverSignature =
    /driver\s*signature|delivered\s*by|courier\s*signature/i.test(ocrText);
  const hasReceiverSignature =
    /recipient\s*signature|receiver\s*signature|received\s*by|customer\s*signature/i.test(
      ocrText
    );

  // Look for "signed" or "signature" mentions
  const signatureMatches = ocrText.match(/signature|signed/gi) || [];

  return {
    found: signatureMatches.length,
    driverPresent: hasDriverSignature,
    receiverPresent: hasReceiverSignature,
    confidence: signatureMatches.length > 0 ? 50 : 0,
    regions: [],
  };
};

/**
 * Combine image-based and text-based signature detection
 */
export const detectSignaturesCombined = async (
  imagePath: string,
  ocrText: string
): Promise<SignatureDetectionResult> => {
  const imageResult = await detectSignatures(imagePath);
  const textResult = detectSignaturesFromText(ocrText);

  // Merge results (prioritize image detection, supplement with text)
  const imageConfidence =
    typeof imageResult.confidence === "number" &&
    !isNaN(imageResult.confidence) &&
    isFinite(imageResult.confidence)
      ? imageResult.confidence
      : 0;
  const textConfidence =
    typeof textResult.confidence === "number" &&
    !isNaN(textResult.confidence) &&
    isFinite(textResult.confidence)
      ? textResult.confidence
      : 0;
  const avgConfidence = (imageConfidence + textConfidence) / 2;

  // Ensure final confidence is always a valid number (0-100)
  let finalConfidence = 0;
  if (
    typeof avgConfidence === "number" &&
    !isNaN(avgConfidence) &&
    isFinite(avgConfidence)
  ) {
    finalConfidence = Math.max(0, Math.min(100, Math.round(avgConfidence)));
  }

  const combined: SignatureDetectionResult = {
    found: Math.max(imageResult.found, textResult.found || 0),
    driverPresent:
      imageResult.driverPresent || textResult.driverPresent || false,
    receiverPresent:
      imageResult.receiverPresent || textResult.receiverPresent || false,
    confidence: finalConfidence,
    regions: imageResult.regions || [],
  };

  logger.info("Combined signature detection", combined);

  return combined;
};
