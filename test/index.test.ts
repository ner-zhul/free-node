import { describe, expect, it } from "vitest";
import { mergeProxies } from "../src/index";

describe("mergeProxies", () => {
  it("只合并 proxies 并按名称去重", () => {
    const result = mergeProxies([
      "proxies:\n  - name: one\n    type: ss\n  - name: two\n    type: vmess\nproxy-groups:\n  - name: ignored",
      "proxies:\n  - name: two\n    type: other\n  - name: three\n    type: trojan\nrules:\n  - MATCH,DIRECT",
    ]);

    expect(result.map((proxy) => proxy.name)).toEqual(["one", "two", "three"]);
    expect(result).not.toContainEqual(expect.objectContaining({ rules: expect.anything() }));
  });

  it("支持同一个 YAML 源中的多个文档", () => {
    const result = mergeProxies([
      "proxies:\n  - name: one\n    type: ss\n---\nproxies:\n  - name: two\n    type: vmess",
    ]);

    expect(result.map((proxy) => proxy.name)).toEqual(["one", "two"]);
  });
});
