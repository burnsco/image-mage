import { describe, expect, it } from "vitest";
import { formatBytes, formatPercent, getExtension, safeNumber, toBoolean } from "@/lib/utils";

describe("formatBytes", () => {
  it("formats 0 bytes correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats KB correctly", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats MB correctly", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("formats GB correctly", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
  });
});

describe("formatPercent", () => {
  it("rounds generic numbers", () => {
    expect(formatPercent(12.3)).toBe("12%");
    expect(formatPercent(99.9)).toBe("100%");
  });
});

describe("safeNumber", () => {
  it("returns number when valid", () => {
    expect(safeNumber("123", 0)).toBe(123);
    expect(safeNumber(456, 0)).toBe(456);
  });

  it("returns fallback when invalid", () => {
    expect(safeNumber(null, 10)).toBe(10);
    expect(safeNumber(undefined, 10)).toBe(10);
    expect(safeNumber("invalid", 10)).toBe(10);
  });
});

describe("toBoolean", () => {
  it("returns true for 'true'", () => {
    expect(toBoolean("true")).toBe(true);
  });

  it("returns true for '1'", () => {
    expect(toBoolean("1")).toBe(true);
  });

  it("returns false for others", () => {
    expect(toBoolean("false")).toBe(false);
    expect(toBoolean("0")).toBe(false);
    expect(toBoolean(null)).toBe(false);
  });
});

describe("getExtension", () => {
  it("returns extension for filename with extension", () => {
    expect(getExtension("file.txt")).toBe("txt");
    expect(getExtension("MyPhoto.JPG")).toBe("jpg");
  });

  it("returns empty string for filename without extension", () => {
    expect(getExtension("file")).toBe("");
    expect(getExtension(".config")).toBe("config");
    expect(getExtension("file.")).toBe("");
  });
});
