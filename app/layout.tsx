import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://qingtian-ai-travel.amandeepchenisekyana.chatgpt.site"),
  title: "AI Travel Planner",
  description: "先研究、再核验、最后规划真实路线的 AI 旅行平台。",
  openGraph: {
    title: "AI Travel Planner · Research first, route last",
    description: "多源旅行研究、精简 POI 核验、每日编排与真实道路地图。",
    images: [{ url: "/og-platform.png", width: 1728, height: 910, alt: "AI Travel Planner 从研究证据到真实路线的产品流程" }],
    locale: "zh_CN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Travel Planner · Research first, route last",
    description: "多源旅行研究、精简 POI 核验、每日编排与真实道路地图。",
    images: ["/og-platform.png"],
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
