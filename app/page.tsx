import type { Metadata } from "next";
import PlatformHome from "./PlatformHome";

export const metadata: Metadata = {
  title: "AI Travel Planner · 先研究，再规划真实路线",
  description: "从官方文旅、小红书、OSM 与多主题研究生成候选池，只核验最终 POI 和相邻路线的 AI 旅行规划平台。",
};

export default function Home() {
  return <PlatformHome />;
}
