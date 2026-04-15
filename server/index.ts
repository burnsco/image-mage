import express from "express";
import multer from "multer";
import { convertFiles, createZip, estimateFiles, parseRequestOptions } from "./services/image-api";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const port = Number(process.env.PORT || 8787);

app.post("/api/estimate", upload.array("files"), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) {
      res.status(400).json({ error: "No files provided." });
      return;
    }
    const options = parseRequestOptions(req.body);
    const outputs = await estimateFiles(files, options);

    res.json({ files: outputs });
  } catch (error) {
    console.error("estimate failed", error);
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Failed to estimate images." });
  }
});

app.post("/api/convert", upload.array("files"), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) {
      res.status(400).json({ error: "No files provided." });
      return;
    }
    const options = parseRequestOptions(req.body);
    const outputs = await convertFiles(files, options);

    if (outputs.length === 1) {
      const output = outputs[0];
      res.setHeader("Content-Type", output.mime);
      res.setHeader("Content-Disposition", `attachment; filename="${output.name}"`);
      res.status(200).send(output.buffer);
      return;
    }

    const zipBuffer = await createZip(outputs);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="image-mage-export.zip"');
    res.status(200).send(zipBuffer);
  } catch (error) {
    console.error("convert failed", error);
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Failed to process images." });
  }
});

app.listen(port, () => {
  console.log(`Image Mage API listening on http://localhost:${port}`);
});
