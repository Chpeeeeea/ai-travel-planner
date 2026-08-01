import type { Metadata } from "next";
import tripData from "../../../cases/qingtian/trip.json";
import Planner from "../../Planner";

export const metadata: Metadata = {
  title: "青田三日案例 · AI Travel Planner",
  description: "AI Travel Planner 的首个真实目的地案例：青田三日卡片、候选地点与高德真实道路地图。",
};

export default function QingtianCase() {
  return <Planner data={tripData} summaryHref="/summary" summaryLabel="行程摘要" backHref="/case-study" backLabel="产品介绍" />;
}
