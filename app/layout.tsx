import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "青田三日 · AI Travel Planner",
  description: "卡片优先、地图联动的青田三日旅行工作台。",
  openGraph: {
    title: "青田三日 · 山水侨乡食游",
    description: "21 个真实高德 POI、15 段已核验路线，支持候选点插入和道路、遥感图层切换。",
    images: [{ url: "/og-v2.png", width: 1728, height: 910 }],
    locale: "zh_CN",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
