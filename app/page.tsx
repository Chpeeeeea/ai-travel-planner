import type { Metadata } from "next";
import tripData from "../trip.json";
import Planner from "./Planner";

export const metadata: Metadata = {
  title: "青田三日 · 山水侨乡食游",
  description: "从多主题研究、真实 POI 到三日卡片与地图联动的 AI 旅行规划 Demo。",
};

export default function Home() {
  return <Planner data={tripData} />;
}
