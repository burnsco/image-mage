# Image Mage

Image Mage is a batch image conversion and compression app built with Next.js and Sharp. It is designed for quick, privacy-conscious asset cleanup in the browser or at the edge.

## Highlights

- Batch conversion across common image formats
- Compression presets plus target-size tuning
- Resizing, metadata handling, and ZIP export
- Cloudflare Workers deployment via OpenNext

## Stack

- Next.js
- React
- TypeScript
- Sharp

## Quick start

```bash
bun install
bun run dev
```

Checks and deploy:

```bash
bun run typecheck
bun run build:workers
bun run deploy
```
