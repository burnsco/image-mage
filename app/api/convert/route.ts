import archiver from "archiver";
import type { NextRequest } from "next/server";
import { PassThrough } from "node:stream";
import { BadRequestError, parseConversionRequest, processFiles } from "../_lib";
import type { NormalizedFormat } from "../_lib";

const mimeForFormat: Record<NormalizedFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  tiff: "image/tiff",
  gif: "image/gif",
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const { files, options } = parseConversionRequest(formData);
    const outputs = await processFiles(files, options);

    if (outputs.length === 1) {
      const file = outputs[0];
      return new Response(new Uint8Array(file.encoded), {
        headers: {
          "Content-Type": mimeForFormat[file.outputFormat],
          "Content-Disposition": `attachment; filename="${file.outputName}"`,
        },
      });
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = new PassThrough();
    const chunks: Buffer[] = [];
    const finished = new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk) => chunks.push(chunk as Buffer));
      stream.on("end", () => resolve());
      stream.on("error", reject);
      archive.on("error", reject);
    });

    archive.pipe(stream);
    for (const output of outputs) {
      archive.append(output.encoded, { name: output.outputName });
    }
    archive.finalize();
    await finished;

    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="image-mage-export.zip"`,
      },
    });
  } catch (error) {
    console.error("convert failed", error);
    if (error instanceof BadRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to process images.",
      },
      { status: 500 }
    );
  }
}

export const runtime = "nodejs";
