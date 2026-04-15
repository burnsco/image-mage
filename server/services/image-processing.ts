import sharp from "sharp";
import { getExtension } from "@/lib/utils";

export type OutputFormat = "auto" | "jpeg" | "jpg" | "png" | "webp" | "avif" | "tiff" | "gif";

export type Preset = "tiny" | "small" | "balanced" | "crisp";

export type EncoderOptions = {
  width?: number;
  height?: number;
  fit?: "inside" | "cover" | "contain";
  keepMetadata: boolean;
  background?: string;
  lossless: boolean;
  progressive: boolean;
};

export type RequestOptions = {
  requestedFormat: OutputFormat;
  quality: number;
  targetSizeKB: number;
  resizeWidth: number;
  resizeHeight: number;
  fit: "inside" | "cover" | "contain";
  keepMetadata: boolean;
  flatten: boolean;
  background: string;
  lossless: boolean;
  progressive: boolean;
};

export const presetQuality: Record<Preset, number> = {
  tiny: 45,
  small: 60,
  balanced: 75,
  crisp: 88,
};

export const mimeForFormat: Record<Exclude<OutputFormat, "auto">, string> = {
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
};

export function normalizeFormat(
  format: OutputFormat,
  fallback?: string,
): Exclude<OutputFormat, "auto"> {
  const normalizedFallback = fallback ?? "";
  if (format === "auto") {
    if (normalizedFallback === "jpeg") return "jpeg";
    if (normalizedFallback === "jpg") return "jpeg";
    if (normalizedFallback === "png") return "png";
    if (normalizedFallback === "webp") return "webp";
    if (normalizedFallback === "avif") return "avif";
    if (normalizedFallback === "tiff") return "tiff";
    if (normalizedFallback === "gif") return "gif";
    return "jpeg";
  }
  if (format === "jpg") return "jpeg";
  return format;
}

function buildPipeline(buffer: Buffer, options: Omit<EncoderOptions, "lossless" | "progressive">) {
  let pipeline = sharp(buffer, { animated: false }).rotate();
  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width || undefined,
      height: options.height || undefined,
      fit: options.fit || "inside",
      withoutEnlargement: true,
    });
  }
  if (options.keepMetadata) {
    pipeline = pipeline.withMetadata();
  }
  if (options.background) {
    pipeline = pipeline.flatten({ background: options.background });
  }
  return pipeline;
}

function encodeWithQuality(
  buffer: Buffer,
  format: Exclude<OutputFormat, "auto">,
  quality: number,
  options: EncoderOptions,
) {
  const pipeline = buildPipeline(buffer, options);
  switch (format) {
    case "jpeg":
      return pipeline.jpeg({ quality, mozjpeg: true, progressive: options.progressive });
    case "png":
      return pipeline.png({ quality, compressionLevel: 9, palette: true });
    case "webp":
      return pipeline.webp({ quality, effort: 5, lossless: options.lossless });
    case "avif":
      return pipeline.avif({ quality, effort: 5 });
    case "tiff":
      return pipeline.tiff({ quality, compression: "lzw" });
    case "gif":
      return pipeline.gif();
    default:
      return pipeline.jpeg({ quality });
  }
}

async function encodeToTargetSize(
  buffer: Buffer,
  format: Exclude<OutputFormat, "auto">,
  targetBytes: number,
  baseQuality: number,
  options: EncoderOptions,
) {
  let low = 30;
  let high = Math.max(baseQuality, 40);
  let bestBuffer: Buffer | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 8; i += 1) {
    const quality = Math.round((low + high) / 2);
    const encoded = await encodeWithQuality(buffer, format, quality, options).toBuffer();
    const diff = Math.abs(encoded.length - targetBytes);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBuffer = encoded;
    }
    if (encoded.length > targetBytes) {
      high = quality - 2;
    } else {
      low = quality + 2;
    }
  }

  return bestBuffer ?? (await encodeWithQuality(buffer, format, baseQuality, options).toBuffer());
}

export async function encodeFile(
  file: Express.Multer.File,
  options: RequestOptions,
): Promise<{
  outputFormat: Exclude<OutputFormat, "auto">;
  outputName: string;
  encoded: Buffer;
}> {
  const outputFormat = normalizeFormat(options.requestedFormat, getExtension(file.originalname));
  const alphaFormats = new Set<Exclude<OutputFormat, "auto">>(["png", "webp", "avif", "gif"]);
  const shouldFlatten = options.flatten && !alphaFormats.has(outputFormat);

  const encoderOptions: EncoderOptions = {
    width: options.resizeWidth || undefined,
    height: options.resizeHeight || undefined,
    fit: options.fit,
    keepMetadata: options.keepMetadata,
    background: shouldFlatten ? options.background : undefined,
    lossless: options.lossless,
    progressive: options.progressive,
  };

  const encoded =
    options.targetSizeKB > 0
      ? await encodeToTargetSize(
          file.buffer,
          outputFormat,
          options.targetSizeKB * 1024,
          options.quality,
          encoderOptions,
        )
      : await encodeWithQuality(
          file.buffer,
          outputFormat,
          options.quality,
          encoderOptions,
        ).toBuffer();

  const extension = outputFormat === "jpeg" ? "jpg" : outputFormat;
  const outputName = `${file.originalname.replace(/\.[^/.]+$/, "")}.${extension}`;
  return { outputFormat, outputName, encoded };
}
