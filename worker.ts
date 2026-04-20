import { handleAsNodeRequest } from "cloudflare:node";
import { createServer } from "node:http";

type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

let apiServerPromise: Promise<void> | null = null;

function ensureProcessReport() {
  const runtimeProcess = globalThis.process as
    | (NodeJS.Process & {
        report?: {
          getReport?: () => { header?: { glibcVersionRuntime?: string } };
        };
      })
    | undefined;

  if (!runtimeProcess) {
    return;
  }

  if (typeof runtimeProcess.report?.getReport === "function") {
    return;
  }

  runtimeProcess.report = {
    getReport: () => ({ header: {} }),
  } as NodeJS.Process["report"];
}

async function ensureApiServer() {
  if (!apiServerPromise) {
    apiServerPromise = (async () => {
      ensureProcessReport();
      const { app } = await import("./server/app");
      const apiServer = createServer(app);
      apiServer.listen(8787);
    })();
  }

  return apiServerPromise;
}

async function serveAsset(request: Request, env: Env) {
  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return assetResponse;
  }

  const fallbackRequest = new Request(new URL("/index.html", url), request);
  return env.ASSETS.fetch(fallbackRequest);
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      await ensureApiServer();
      return handleAsNodeRequest(8787, request);
    }

    return serveAsset(request, env);
  },
};
