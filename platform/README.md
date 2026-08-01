# Platform pipeline

这里维护可复用的平台管线，青田只是它的一条案例数据。

```text
Brief + official / Xiaohongshu / OSM / topic research evidence
  -> compile: name-level candidate pool (no AMap)
  -> prepare-amap: 20–40 final POI verification queries
  -> schedule: 4–6 verified places per day
  -> adjacent-only route manifest
  -> cards and AMap JSAPI
```

三个阶段使用不同文件，避免研究候选被误写成已核验地点：

- `research-evidence.json`：来源证据与地点名称，不含高德实体数据。
- `candidate-pool.json`：去重、评分后的 20–40 个候选。
- `verified-candidates.json`：高德匹配完成后的实体地点。
- `itinerary.json`：每日安排与仅相邻点组成的路线请求。

运行方式：

```powershell
python platform/pipeline.py compile --brief brief.json --evidence research-evidence.json --output candidate-pool.json
python platform/pipeline.py prepare-amap --input candidate-pool.json --output amap-manifest.json
python platform/pipeline.py schedule --brief brief.json --verified verified-candidates.json --output itinerary.json
python platform/pipeline.py audit --input itinerary.json
```

高德调用由 provider adapter 或 Skill 的 MCP bridge 执行；本脚本不读取密钥，也不会在研究阶段调用高德。
