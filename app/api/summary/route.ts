import tripData from "../../../trip.json";

function createMarkdown() {
  const poiById = new Map(tripData.pois.map((poi) => [poi.id, poi]));
  const lines = [
    "# 青田三日 · 山水侨乡食游",
    "",
    "> 历史、文化、风景与美食共同组成的三日可执行行程。",
    "",
  ];
  for (const day of tripData.days) {
    lines.push(`## Day ${day.day_number} · ${day.title}`, "", `时间：${day.window.start}–${day.window.end}`, "");
    for (const assignment of [...day.assignments].sort((a, b) => a.order_index - b.order_index)) {
      const poi = poiById.get(assignment.poi_id)!;
      lines.push(
        `### ${assignment.order_index + 1}. ${poi.name}`,
        "",
        `- 时间：${assignment.arrival_time}–${assignment.departure_time}`,
        `- 地址：${poi.address}`,
        `- 建议停留：${poi.content.stay_minutes} 分钟`,
        `- 推荐原因：${poi.content.why_visit}`,
        `- 到现场看：${poi.content.watch_for.join("；")}`,
        "",
      );
    }
  }
  lines.push("## 出发前确认", "", ...tripData.quality.warnings.map((warning) => `- ${warning}`), "");
  return lines.join("\n");
}

export async function GET() {
  const body = `\uFEFF${createMarkdown()}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": "attachment; filename=qingtian-trip-summary.md; filename*=UTF-8''%E9%9D%92%E7%94%B0%E4%B8%89%E6%97%A5%E8%A1%8C%E7%A8%8B%E6%91%98%E8%A6%81.md",
      "Cache-Control": "public, max-age=300",
    },
  });
}

