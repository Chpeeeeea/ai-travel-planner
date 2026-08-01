# 青田 AI Travel Planner Demo

这是 `ai-travel-planner` 的首个真实城市 Demo。四条主题研究线先分别研究历史、文化、风景和美食，主流程再汇编候选地点、调用高德核验 POI 与相邻路线，最后由同一份 `trip.json` 驱动卡片和地图。

## 当前数据

- 3 天完整路线，美食为主线但不等于纯吃。
- 19 个已核验高德 POI。
- 15 段已核验路线距离与耗时。
- 3 个待消歧地点留在候选池。
- 桌面三栏和移动端“卡片 / 地图”切换。

当前地图使用真实 GCJ-02 坐标生成可交互的路线示意。高德 MCP 的路径结果没有返回 Polyline geometry，因此页面不会把点间连线冒充道路导航。完整高德 JSAPI 道路底图将在安全代理接入后启用。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3001`（若 3000 端口空闲，开发服务会优先使用 3000）。

## 验证

```bash
npm run build
npm test
```

旅行数据位于 `trip.json`。研究文档与静态 HTML、Markdown、GeoJSON 交付位于相邻的 `qingtian-food-demo` 目录。
