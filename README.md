# Image Mage — The Ultimate Web Image Toolkit

**Image Mage** is a powerful, privacy-focused web application for batch image conversion and compression. Built with **Vite + React**, it provides a seamless experience for optimizing your visual assets with professional-grade controls—all directly in your browser.

## ✨ Features

- 🚀 **Batch Processing**: Drag-and-drop multiple files and process them all at once.
- 🔄 **Browser-native Conversion**: Seamlessly convert between `WebP`, `JPEG`, and `PNG`.
- 💎 **Smart Compression**: Use intelligent presets (`Tiny`, `Small`, `Balanced`, `Crisp`) or set custom quality targets.
- 🎯 **Target Size Mode**: Set a specific file size (KB) and let Image Mage find the optimal quality settings.
- 📏 **Advanced Resizing**: Pro-level controls for resizing (`Inside`, `Cover`, `Contain`) and transparent-background handling.
- 📦 **Effortless Exports**: Download individual files or a combined ZIP for batch jobs.
- 🔒 **Privacy First**: All processing happens in your browser. Your images never leave your device.

## 🛠️ Tech Stack

- **Frontend**: Vite + React 19
- **UI & Logic**: React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Engine**: Browser Canvas APIs + fflate ZIP packaging

## Browser-Only Compatibility

This build supports JPEG, PNG, and WebP through browser-native Canvas APIs. AVIF, TIFF, GIF, and Sharp-specific metadata controls from the old server path are not available in the browser-only version.

## 🚀 Getting Started

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

Open [http://localhost:5173](http://localhost:5173) to start optimizing.

## 📦 Scripts

- `bun run dev`: Start Vite and Wrangler dev servers.
- `bun run build`: Build for production.
- `bun run start`: Run the Cloudflare Worker locally.
- `bun run lint`: Run linting checks.
