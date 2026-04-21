import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convertClientFiles, estimateClientFiles } from "@/lib/browser-image-processing";
import Home from "@/app/page";

vi.mock("@/lib/browser-image-processing", () => ({
  convertClientFiles: vi.fn(),
  estimateClientFiles: vi.fn(),
}));

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
const mockAnchorClick = vi.fn();

global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;
HTMLAnchorElement.prototype.click = mockAnchorClick;

const mockEstimateClientFiles = vi.mocked(estimateClientFiles);
const mockConvertClientFiles = vi.mocked(convertClientFiles);

// Mock crypto.randomUUID if not available
if (!global.crypto) {
  Object.defineProperty(global, "crypto", {
    value: {
      randomUUID: () => "test-uuid",
    },
  });
} else if (!global.crypto.randomUUID) {
  // @ts-expect-error - JSDOM compatibility
  global.crypto.randomUUID = () => "test-uuid";
}

describe("Home Page", () => {
  beforeEach(() => {
    mockCreateObjectURL.mockReturnValue("mock-url");
    mockAnchorClick.mockReset();
    mockEstimateClientFiles.mockReset();
    mockConvertClientFiles.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the header and main sections", () => {
    render(<Home />);
    expect(screen.getByText("Image Mage")).toBeInTheDocument();
    expect(screen.getByText(/Optimizer/i)).toBeInTheDocument();
    expect(screen.getByText(/Configuration/i)).toBeInTheDocument();
    expect(screen.getByText(/Advanced Tuning/i)).toBeInTheDocument();
  });

  it("handles file upload via input", async () => {
    const { container } = render(<Home />);

    const file = new File(["test"], "test.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    // Check if file is added to the list
    await waitFor(() => {
      expect(screen.getByText("test.png")).toBeInTheDocument();
    });

    // Check if estimate button is enabled
    expect(screen.getByText("Estimate")).toBeEnabled();
    // Check if export button is enabled
    expect(screen.getByText("Export")).toBeEnabled();
  });

  it("clears files when Clear button is clicked", async () => {
    const { container } = render(<Home />);

    const file = new File(["test"], "test.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("test.png")).toBeInTheDocument();
    });

    const clearButton = screen.getByText("Clear");
    fireEvent.click(clearButton);

    await waitFor(() => {
      expect(screen.queryByText("test.png")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No images")).toBeInTheDocument();
  });

  it("updates configuration when changed", () => {
    render(<Home />);

    const formatSelect = screen.getByLabelText(/Format/i);
    fireEvent.change(formatSelect, { target: { value: "webp" } });
    expect((formatSelect as HTMLSelectElement).value).toBe("webp");

    const qualityInput = screen.getByLabelText(/Quality/i);
    fireEvent.change(qualityInput, { target: { value: "50" } });
    // Quality display update
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("handles estimation successfully", async () => {
    mockEstimateClientFiles.mockResolvedValueOnce([
      {
        name: "test.png",
        inputName: "test.png",
        inputSize: 1000,
        outputSize: 500,
      },
    ]);

    const { container } = render(<Home />);
    const file = new File(["test"], "test.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const estimateBtn = await screen.findByText("Estimate");
    fireEvent.click(estimateBtn);

    await waitFor(() => {
      expect(mockEstimateClientFiles).toHaveBeenCalledWith([file], expect.any(Object));
    });

    // Check results in summary box
    // 500 bytes formatted
    await waitFor(() => {
      expect(screen.getByText("500.0 B")).toBeInTheDocument();
    });
  });

  it("handles export successfully", async () => {
    const mockBlob = new Blob(["test output"], { type: "application/zip" });
    mockConvertClientFiles.mockResolvedValueOnce({
      name: "result.zip",
      blob: mockBlob,
      size: mockBlob.size,
      count: 1,
    });

    // Mock triggerDownload since it creates an anchor and clicks it
    const originalDateNow = Date.now;
    Date.now = () => 1234567890; // predictable timestamp

    // Mock anchor element
    // JSDOM supports createElement, but we want to intercept the click
    // We can spy on document.createElement or just expect side effects.
    // Let's just run it to ensure no crash and success state.

    // Let's just run it to ensure no crash and success state.

    const { container } = render(<Home />);
    const file = new File(["test"], "test.png", { type: "image/png" });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const exportBtn = await screen.findByText("Export");
    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(mockConvertClientFiles).toHaveBeenCalledWith([file], expect.any(Object));
    });

    // Should show success state
    await waitFor(() => {
      expect(screen.getByText("Success")).toBeInTheDocument();
    });

    // Restore
    Date.now = originalDateNow;
  });
});
