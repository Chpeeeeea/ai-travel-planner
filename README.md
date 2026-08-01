# 青田 AI Travel Planner Demo

这是 `ai-travel-planner` 的首个真实城市 Demo。四条主题研究线先分别研究历史、文化、风景和美食，主流程再汇编候选地点、调用高德核验 POI 与相邻路线，最后由同一份 `trip.json` 驱动卡片和地图。

## 当前能力

- 3 天完整路线，美食为主线但不等于纯吃。
- 21 个已核验高德 POI，1 个地点仍待消歧。
- 15 段已核验路线距离与耗时。
- 桌面端同时显示行程、地图和候选地点三栏。
- 平板和手机使用“行程 / 地图 / 候选”三视图，核心功能不因屏幕变窄而消失。
- 候选点可在地图查看、智能插入、调整顺序或移除。
- 地图可切换道路与遥感图层，遥感模式叠加路网和地名。
- 地图首次打开聚焦当前旅行研究区；移动端从隐藏视图切到地图后会重新计算视口，不会停留在默认城市或空白区域。
- 正式行程点与候选点均可双击放大到街区级，并可用“研究区”按钮返回目的地全域；切换日期或编辑后聚焦当天路线。

当前地图使用高德 JSAPI 和 GCJ-02 坐标。相邻地点会按行程顺序请求真实步行或驾车道路；请求失败的路段才使用虚线占位且不伪造耗时。生产环境通过服务端代理保护高德安全密钥。

公开 Demo：[https://qingtian-ai-travel.amandeepchenisekyana.chatgpt.site](https://qingtian-ai-travel.amandeepchenisekyana.chatgpt.site)

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

阶段更新和 GitHub 发布要求见 `AGENTS.md`；所有阶段变化必须同步记录到 `CHANGELOG.md`。
