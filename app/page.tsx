import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type ClientImageOptions,
  type OutputFormat,
  convertClientFiles,
  estimateClientFiles,
} from "@/lib/browser-image-processing";
import { formatBytes, formatPercent } from "@/lib/utils";

type Preset = "tiny" | "small" | "balanced" | "crisp" | "custom";

const presetQuality: Record<Exclude<Preset, "custom">, number> = {
  tiny: 45,
  small: 60,
  balanced: 75,
  crisp: 88,
};

const formatLabels: Record<OutputFormat, string> = {
  auto: "Auto (keep format)",
  jpeg: "JPG",
  png: "PNG",
  webp: "WebP",
};

type LocalFile = {
  id: string;
  file: File;
  url: string;
};

type Result = {
  name: string;
  url: string;
  size: number;
  count: number;
};

type Estimate = {
  name: string;
  inputName: string;
  inputSize: number;
  outputSize: number;
};

export default function Home() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [format, setFormat] = useState<OutputFormat>("auto");
  const [preset, setPreset] = useState<Preset>("balanced");
  const [quality, setQuality] = useState(75);
  const [targetSizeKB, setTargetSizeKB] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [fit, setFit] = useState<"inside" | "cover" | "contain">("inside");
  const [flattenBackground, setFlattenBackground] = useState(true);
  const [background, setBackground] = useState("#ffffff");
  const [processing, setProcessing] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [estimate, setEstimate] = useState<Estimate[]>([]);
  const [status, setStatus] = useState<"idle" | "processing" | "done">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const totalInputSize = useMemo(
    () => files.reduce((sum, item) => sum + item.file.size, 0),
    [files],
  );

  const handleAddFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming).filter((file) => file.type.startsWith("image/"));
    if (!list.length) {
      setError("Please add image files only.");
      return;
    }
    setError("");
    setResult(null);
    setEstimate([]);
    setStatus("idle");
    setFiles((prev) => [
      ...prev,
      ...list.map((file) => ({
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${file.name}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    if (event.dataTransfer?.files?.length) {
      handleAddFiles(event.dataTransfer.files);
    }
  };

  const handlePresetChange = (value: Preset) => {
    setPreset(value);
    if (value !== "custom") {
      setQuality(presetQuality[value]);
    }
  };

  const removeFile = (id: string) => {
    let removedName = "";
    setFiles((prev) => {
      const removed = prev.find((item) => item.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.url);
        removedName = removed.file.name;
      }
      return prev.filter((item) => item.id !== id);
    });
    if (removedName) {
      setEstimate((prev) => prev.filter((entry) => entry.inputName !== removedName));
    }
  };

  const clearAll = () => {
    files.forEach((item) => {
      URL.revokeObjectURL(item.url);
    });
    setFiles([]);
    setResult(null);
    setEstimate([]);
    setStatus("idle");
  };

  const buildOptions = (): ClientImageOptions => {
    return {
      requestedFormat: format,
      quality,
      targetSizeKB: targetSizeKB ? Number(targetSizeKB) : 0,
      resizeWidth: width ? Number(width) : 0,
      resizeHeight: height ? Number(height) : 0,
      fit,
      flatten: flattenBackground,
      background,
    };
  };

  const triggerDownload = (url: string, name: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
  };

  const handleSubmit = async () => {
    if (!files.length) {
      setError("Add at least one image to continue.");
      return;
    }
    setProcessing(true);
    setStatus("processing");
    setError("");
    setResult(null);

    try {
      const exportResult = await convertClientFiles(
        files.map((item) => item.file),
        buildOptions(),
      );
      const url = URL.createObjectURL(exportResult.blob);

      const nextResult = {
        name: exportResult.name,
        url,
        size: exportResult.size,
        count: exportResult.count,
      };
      if (result) URL.revokeObjectURL(result.url);
      setResult(nextResult);
      triggerDownload(nextResult.url, nextResult.name);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed.");
      setStatus("idle");
    } finally {
      setProcessing(false);
    }
  };

  const handleEstimate = async () => {
    if (!files.length) {
      setError("Add at least one image to continue.");
      return;
    }
    setEstimating(true);
    setStatus("processing");
    setError("");

    try {
      const outputs = await estimateClientFiles(
        files.map((item) => item.file),
        buildOptions(),
      );
      setEstimate(outputs);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Estimate failed.");
      setStatus("idle");
    } finally {
      setEstimating(false);
    }
  };

  useEffect(() => {
    return () => {
      for (const item of files) URL.revokeObjectURL(item.url);
      if (result) URL.revokeObjectURL(result.url);
    };
    // eslint-disable-next-line -- only revoke on unmount; individual removals handle their own cleanup
  }, []);

  return (
    <div className="text-foreground bg-background relative min-h-screen w-full font-sans">
      {/* Background Gradients */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-130 w-130 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,var(--glow),transparent_70%)] opacity-50 blur-3xl" />

      <div className="relative flex min-h-screen flex-col justify-center p-4">
        {/* Header */}
        <header className="mb-4 flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-(--sea) text-xs font-bold text-white shadow-sm">
              IM
            </div>
            <div>
              <h1 className="font-display text-base/tight font-bold tracking-tight">Image Mage</h1>
              <p className="text-[10px]/tight font-medium tracking-wider text-(--muted) uppercase">
                Optimizer
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 border-r border-white/10 pr-3 sm:flex">
              <div className="text-right">
                <div className="text-[9px] font-bold tracking-tighter text-(--muted) uppercase">
                  Files
                </div>
                <div className="font-mono text-[11px] leading-none font-semibold">
                  {files.length}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-bold tracking-tighter text-(--muted) uppercase">
                  Size
                </div>
                <div className="font-mono text-[11px] leading-none font-semibold">
                  {formatBytes(totalInputSize)}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="glass rounded-lg px-3 py-1.5 text-[11px] font-bold transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
                onClick={handleEstimate}
                disabled={estimating || processing || !files.length}
              >
                {estimating ? "..." : "Estimate"}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg bg-(--sea) px-4 py-1.5 text-[11px] font-bold text-white shadow-md transition hover:-translate-y-0.5 hover:bg-(--sea-hover) disabled:cursor-not-allowed disabled:opacity-30"
                onClick={handleSubmit}
                disabled={processing || !files.length}
              >
                {processing ? "..." : "Export"}
              </button>
            </div>
          </div>
        </header>

        {/* Dashboard Grid */}
        <main className="grid flex-1 gap-4 lg:grid-cols-12">
          {/* Left Panel: Files & Upload */}
          <section className="flex flex-col gap-3 lg:col-span-3">
            <button
              type="button"
              className={`glass group relative flex h-32 w-full shrink-0 flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-white/5 p-3 text-center transition-all ${
                isDragOver ? "border-(--sea) bg-(--sea)/5" : "hover:border-white/20"
              } ${status === "processing" ? "animate-pulse-soft" : ""}`}
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragEnter={() => setIsDragOver(true)}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => inputRef.current?.click()}
            >
              <div className="text-xl transition-transform group-hover:scale-110">📤</div>
              <div className="text-[10px] font-bold tracking-widest text-(--muted) uppercase">
                {isDragOver ? "Drop" : "Upload"}
              </div>
              <input
                ref={inputRef}
                type="file"
                id="image-upload"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) {
                    handleAddFiles(e.target.files);
                    e.target.value = "";
                  }
                }}
              />
            </button>

            <div className="glass flex min-h-50 flex-1 flex-col rounded-xl">
              <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-3 py-2">
                <h2 className="text-[9px] font-bold tracking-widest text-(--muted) uppercase">
                  Queue
                </h2>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-[9px] font-bold tracking-tighter text-red-400 uppercase transition hover:text-red-300"
                >
                  Clear
                </button>
              </div>

              <div className="max-h-75 flex-1 overflow-y-auto px-2 py-2 lg:max-h-none">
                {files.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center p-4 text-center">
                    <p className="text-[10px] text-(--muted)">No images</p>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {files.map((item) => (
                      <div
                        key={item.id}
                        className="group flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 transition hover:bg-white/10"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="relative size-6 shrink-0 overflow-hidden rounded-md">
                            <img src={item.url} alt="" className="h-full w-full object-cover" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-[10px]/tight leading-tight font-bold">
                              {item.file.name}
                            </div>
                            <div className="font-mono text-[9px] text-(--muted)">
                              {formatBytes(item.file.size)}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(item.id);
                          }}
                          className="flex size-5 shrink-0 items-center justify-center rounded-sm text-[10px] transition hover:bg-red-500/20 hover:text-red-300"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div className="animate-pop shrink-0 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-medium text-red-300">
                {error}
              </div>
            )}
          </section>

          {/* Center Panel: Primary Configuration */}
          <section className="flex flex-col gap-3 lg:col-span-5">
            <div className="glass flex flex-1 flex-col rounded-2xl p-4">
              <div className="mb-4 shrink-0">
                <h2 className="text-[9px] font-bold tracking-[0.2em] text-(--muted) uppercase">
                  Configuration
                </h2>
              </div>

              <div className="flex-1 space-y-4">
                <div className="grid gap-1.5">
                  <label
                    htmlFor="output-format"
                    className="text-[10px] font-bold tracking-wider text-(--muted) uppercase"
                  >
                    Format
                  </label>
                  <select
                    id="output-format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as OutputFormat)}
                    className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs font-semibold transition outline-none focus:border-(--sea)/50"
                  >
                    {Object.entries(formatLabels).map(([val, label]) => (
                      <option key={val} value={val}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wider text-(--muted) uppercase">
                      Preset
                    </span>
                    <span className="text-[9px] font-bold text-(--sea) uppercase">{preset}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["tiny", "small", "balanced", "crisp", "custom"] as Preset[]).map((p) => (
                      <button
                        type="button"
                        key={p}
                        onClick={() => handlePresetChange(p)}
                        className={`rounded-lg py-1.5 text-[9px] font-bold tracking-tighter uppercase transition ${
                          preset === p
                            ? "bg-(--sea) text-white shadow-md"
                            : "bg-white/5 text-(--muted) hover:bg-white/10"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="quality-slider"
                      className="text-[10px] font-bold tracking-wider text-(--muted) uppercase"
                    >
                      Quality
                    </label>
                    <span className="font-mono text-[10px] font-bold">{quality}%</span>
                  </div>
                  <input
                    id="quality-slider"
                    type="range"
                    min={10}
                    max={95}
                    value={quality}
                    onChange={(e) => {
                      setQuality(Number(e.target.value));
                      setPreset("custom");
                    }}
                    className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-(--sea)"
                  />
                </div>

                <div className="grid gap-1.5">
                  <label
                    htmlFor="target-size"
                    className="text-[10px] font-bold tracking-wider text-(--muted) uppercase"
                  >
                    Target KB
                  </label>
                  <div className="relative">
                    <input
                      id="target-size"
                      type="number"
                      placeholder="Auto"
                      value={targetSizeKB}
                      onChange={(e) => setTargetSizeKB(e.target.value)}
                      className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 font-mono text-xs font-semibold transition outline-none focus:border-(--sea)/50"
                    />
                    <span className="absolute top-1/2 right-3 -translate-y-1/2 text-[10px] font-bold text-(--muted)">
                      KB
                    </span>
                  </div>
                </div>
              </div>

              {/* Estimate Summary Box */}
              <div className="mt-4 flex shrink-0 flex-col gap-2 rounded-xl bg-white/5 p-3">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold tracking-wider text-(--muted) uppercase">
                    Est. Size
                  </span>
                  <span className="font-mono font-bold">
                    {estimate.length
                      ? formatBytes(estimate.reduce((s, i) => s + i.outputSize, 0))
                      : "—"}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full bg-linear-to-r from-(--sea) to-(--sea-hover) transition-all duration-500"
                    style={{
                      width: estimate.length
                        ? `${Math.min(100, (estimate.reduce((s, i) => s + i.outputSize, 0) / Math.max(1, totalInputSize)) * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold tracking-wider text-(--muted) uppercase">Savings</span>
                  <span className="font-bold text-(--sea)">
                    {estimate.length
                      ? formatPercent(
                          Math.max(
                            0,
                            100 -
                              (estimate.reduce((s, i) => s + i.outputSize, 0) /
                                Math.max(1, totalInputSize)) *
                                100,
                          ),
                        )
                      : "0%"}
                  </span>
                </div>
              </div>
            </div>
          </section>
          {/* Right Panel: Advanced & Output */}
          <section className="flex flex-col gap-3 lg:col-span-4">
            <div className="glass flex flex-1 flex-col rounded-2xl p-4">
              <div className="mb-4 shrink-0">
                <h2 className="text-[9px] font-bold tracking-[0.2em] text-(--muted) uppercase">
                  Advanced Tuning
                </h2>
              </div>

              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="output-width"
                      className="text-[10px] font-bold tracking-wider text-(--muted) uppercase"
                    >
                      Width
                    </label>
                    <div className="relative">
                      <input
                        id="output-width"
                        type="number"
                        value={width}
                        onChange={(e) => setWidth(e.target.value)}
                        placeholder="Auto"
                        className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 font-mono text-xs font-bold transition outline-none focus:border-(--sea)/50"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] font-bold text-(--muted)">
                        PX
                      </span>
                    </div>
                  </div>
                  <div className="grid gap-1.5">
                    <label
                      htmlFor="output-height"
                      className="text-[10px] font-bold tracking-wider text-(--muted) uppercase"
                    >
                      Height
                    </label>
                    <div className="relative">
                      <input
                        id="output-height"
                        type="number"
                        value={height}
                        onChange={(e) => setHeight(e.target.value)}
                        placeholder="Auto"
                        className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 font-mono text-xs font-bold transition outline-none focus:border-(--sea)/50"
                      />
                      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[10px] font-bold text-(--muted)">
                        PX
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-1.5">
                  <label
                    htmlFor="fit-strategy"
                    className="text-[10px] font-bold tracking-wider text-(--muted) uppercase"
                  >
                    Scaling Strategy
                  </label>
                  <select
                    id="fit-strategy"
                    value={fit}
                    onChange={(e) => setFit(e.target.value as "inside" | "cover" | "contain")}
                    className="w-full rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs font-bold transition outline-none focus:border-(--sea)/50"
                  >
                    <option value="inside">Maintain Ratio</option>
                    <option value="contain">Contain (Add Padding)</option>
                    <option value="cover">Cover (Auto Crop)</option>
                  </select>
                </div>

                <div className="grid gap-2 pt-1">
                  <div className="group relative flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2 transition hover:bg-white/10">
                    <span className="absolute right-full mr-2 hidden min-w-max rounded-sm bg-black/80 px-2 py-1 text-[10px] text-white group-hover:block">
                      Removes alpha
                    </span>
                    <label
                      htmlFor="opt-flatten"
                      className="cursor-pointer text-[10px] font-bold select-none"
                    >
                      Flatten Transparency
                    </label>
                    <input
                      id="opt-flatten"
                      type="checkbox"
                      checked={flattenBackground}
                      onChange={(e) => setFlattenBackground(e.target.checked)}
                      className="size-3.5 cursor-pointer rounded-sm accent-(--sea)"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                  <label htmlFor="bg-color" className="text-[10px] font-bold text-(--muted)">
                    BG Fill
                  </label>
                  <input
                    id="bg-color"
                    type="color"
                    value={background}
                    onChange={(e) => setBackground(e.target.value)}
                    className="h-5 w-8 shrink-0 cursor-pointer overflow-hidden rounded-sm border-0 bg-transparent"
                  />
                </div>
              </div>

              {result && (
                <div className="animate-pop mt-4 shrink-0 space-y-2 rounded-xl border border-(--sea)/20 bg-(--sea)/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold tracking-widest text-(--sea) uppercase">
                      Success
                    </span>
                    <span className="font-mono text-[10px] font-bold">
                      {formatBytes(result.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => triggerDownload(result.url, result.name)}
                    className="w-full rounded-lg bg-(--sea) py-1.5 text-[10px] font-bold text-white shadow-md transition hover:bg-(--sea-hover)"
                  >
                    Download Package
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
