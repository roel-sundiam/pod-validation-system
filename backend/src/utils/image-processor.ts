import sharp from 'sharp';
import path from 'path';
import { createModuleLogger } from '../middleware/logger';

const logger = createModuleLogger('ImageProcessor');

/**
 * Image Processing Options
 */
export interface ImageProcessingOptions {
  enhanceContrast?: boolean;
  grayscale?: boolean;
  denoise?: boolean;
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  };
}

/**
 * Preprocess image for better OCR results
 */
export const preprocessImage = async (
  inputPath: string,
  outputPath?: string,
  options: ImageProcessingOptions = {}
): Promise<string> => {
  try {
    const {
      enhanceContrast = true,
      grayscale = true,
      denoise = true,
      resize,
    } = options;

    // If no output path, create one with _processed suffix
    if (!outputPath) {
      const ext = path.extname(inputPath);
      const basename = path.basename(inputPath, ext);
      const dirname = path.dirname(inputPath);
      outputPath = path.join(dirname, `${basename}_processed${ext}`);
    }

    let pipeline = sharp(inputPath);

    // Resize if specified
    if (resize) {
      pipeline = pipeline.resize(resize.width, resize.height, {
        fit: resize.fit || 'inside',
        withoutEnlargement: true,
      });
    }

    // Convert to grayscale
    if (grayscale) {
      pipeline = pipeline.grayscale();
    }

    // Enhance contrast
    if (enhanceContrast) {
      pipeline = pipeline
        .normalize() // Auto-level contrast
        .linear(1.2, -(128 * 0.2)); // Increase contrast further: 1.2x brightness, adjust midpoint
    }

    // Denoise
    if (denoise) {
      pipeline = pipeline.median(3); // Median filter for noise reduction
    }

    // Sharpen for better edge detection
    pipeline = pipeline.sharpen({ sigma: 1.5 });

    // Apply threshold for better text separation (binarization)
    // This converts the image to black/white which helps OCR significantly
    pipeline = pipeline.threshold(128);

    // Save processed image
    await pipeline.toFile(outputPath);

    logger.info('Image preprocessed successfully', {
      inputPath,
      outputPath,
      options,
    });

    return outputPath;
  } catch (error) {
    logger.error('Error preprocessing image', { inputPath, error });
    throw error;
  }
};

/**
 * Convert image to grayscale buffer (for analysis)
 */
export const toGrayscaleBuffer = async (imagePath: string): Promise<Buffer> => {
  try {
    const { data, info } = await sharp(imagePath)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    return data;
  } catch (error) {
    logger.error('Error converting to grayscale', { imagePath, error });
    throw error;
  }
};

/**
 * Get image metadata
 */
export const getImageMetadata = async (imagePath: string) => {
  try {
    const metadata = await sharp(imagePath).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: metadata.format,
      space: metadata.space,
      channels: metadata.channels || 0,
      depth: metadata.depth,
      density: metadata.density || 0,
      hasAlpha: metadata.hasAlpha || false,
    };
  } catch (error) {
    logger.error('Error getting image metadata', { imagePath, error });
    throw error;
  }
};

/**
 * Calculate image contrast
 */
export const calculateContrast = async (imagePath: string): Promise<number> => {
  try {
    const { data, info } = await sharp(imagePath)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calculate standard deviation of pixel values
    const pixels = Array.from(data);
    const mean = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;
    const variance = pixels.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / pixels.length;
    const stdDev = Math.sqrt(variance);

    // Normalize to 0-100 scale (higher is better contrast)
    const contrast = Math.min(100, (stdDev / 255) * 100 * 2);

    return contrast;
  } catch (error) {
    logger.error('Error calculating contrast', { imagePath, error });
    return 0;
  }
};

/**
 * Calculate Laplacian variance (blur detection)
 * Lower values indicate more blur
 */
export const calculateLaplacianVariance = async (imagePath: string): Promise<number> => {
  try {
    const { data, info } = await sharp(imagePath)
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;

    // Simple Laplacian kernel
    // [-1, -1, -1]
    // [-1,  8, -1]
    // [-1, -1, -1]
    const laplacianValues: number[] = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const laplacian =
          -data[idx - width - 1] - data[idx - width] - data[idx - width + 1] -
          data[idx - 1] + 8 * data[idx] - data[idx + 1] -
          data[idx + width - 1] - data[idx + width] - data[idx + width + 1];

        laplacianValues.push(laplacian);
      }
    }

    // Calculate variance of Laplacian
    const mean = laplacianValues.reduce((sum, val) => sum + val, 0) / laplacianValues.length;
    const variance = laplacianValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / laplacianValues.length;

    return variance;
  } catch (error) {
    logger.error('Error calculating Laplacian variance', { imagePath, error });
    return 0;
  }
};

/**
 * Rotate image based on EXIF orientation
 */
export const autoRotateImage = async (inputPath: string, outputPath?: string): Promise<string> => {
  try {
    if (!outputPath) {
      outputPath = inputPath;
    }

    await sharp(inputPath)
      .rotate() // Auto-rotate based on EXIF
      .toFile(outputPath);

    logger.info('Image rotated', { inputPath, outputPath });
    return outputPath;
  } catch (error) {
    logger.error('Error rotating image', { inputPath, error });
    throw error;
  }
};
