import { mkdir, writeFile } from "node:fs/promises";
import { parseAllDocuments, stringify } from "yaml";

const sources = [
  { github: "https://github.com/Barabama/FreeNodes", subscription: "https://raw.githubusercontent.com/Barabama/FreeNodes/refs/heads/feat/ai-crawler-v2/nodes/merged.yaml" },
  { github: "https://github.com/awesome-vpn/awesome-vpn", subscription: "https://raw.githubusercontent.com/awesome-vpn/awesome-vpn/master/clash.yaml" },
  { github: "https://github.com/vxiaov/free_proxies", subscription: "https://raw.githubusercontent.com/vxiaov/free_proxies/main/clash/clash.provider.yaml" },
  { github: "https://github.com/snakem982/proxypool", subscription: "https://raw.githubusercontent.com/snakem982/proxypool/main/source/clash-meta-2.yaml" },
  { github: "https://github.com/PuddinCat/BestClash", subscription: "https://raw.githubusercontent.com/PuddinCat/BestClash/refs/heads/main/proxies.yaml" },
  { github: "https://github.com/freenodes/freenodes", subscription: "https://fastly.jsdelivr.net/gh/freenodes/freenodes@main/clash.yaml" },
];

function extractProxies(document) {
  const proxies = document?.proxies;
  return Array.isArray(proxies)
    ? proxies.filter((proxy) => proxy && typeof proxy === "object" && !Array.isArray(proxy))
    : [];
}

function mergeProxies(documents) {
  const seen = new Set();
  const result = [];
  for (const source of documents) {
    for (const document of parseAllDocuments(source)) {
      if (document.errors.length > 0) throw document.errors[0];
      for (const proxy of extractProxies(document.toJS())) {
        const key = typeof proxy.name === "string" ? `name:${proxy.name}` : JSON.stringify(proxy);
        if (!seen.has(key)) {
          seen.add(key);
          result.push(proxy);
        }
      }
    }
  }
  return result;
}

async function main() {
  const results = await Promise.all(sources.map(async (source) => {
    try {
      const response = await fetch(source.subscription, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      console.error(`跳过数据源：${source.subscription}`, error.message);
      return null;
    }
  }));
  const documents = results.filter(Boolean);
  if (documents.length === 0) throw new Error("所有数据源都获取失败");

  await mkdir("public", { recursive: true });
  const proxies = mergeProxies(documents);
  await writeFile("public/proxy.yml", stringify({ proxies }));
  console.log(`已生成 public/proxy.yml，包含 ${proxies.length} 个节点`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
