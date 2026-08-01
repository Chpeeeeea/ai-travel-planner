/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  AMAP_JSAPI_KEY?: string;
  AMAP_SECURITY_JS_CODE?: string;
  AMAP_WEBSERVICE_KEY?: string;
  AMAP_MAPS_API_KEY?: string;
  PLANNING_RUN_WRITE_TOKEN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/amap-config") {
      return Response.json(
        env.AMAP_JSAPI_KEY ? { key: env.AMAP_JSAPI_KEY } : { key: null },
        { status: env.AMAP_JSAPI_KEY ? 200 : 503, headers: { "Cache-Control": "public, max-age=300" } },
      );
    }

    if (url.pathname.startsWith("/_AMapService/")) {
      if (!env.AMAP_SECURITY_JS_CODE) return new Response("AMap proxy is not configured", { status: 503 });
      const target = new URL(`https://restapi.amap.com/${url.pathname.slice("/_AMapService/".length)}`);
      url.searchParams.forEach((value, key) => target.searchParams.append(key, value));
      target.searchParams.set("jscode", env.AMAP_SECURITY_JS_CODE);
      const headers = new Headers(request.headers);
      headers.delete("host");
      return fetch(new Request(target, { method: request.method, headers, body: request.body, redirect: "follow" }));
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
