import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClientImageOptions,
  convertClientFiles,
  estimateClientFiles,
} from "@/lib/browser-image-processing";

type EncodeCall = {
  width: number;
  height: number;
  type: string;
  quality: number;
};

const baseOptions: ClientImageOptions = {
  requestedFormat: "png",
  quality: 75,
  targetSizeKB: 0,
  resizeWidth: 0,
  resizeHeight: 0,
  fit: "inside",
  flatten: false,
  background: "#ffffff",
};

let encodeCalls: EncodeCall[] = [];

class FakeCanvas {
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext() {
    return {
      fillStyle: "",
      imageSmoothingEnabled: false,
      imageSmoothingQuality: "low",
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
    };
  }

  async convertToBlob(options: { type?: string; quality?: number } = {}) {
    const type = options.type ?? "image/png";
    const quality = options.quality ?? 1;
    encodeCalls.push({ width: this.width, height: this.height, type, quality });

    const pixels = this.width * this.height;
    const bytes =
      type === "image/png"
        ? Math.max(100, Math.round(100 + pixels * 0.1))
        : Math.max(100, Math.round(100 + pixels * 0.1 * quality));

    return new Blob([new Uint8Array(bytes)], { type });
  }
}

describe("browser image processing", () => {
  beforeEach(() => {
    encodeCalls = [];
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({
        width: 1000,
        height: 1000,
        close: vi.fn(),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses PNG target size when exporting", async () => {
    const file = new File([new Uint8Array(120_000)], "source.png", {
      type: "image/png",
    });

    const result = await convertClientFiles([file], {
      ...baseOptions,
      targetSizeKB: 50,
    });

    expect(result.name).toBe("source.png");
    expect(result.size).toBeLessThanOrEqual(50 * 1024);
    expect(encodeCalls.length).toBeGreaterThan(1);
    expect(encodeCalls.some((call) => call.type === "image/png" && call.width < 1000)).toBe(true);
  });

  it("uses PNG target size when estimating", async () => {
    const file = new File([new Uint8Array(120_000)], "source.png", {
      type: "image/png",
    });

    const [result] = await estimateClientFiles([file], {
      ...baseOptions,
      targetSizeKB: 50,
    });

    expect(result.outputSize).toBeLessThanOrEqual(50 * 1024);
  });

  it("keeps original PNG dimensions when no target size is set", async () => {
    const file = new File([new Uint8Array(120_000)], "source.png", {
      type: "image/png",
    });

    const result = await convertClientFiles([file], baseOptions);

    expect(result.size).toBe(100_100);
    expect(encodeCalls).toHaveLength(1);
    expect(encodeCalls[0]).toMatchObject({
      width: 1000,
      height: 1000,
      type: "image/png",
    });
  });
});
