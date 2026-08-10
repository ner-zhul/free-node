import { parseAllDocuments, stringify } from "yaml";

const SOURCES = [
  {
    github: "https://github.com/Barabama/FreeNodes",
    subscription: "https://raw.githubusercontent.com/Barabama/FreeNodes/refs/heads/feat/ai-crawler-v2/nodes/merged.yaml",
    source: "https://raw.githubusercontent.com/Barabama/FreeNodes/refs/heads/feat/ai-crawler-v2/nodes/merged.yaml",
  },
  {
    github: "https://github.com/awesome-vpn/awesome-vpn",
    subscription: "https://raw.githubusercontent.com/awesome-vpn/awesome-vpn/master/clash.yaml",
    source: "https://raw.githubusercontent.com/awesome-vpn/awesome-vpn/master/clash.yaml",
  },
  {
    github: "https://github.com/vxiaov/free_proxies",
    subscription: "https://raw.githubusercontent.com/vxiaov/free_proxies/main/clash/clash.provider.yaml",
    source: "https://raw.githubusercontent.com/vxiaov/free_proxies/main/clash/clash.provider.yaml",
  },
  {
    github: "https://github.com/snakem982/proxypool",
    subscription: "https://raw.githubusercontent.com/snakem982/proxypool/main/source/clash-meta-2.yaml",
    source: "https://raw.githubusercontent.com/snakem982/proxypool/main/source/clash-meta-2.yaml",
  },
  {
    github: "https://github.com/PuddinCat/BestClash",
    subscription: "https://raw.githubusercontent.com/PuddinCat/BestClash/refs/heads/main/proxies.yaml",
    source: "https://raw.githubusercontent.com/PuddinCat/BestClash/refs/heads/main/proxies.yaml",
  },
  {
    github: "https://github.com/freenodes/freenodes",
    subscription: "https://fastly.jsdelivr.net/gh/freenodes/freenodes@main/clash.yaml",
    source: "https://fastly.jsdelivr.net/gh/freenodes/freenodes@main/clash.yaml",
  },
];
const CACHE_SECONDS = 300;
const CACHE_KEY = "https://free-node-worker-cache.invalid/proxy.yml";

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
    for (const document of parseAllDocuments(source)) {
      if (document.errors.length > 0) {
        throw document.errors[0];
      }
      for (const proxy of extractProxies(document.toJS())) {
        const name = typeof proxy.name === "string" ? proxy.name : undefined;
        const key = name ? `name:${name}` : JSON.stringify(proxy);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(proxy);
      }
    }
  }
  return result;
}

async function loadMergedYaml(): Promise<string> {
  const responses = await Promise.all(
    SOURCES.map(async ({ source }) => {
      try {
        const response = await fetch(source, {
          cf: { cacheTtl: CACHE_SECONDS },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) {
          console.error(`数据源请求失败：${source} (${response.status})`);
          return null;
        }
        return response;
      } catch (error) {
        console.error(`数据源连接失败：${source}`, error);
        return null;
      }
    }),
  );
  const validResponses = responses.filter(
    (response): response is Response => response !== null,
  );
  if (validResponses.length === 0) {
    throw new Error("所有上游节点源读取失败");
  }
  const documents = await Promise.all(
    validResponses.map((response) => response.text()),
  );
  return stringify({ proxies: mergeProxies(documents) });
}

function renderHome(): string {
  const sourceItems = SOURCES.map(
    ({ github, subscription }) => `
      <section class="source">
        <h2>数据源</h2>
        <p><span>GitHub：</span><a href="${github}">${github}</a></p>
        <p><span>订阅：</span><a href="${subscription}">${subscription}</a></p>
      </section>`,
  ).join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Free Node</title>
    <style>
      :root { color-scheme: dark; font-family: system-ui, sans-serif; }
      body { max-width: 900px; margin: 0 auto; padding: 48px 20px; background: #111; color: #eee; }
      h1 { margin-bottom: 8px; }
      .intro { color: #aaa; margin-bottom: 32px; }
      .source { margin: 18px 0; padding: 20px; border: 1px solid #333; border-radius: 12px; background: #191919; }
      h2 { margin-top: 0; font-size: 1.1rem; }
      p { overflow-wrap: anywhere; line-height: 1.7; }
      span { color: #aaa; }
      a { color: #65a9ff; }
      .subscription { margin-top: 32px; }
    </style>
  </head>
  <body>
    <h1>Free Node</h1>
    <p class="intro">聚合多个公开数据源的免费代理节点订阅。</p>
    ${sourceItems}
    <p class="subscription">合并订阅：<a href="/proxy.yml">/proxy.yml</a></p>
  </body>
</html>`;
}

async function refreshCache(cache: Cache): Promise<void> {
  const body = await loadMergedYaml();
  const response = new Response(body, {
    headers: {
      "content-type": "application/yaml; charset=utf-8",
      "cache-control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
  await cache.put(CACHE_KEY, response);
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (new URL(request.url).pathname === "/") {
      return new Response(request.method === "HEAD" ? null : renderHome(), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const cache = (caches as CacheStorage & { default: Cache }).default;
    const cached = await cache.match(CACHE_KEY);
    if (!cached) {
      return new Response("缓存尚未生成，请稍后再试", { status: 503 });
    }
    return request.method === "HEAD"
      ? new Response(null, cached)
      : cached;
  },

  async scheduled(event, env, ctx): Promise<void> {
    const cache = (caches as CacheStorage & { default: Cache }).default;
    try {
      await refreshCache(cache);
      console.log(`定时更新完成：${new Date(event.scheduledTime).toISOString()}`);
    } catch (error) {
      console.error("定时更新失败", error);
      throw error;
    }
  },
} satisfies ExportedHandler;

export { extractProxies, mergeProxies };
