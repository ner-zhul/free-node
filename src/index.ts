import { parse, stringify } from "yaml";

const SOURCES = [
  "https://raw.githubusercontent.com/awesome-vpn/awesome-vpn/master/clash.yaml",
  "https://raw.githubusercontent.com/Barabama/FreeNodes/refs/heads/feat/ai-crawler-v2/nodes/clashmeta.yaml",
];
const CACHE_SECONDS = 300;

type ProxyNode = Record<string, unknown>;

function extractProxies(document: unknown): ProxyNode[] {
  if (!document || typeof document !== "object") return [];
  const proxies = (document as { proxies?: unknown }).proxies;
  if (!Array.isArray(proxies)) return [];
  return proxies.filter(
    (proxy): proxy is ProxyNode =>
      Boolean(proxy) && typeof proxy === "object" && !Array.isArray(proxy),
  );
}

function mergeProxies(documents: string[]): ProxyNode[] {
  const seen = new Set<string>();
  const result: ProxyNode[] = [];

  for (const source of documents) {
    for (const proxy of extractProxies(parse(source))) {
      const name = typeof proxy.name === "string" ? proxy.name : undefined;
      const key = name ? `name:${name}` : JSON.stringify(proxy);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(proxy);
    }
  }
  return result;
}

async function loadMergedYaml(): Promise<string> {
  const responses = await Promise.all(
    SOURCES.map((source) => fetch(source, { cf: { cacheTtl: CACHE_SECONDS } })),
  );
  if (responses.some((response) => !response.ok)) {
    throw new Error("上游节点源读取失败");
  }
  const documents = await Promise.all(responses.map((response) => response.text()));
  return stringify({ proxies: mergeProxies(documents) });
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const cache = (caches as CacheStorage & { default: Cache }).default;
    const cacheKey = new Request(new URL("/proxies.yaml", request.url), request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    try {
      const body = await loadMergedYaml();
      const response = new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "content-type": "application/yaml; charset=utf-8",
          "cache-control": `public, max-age=${CACHE_SECONDS}`,
        },
      });
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (error) {
      console.error(error);
      return new Response("Failed to load proxy sources", { status: 502 });
    }
  },
} satisfies ExportedHandler;

export { extractProxies, mergeProxies };
