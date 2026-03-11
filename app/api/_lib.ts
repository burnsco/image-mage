import sharp from "sharp";

export type OutputFormat = "auto" | "jpeg" | "jpg" | "png" | "webp" | "avif" | "tiff" | "gif";

export type NormalizedFormat = Exclude<OutputFormat, "auto" | "jpg">;

export type Preset = "tiny" | "small" | "balanced" | "crisp";
export type FitMode = "inside" | "cover" | "contain";

export const presetQuality: Record<Preset, number> = {
  tiny: 45,
  small: 60,
  balanced: 75,
  crisp: 88,
};

// Formats that support an alpha channel — flattening should be skipped for these
export const alphaFormats = new Set<NormalizedFormat>(["png", "webp", "avif", "gif"]);

export function safeNumber(value: FormDataEntryValue | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBoolean(value: FormDataEntryValue | null) {
  return value === "true" || value === "1";
}

export function getExtension(name: string) {
  const parts = name.split(".");
  return parts.length > 1 ? (parts.pop() ?? "").toLowerCase() : "";
}

export function normalizeFormat(format: OutputFormat, fallback?: string): NormalizedFormat {
  const fb = fallback ?? "";
  if (format === "auto") {
    if (fb === "jpg" || fb === "jpeg") return "jpeg";
    if (fb === "png") return "png";
    if (fb === "webp") return "webp";
    if (fb === "avif") return "avif";
    if (fb === "tiff") return "tiff";
    if (fb === "gif") return "gif";
    return "jpeg";
  }
  if (format === "jpg") return "jpeg";
  return format;
}

export async function fileToBuffer(file: File) {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

type PipelineOptions = {
  width?: number;
  height?: number;
  fit?: "inside" | "cover" | "contain";
  keepMetadata: boolean;
  background?: string;
};

export type EncoderOptions = PipelineOptions & {
  lossless: boolean;
  progressive: boolean;
};

export type ConversionOptions = {
  requestedFormat: OutputFormat;
  quality: number;
  targetSizeKB: number;
  width: number;
  height: number;
  fit: FitMode;
  keepMetadata: boolean;
  flatten: boolean;
  background: string;
  lossless: boolean;
  progressive: boolean;
};

export type ParsedConversionRequest = {
  files: File[];
  options: ConversionOptions;
};

export type ProcessedFile = {
  inputName: string;
  inputSize: number;
  outputName: string;
  outputFormat: NormalizedFormat;
  encoded: Buffer;
};

export class BadRequestError extends Error {}

export function parseConversionRequest(formData: FormData): ParsedConversionRequest {
  const files = formData.getAll("files").filter(Boolean) as File[];
  if (!files.length) {
    throw new BadRequestError("No files provided.");
  }

  const requestedFormat = (formData.get("format") || "auto") as OutputFormat;
  const preset = (formData.get("preset") || "balanced") as Preset;

  return {
    files,
    options: {
      requestedFormat,
      quality: safeNumber(formData.get("quality"), presetQuality[preset] ?? 75),
      targetSizeKB: safeNumber(formData.get("targetSizeKB"), 0),
      width: safeNumber(formData.get("width"), 0),
      height: safeNumber(formData.get("height"), 0),
      fit: (formData.get("fit") || "inside") as FitMode,
      keepMetadata: toBoolean(formData.get("keepMetadata")),
      flatten: toBoolean(formData.get("flatten")),
      background: (formData.get("background") || "#ffffff") as string,
      lossless: toBoolean(formData.get("lossless")),
      progressive: toBoolean(formData.get("progressive")),
    },
  };
}

function buildPipeline(buffer: Buffer, options: PipelineOptions) {
  let pipeline = sharp(buffer, { animated: false }).rotate();
  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width ?? undefined,
      height: options.height ?? undefined,
      fit: options.fit ?? "inside",
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

export function encodeWithQuality(
  buffer: Buffer,
  format: NormalizedFormat,
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

export async function encodeToTargetSize(
  buffer: Buffer,
  format: NormalizedFormat,
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

export async function processFiles(
  files: File[],
  options: ConversionOptions,
): Promise<ProcessedFile[]> {
  return Promise.all(
    files.map(async (file) => {
      const buffer = await fileToBuffer(file);
      const inputExt = getExtension(file.name);
      const outputFormat = normalizeFormat(options.requestedFormat, inputExt);
      const shouldFlatten = options.flatten && !alphaFormats.has(outputFormat);

      const encoderOptions: EncoderOptions = {
        width: options.width || undefined,
        height: options.height || undefined,
        fit: options.fit,
        keepMetadata: options.keepMetadata,
        background: shouldFlatten ? options.background : undefined,
        lossless: options.lossless,
        progressive: options.progressive,
      };

      const encoded =
        options.targetSizeKB > 0
          ? await encodeToTargetSize(
              buffer,
              outputFormat,
              options.targetSizeKB * 1024,
              options.quality,
              encoderOptions,
            )
          : await encodeWithQuality(
              buffer,
              outputFormat,
              options.quality,
              encoderOptions,
            ).toBuffer();

      const extension = outputFormat === "jpeg" ? "jpg" : outputFormat;
      const baseName = file.name.replace(/\.[^/.]+$/, "");

      return {
        inputName: file.name,
        inputSize: file.size,
        outputName: `${baseName}.${extension}`,
        outputFormat,
        encoded,
      };
    }),
  );
}
