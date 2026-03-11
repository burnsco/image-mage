import type { NextRequest } from "next/server";
import { BadRequestError, parseConversionRequest, processFiles } from "../_lib";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const { files, options } = parseConversionRequest(formData);
    const outputs = await processFiles(files, options);

    return Response.json({
      files: outputs.map((output) => ({
        name: output.outputName,
        inputName: output.inputName,
        inputSize: output.inputSize,
        outputSize: output.encoded.length,
      })),
    });
  } catch (error) {
    console.error("estimate failed", error);
    if (error instanceof BadRequestError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to estimate images.",
      },
      { status: 500 },
    );
  }
}

export const runtime = "nodejs";
