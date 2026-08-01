import type { Metadata } from "next";
import Link from "next/link";
import tripData from "../../cases/qingtian/trip.json";
import styles from "./summary.module.css";

export const metadata: Metadata = {
  title: "青田三日行程摘要",
  description: "青田三日山水侨乡食游的可阅读行程摘要。",
};

export default function SummaryPage() {
  const poiById = new Map(tripData.pois.map((poi) => [poi.id, poi]));
  return (
    <main className={styles.page}>
      <nav className={styles.nav}><Link href="/cases/qingtian">← 返回青田行程</Link><a href="/api/summary">下载 UTF-8 Markdown</a></nav>
      <header className={styles.hero}>
        <p>QINGTIAN · 3 DAY TRIP</p><h1>青田三日<br />山水侨乡食游</h1>
        <div><span>3 天</span><span>18 个行程点</span><span>历史 · 文化 · 风景 · 美食</span></div>
      </header>
      <section className={styles.days}>
        {tripData.days.map((day) => (
          <article key={day.id}>
            <header><span>DAY {day.day_number}</span><div><h2>{day.title}</h2><p>{day.window.start}–{day.window.end}</p></div></header>
            <ol>
              {[...day.assignments].sort((a, b) => a.order_index - b.order_index).map((assignment) => {
                const poi = poiById.get(assignment.poi_id)!;
                return (
                  <li key={poi.id}>
                    <time>{assignment.arrival_time}<small>{assignment.departure_time}</small></time>
                    <div><h3>{poi.name}</h3><p>{poi.content.why_visit}</p><span>{poi.content.watch_for.slice(0, 3).join(" · ")}</span></div>
                  </li>
                );
              })}
            </ol>
          </article>
        ))}
      </section>
      <aside className={styles.notice}><strong>出发前确认</strong>{tripData.quality.warnings.slice(0, 4).map((warning) => <p key={warning}>· {warning}</p>)}</aside>
      <footer className={styles.footer}><Link href="/cases/qingtian">在地图中调整路线</Link><a href="/api/summary">下载行程摘要</a></footer>
    </main>
  );
}
