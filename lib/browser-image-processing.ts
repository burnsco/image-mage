import { zipSync } from "fflate";
import { getExtension } from "@/lib/utils";

export type OutputFormat = "auto" | "jpeg" | "png" | "webp";

export type ClientImageOptions = {
  requestedFormat: OutputFormat;
  quality: number;
  targetSizeKB: number;
  resizeWidth: number;
  resizeHeight: number;
  fit: "inside" | "cover" | "contain";
  flatten: boolean;
  background: string;
};

export type EstimateResult = {
  name: string;
  inputName: string;
  inputSize: number;
  outputSize: number;
};

export type ConvertResult = {
  name: string;
  blob: Blob;
  size: number;
  count: number;
};

type RenderedImage = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  outputName: string;
  mime: string;
  outputFormat: Exclude<OutputFormat, "auto">;
};

const mimeForFormat: Record<Exclude<OutputFormat, "auto">, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function normalizeFormat(format: OutputFormat, file: File): Exclude<OutputFormat, "auto"> {
  if (format !== "auto") return format;

  const extension = getExtension(file.name);
  if (extension === "jpg" || extension === "jpeg") return "jpeg";
  if (extension === "png") return "png";
  if (extension === "webp") return "webp";

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpeg";
}

function extensionForFormat(format: Exclude<OutputFormat, "auto">) {
  return format === "jpeg" ? "jpg" : format;
}

function outputNameFor(file: File, format: Exclude<OutputFormat, "auto">) {
  return `${file.name.replace(/\.[^/.]+$/, "")}.${extensionForFormat(format)}`;
}

function uniqueEntryName(name: string, used: Set<string>) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }

  const extensionIndex = name.lastIndexOf(".");
  const base = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
  const extension = extensionIndex > 0 ? name.slice(extensionIndex) : "";
  let index = 2;
  let candidate = `${base}-${index}${extension}`;

  while (used.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}${extension}`;
  }

  used.add(candidate);
  return candidate;
}

function boundedNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function calculateOutputSize(
  sourceWidth: number,
  sourceHeight: number,
  options: ClientImageOptions,
) {
  const requestedWidth = boundedNumber(options.resizeWidth, 0);
  const requestedHeight = boundedNumber(options.resizeHeight, 0);

  if (!requestedWidth && !requestedHeight) {
    return { width: sourceWidth, height: sourceHeight };
  }

  if (requestedWidth && !requestedHeight) {
    const scale = Math.min(1, requestedWidth / sourceWidth);
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
    };
  }

  if (!requestedWidth && requestedHeight) {
    const scale = Math.min(1, requestedHeight / sourceHeight);
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale)),
    };
  }

  if (options.fit === "cover" || options.fit === "contain") {
    return {
      width: Math.min(sourceWidth, requestedWidth),
      height: Math.min(sourceHeight, requestedHeight),
    };
  }

  const scale = Math.min(1, requestedWidth / sourceWidth, requestedHeight / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

async function decodeImage(file: File) {
  if ("createImageBitmap" in globalThis) {
    return createImageBitmap(file);
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createCanvas(width: number, height: number) {
  if ("OffscreenCanvas" in globalThis) {
    return new OffscreenCanvas(width, height);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function renderImage(
  file: File,
  image: ImageBitmap | HTMLImageElement,
  options: ClientImageOptions,
): RenderedImage {
  const sourceWidth = image.width;
  const sourceHeight = image.height;
  const { width, height } = calculateOutputSize(sourceWidth, sourceHeight, options);
  const outputFormat = normalizeFormat(options.requestedFormat, file);
  const mime = mimeForFormat[outputFormat];
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!context) {
    throw new Error("This browser could not create an image canvas.");
  }

  const shouldFillBackground = outputFormat === "jpeg" || options.flatten;
  if (shouldFillBackground) {
    context.fillStyle = options.background || "#ffffff";
    context.fillRect(0, 0, width, height);
  } else {
    context.clearRect(0, 0, width, height);
  }

  let drawWidth = width;
  let drawHeight = height;
  let offsetX = 0;
  let offsetY = 0;

  if (options.fit === "cover" && options.resizeWidth && options.resizeHeight) {
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    drawWidth = sourceWidth * scale;
    drawHeight = sourceHeight * scale;
    offsetX = (width - drawWidth) / 2;
    offsetY = (height - drawHeight) / 2;
  }

  if (options.fit === "contain" && options.resizeWidth && options.resizeHeight) {
    const scale = Math.min(width / sourceWidth, height / sourceHeight);
    drawWidth = sourceWidth * scale;
    drawHeight = sourceHeight * scale;
    offsetX = (width - drawWidth) / 2;
    offsetY = (height - drawHeight) / 2;
  }

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);

  if ("close" in image) {
    image.close();
  }

  return {
    canvas,
    outputName: outputNameFor(file, outputFormat),
    mime,
    outputFormat,
  };
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mime: string,
  quality: number,
) {
  if ("convertToBlob" in canvas) {
    return canvas.convertToBlob({ type: mime, quality });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`This browser cannot encode ${mime}.`));
        }
      },
      mime,
      quality,
    );
  });
}

function verifyEncodedType(blob: Blob, rendered: RenderedImage) {
  if (blob.type && blob.type !== rendered.mime) {
    throw new Error(`This browser cannot encode ${rendered.outputFormat.toUpperCase()}.`);
  }
  return blob;
}

async function encodeRenderedCanvas(
  rendered: RenderedImage,
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
) {
  return verifyEncodedType(await canvasToBlob(canvas, rendered.mime, quality), rendered);
}

function scaleCanvas(sourceCanvas: HTMLCanvasElement | OffscreenCanvas, scale: number) {
  const width = Math.max(1, Math.round(sourceCanvas.width * scale));
  const height = Math.max(1, Math.round(sourceCanvas.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!context) {
    throw new Error("This browser could not create an image canvas.");
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(sourceCanvas, 0, 0, width, height);
  return canvas;
}

async function encodePngToTargetSize(rendered: RenderedImage, targetBytes: number) {
  const originalBlob = await encodeRenderedCanvas(rendered, rendered.canvas, 1);
  if (!targetBytes || originalBlob.size <= targetBytes) {
    return originalBlob;
  }

  let low = 0.05;
  let high = 1;
  let bestBlob: Blob = originalBlob;
  let bestDiff = Math.abs(originalBlob.size - targetBytes);
  let bestUnderTarget: Blob | null = null;
  let bestUnderDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 8; i += 1) {
    const scale = (low + high) / 2;
    const scaledCanvas = scaleCanvas(rendered.canvas, scale);
    const blob = await encodeRenderedCanvas(rendered, scaledCanvas, 1);
    const diff = Math.abs(blob.size - targetBytes);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestBlob = blob;
    }

    if (blob.size > targetBytes) {
      high = scale;
    } else {
      const underDiff = targetBytes - blob.size;
      if (underDiff < bestUnderDiff) {
        bestUnderDiff = underDiff;
        bestUnderTarget = blob;
      }
      low = scale;
    }
  }

  return bestUnderTarget ?? bestBlob;
}

async function encodeCanvas(rendered: RenderedImage, options: ClientImageOptions) {
  const targetBytes = options.targetSizeKB > 0 ? options.targetSizeKB * 1024 : 0;

  if (rendered.outputFormat === "png") {
    return encodePngToTargetSize(rendered, targetBytes);
  }

  const baseQuality = Math.min(0.95, Math.max(0.1, options.quality / 100));

  if (!targetBytes) {
    return encodeRenderedCanvas(rendered, rendered.canvas, baseQuality);
  }

  let low = 0.3;
  let high = Math.max(baseQuality, 0.4);
  let bestBlob: Blob | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;

  for (let i = 0; i < 8; i += 1) {
    const quality = (low + high) / 2;
    const blob = await encodeRenderedCanvas(rendered, rendered.canvas, quality);

    const diff = Math.abs(blob.size - targetBytes);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestBlob = blob;
    }

    if (blob.size > targetBytes) {
      high = quality - 0.02;
    } else {
      low = quality + 0.02;
    }
  }

  return bestBlob ?? encodeRenderedCanvas(rendered, rendered.canvas, baseQuality);
}

async function processFile(file: File, options: ClientImageOptions) {
  const image = await decodeImage(file);
  const rendered = renderImage(file, image, options);
  const blob = await encodeCanvas(rendered, options);

  return {
    name: rendered.outputName,
    blob,
    inputName: file.name,
    inputSize: file.size,
    outputSize: blob.size,
  };
}

export async function estimateClientFiles(files: File[], options: ClientImageOptions) {
  const outputs = await Promise.all(files.map((file) => processFile(file, options)));
  return outputs.map<EstimateResult>((output) => ({
    name: output.name,
    inputName: output.inputName,
    inputSize: output.inputSize,
    outputSize: output.outputSize,
  }));
}

export async function convertClientFiles(
  files: File[],
  options: ClientImageOptions,
): Promise<ConvertResult> {
  const outputs = await Promise.all(files.map((file) => processFile(file, options)));

  if (outputs.length === 1) {
    const output = outputs[0];
    return {
      name: output.name,
      blob: output.blob,
      size: output.blob.size,
      count: 1,
    };
  }

  const entries: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  await Promise.all(
    outputs.map(async (output) => {
      entries[uniqueEntryName(output.name, usedNames)] = new Uint8Array(
        await output.blob.arrayBuffer(),
      );
    }),
  );

  const zip = zipSync(entries, { level: 9 });
  const zipBuffer = new ArrayBuffer(zip.byteLength);
  new Uint8Array(zipBuffer).set(zip);
  const blob = new Blob([zipBuffer], { type: "application/zip" });
  return {
    name: "image-mage-export.zip",
    blob,
    size: blob.size,
    count: outputs.length,
  };
}
