import {
  getImageMetadata,
  calculateContrast,
  calculateLaplacianVariance,
} from '../utils/image-processor';
import { QualityMetrics } from '../../../shared/types/pod-schema';
import { createModuleLogger } from '../middleware/logger';

const logger = createModuleLogger('ImageQualityService');

/**
 * Quality Thresholds (configurable via environment)
 */
const THRESHOLDS = {
  BLUR_THRESHOLD: parseFloat(process.env.BLUR_THRESHOLD || '100'),
  CONTRAST_THRESHOLD: 15, // Minimum contrast percentage
  MIN_WIDTH: 400,
  MIN_HEIGHT: 400,
  MIN_RESOLUTION: 160000, // 400x400
};

/**
 * Analyze Image Quality
 * Detects blur, low contrast, and low resolution
 */
export const analyzeImageQuality = async (imagePath: string): Promise<QualityMetrics> => {
  try {
    logger.info('Analyzing image quality', { imagePath });

    // Get image metadata
    const metadata = await getImageMetadata(imagePath);

    // Calculate blur score (Laplacian variance)
    const blurScore = await calculateLaplacianVariance(imagePath);

    // Calculate contrast
    const contrast = await calculateContrast(imagePath);

    // Determine quality issues
    const isBlurry = blurScore < THRESHOLDS.BLUR_THRESHOLD;
    const isLowContrast = contrast < THRESHOLDS.CONTRAST_THRESHOLD;
    const isLowResolution =
      metadata.width < THRESHOLDS.MIN_WIDTH ||
      metadata.height < THRESHOLDS.MIN_HEIGHT ||
      (metadata.width * metadata.height) < THRESHOLDS.MIN_RESOLUTION;

    const qualityMetrics: QualityMetrics = {
      blurScore: Math.round(blurScore * 100) / 100,
      contrast: Math.round(contrast * 100) / 100,
      resolution: {
        width: metadata.width,
        height: metadata.height,
      },
      isBlurry,
      isLowContrast,
      isLowResolution,
    };

    logger.info('Image quality analysis complete', {
      imagePath,
      metrics: qualityMetrics,
    });

    return qualityMetrics;
  } catch (error) {
    logger.error('Error analyzing image quality', { imagePath, error });
    throw error;
  }
};

/**
 * Check if image quality is acceptable for OCR
 */
export const isAcceptableQuality = (metrics: QualityMetrics): boolean => {
  return !metrics.isBlurry && !metrics.isLowContrast && !metrics.isLowResolution;
};

/**
 * Get quality description
 */
export const getQualityDescription = (metrics: QualityMetrics): string => {
  const issues: string[] = [];

  if (metrics.isBlurry) {
    issues.push(`blurry (score: ${metrics.blurScore})`);
  }

  if (metrics.isLowContrast) {
    issues.push(`low contrast (${metrics.contrast}%)`);
  }

  if (metrics.isLowResolution) {
    issues.push(`low resolution (${metrics.resolution.width}x${metrics.resolution.height})`);
  }

  if (issues.length === 0) {
    return 'Good quality';
  }

  return `Quality issues detected: ${issues.join(', ')}`;
};

/**
 * Determine if image is incomplete or cropped
 * Simple heuristic: check if image has very small dimensions or unusual aspect ratio
 */
export const isImageIncomplete = (metrics: QualityMetrics): boolean => {
  const { width, height } = metrics.resolution;

  // Check for very small dimensions
  if (width < 200 || height < 200) {
    return true;
  }

  // Check for unusual aspect ratios (likely cropped)
  const aspectRatio = width / height;
  if (aspectRatio > 5 || aspectRatio < 0.2) {
    return true;
  }

  return false;
};
