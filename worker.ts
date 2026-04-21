type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

async function serveAsset(request: Request, env: Env) {
  const assetResponse = await env.ASSETS.fetch(request);
  if (assetResponse.status !== 404) {
    return assetResponse;
  }

  const url = new URL(request.url);
  const fallbackRequest = new Request(new URL("/index.html", url), request);
  return env.ASSETS.fetch(fallbackRequest);
}

export default {
  fetch(request: Request, env: Env) {
    return serveAsset(request, env);
  },
};
