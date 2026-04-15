import { PassThrough } from "node:stream";
import archiver from "archiver";
import { safeNumber, toBoolean } from "@/lib/utils";
import {
  type OutputFormat,
  type Preset,
  type RequestOptions,
  encodeFile,
  mimeForFormat,
  presetQuality,
} from "./image-processing";

export function parseRequestOptions(body: Record<string, unknown>): RequestOptions {
  const preset = (body.preset || "balanced") as Preset;
  return {
    requestedFormat: (body.format || "auto") as OutputFormat,
    quality: safeNumber(
      body.quality as string | number | null | undefined,
      presetQuality[preset] ?? 75,
    ),
    targetSizeKB: safeNumber(body.targetSizeKB as string | number | null | undefined, 0),
    resizeWidth: safeNumber(body.width as string | number | null | undefined, 0),
    resizeHeight: safeNumber(body.height as string | number | null | undefined, 0),
    fit: (body.fit || "inside") as "inside" | "cover" | "contain",
    keepMetadata: toBoolean(body.keepMetadata as string | number | boolean | null | undefined),
    flatten: toBoolean(body.flatten as string | number | boolean | null | undefined),
    background: (body.background || "#ffffff") as string,
    lossless: toBoolean(body.lossless as string | number | boolean | null | undefined),
    progressive: toBoolean(body.progressive as string | number | boolean | null | undefined),
  };
}

export async function estimateFiles(files: Express.Multer.File[], options: RequestOptions) {
  return Promise.all(
    files.map(async (file) => {
      const { outputName, encoded } = await encodeFile(file, options);
      return {
        name: outputName,
        inputName: file.originalname,
        inputSize: file.size,
        outputSize: encoded.length,
      };
    }),
  );
}

export async function convertFiles(files: Express.Multer.File[], options: RequestOptions) {
  return Promise.all(
    files.map(async (file) => {
      const { outputName, encoded, outputFormat } = await encodeFile(file, options);
      return {
        name: outputName,
        buffer: encoded,
        mime: mimeForFormat[outputFormat],
      };
    }),
  );
}

export async function createZip(outputs: Array<{ name: string; buffer: Buffer }>) {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  const finished = new Promise<void>((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(chunk as Buffer));
    stream.on("end", resolve);
    stream.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(stream);
  for (const output of outputs) {
    archive.append(output.buffer, { name: output.name });
  }
  await archive.finalize();
  await finished;

  return Buffer.concat(chunks);
}
