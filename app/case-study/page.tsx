import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./case-study.module.css";

export const metadata: Metadata = {
  title: "项目作品集｜青田 AI Travel Planner",
  description: "从多主题研究、真实高德 POI 到卡片与地图联动的 AI 旅行规划产品案例。",
};

const stages = [
  ["01", "主题研究", "历史、文化、风景、美食四条研究线分别产出有来源的候选地点。"],
  ["02", "事实汇编", "主流程跨主题去重、判断取舍，未核验内容不进入正式行程。"],
  ["03", "高德核验", "串行调用 POI 搜索与路线服务，保存 provider ID、GCJ-02 坐标、距离和耗时。"],
  ["04", "智能编排", "结合停留时长、营业风险和空间邻近关系生成三日可执行路线。"],
  ["05", "统一呈现", "同一份 trip.json 同时驱动日程卡片、路线地图、Markdown 和 GeoJSON。"],
];

const features = [
  ["卡片优先", "先让用户看懂每天去哪里、为什么去、停留多久，再用地图检查空间顺序。"],
  ["地图联动", "点卡片定位 Marker，点 Marker 回到卡片；每天路线拥有独立颜色和统计。"],
  ["候选地点池", "未安排或待确认地点不被丢弃，可按历史、文化、风景、美食筛选。"],
  ["诚实降级", "没有道路 geometry 时明确展示“路线示意”，不把直线包装成真实导航。"],
];

export default function CaseStudy() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.brand}><span>青</span> AI Travel Planner</Link>
        <Link href="/" className={styles.back}>打开交互 Demo ↗</Link>
      </nav>

      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>PRODUCT CASE STUDY · 2026</p>
          <h1>把 AI 攻略，重构成<br />可验证的旅行产品</h1>
          <p className={styles.lead}>以青田县三日游为真实测试：先做多主题研究，再用高德核验地点与路线，最后从统一数据生成卡片和地图。</p>
          <div className={styles.heroActions}>
            <Link href="/">体验三日规划</Link>
            <a href="/data/summary.md" className={styles.secondary}>下载行程摘要</a>
          </div>
        </div>
        <figure className={styles.cover}>
          <Image src="/og-v2.png" width={1728} height={910} priority alt="青田 AI Travel Planner 项目封面" />
          <figcaption>青田 · 山水侨乡食游</figcaption>
        </figure>
      </header>

      <section className={styles.metrics} aria-label="项目结果">
        <div><strong>4</strong><span>主题研究线</span></div>
        <div><strong>19</strong><span>高德已核验 POI</span></div>
        <div><strong>15</strong><span>真实距离 / 耗时路线</span></div>
        <div><strong>3 天</strong><span>可执行旅行安排</span></div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>01 / PROBLEM</div>
        <div className={styles.twoCol}>
          <h2>普通 AI 攻略的问题，不是写得不够多，而是缺少事实状态。</h2>
          <div className={styles.bodyCopy}>
            <p>地点可能重名、闭馆，路线可能跨城，推荐理由也常与真实位置脱节。旧版 Skill 擅长文化研究，却只能输出文字与静态卡片，无法回答“这个地方到底在哪里、能不能顺路去”。</p>
            <p>因此项目参考 TREK 的结构化思路，把旅行拆成 Trip、Day、POI、Assignment 和 RouteSegment，并为地点与路线建立可核验状态。</p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.dark}`}>
        <div className={styles.sectionLabel}>02 / WORKFLOW</div>
        <h2>研究不是终点，而是地点池的上游。</h2>
        <div className={styles.flow}>
          {stages.map(([no, title, copy]) => (
            <article key={no}>
              <span>{no}</span><h3>{title}</h3><p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>03 / PRODUCT</div>
        <div className={styles.twoCol}>
          <h2>卡片负责决策，地图负责空间验证。</h2>
          <p className={styles.bigNote}>不是“先做完卡片，最后贴一张地图”，而是卡片、Marker 与路线都由同一份 <code>trip.json</code> 实时派生。</p>
        </div>
        <div className={styles.featureGrid}>
          {features.map(([title, copy], index) => (
            <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{copy}</p></article>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.result}`}>
        <div className={styles.sectionLabel}>04 / REAL DEMO</div>
        <div className={styles.twoCol}>
          <div>
            <h2>青田三日，不只是美食，也不平均分配主题。</h2>
            <p>美食是主线，历史、文化与风景负责建立目的地理解。石门洞同时承担历史与山水；田鱼午餐被放回稻鱼共生文化；咖啡与西餐则连接华侨迁移史和今天的县城生活。</p>
          </div>
          <ol className={styles.days}>
            <li><b>Day 1</b><span>太鹤山 · 石雕博物馆 · 本地小吃 · 侨乡咖啡 · 瓯江夜色</span></li>
            <li><b>Day 2</b><span>千丝岩 · 石雕城 · 龙现田鱼 · 进口商品城 · 咖啡与西餐</span></li>
            <li><b>Day 3</b><span>石门洞历史山水 · 鱼丸 · 咖啡之窗 · 侨乡西餐 · 夜游备选</span></li>
          </ol>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionLabel}>05 / MY ROLE</div>
        <div className={styles.roleGrid}>
          <div><h3>产品与架构</h3><p>拆解 TREK，设计中国本地场景的数据契约、状态机和卡片—地图信息架构。</p></div>
          <div><h3>Agent 工作流</h3><p>编排主题研究、来源汇总、POI 消歧、路线计算与失败降级。</p></div>
          <div><h3>工程实现</h3><p>实现高德 MCP bridge、校验/渲染脚本、响应式 React Web Demo 与结构化导出。</p></div>
          <div><h3>验证</h3><p>用青田 3 日真实任务完成端到端测试，并保留 3 个不确定候选而非强行匹配。</p></div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.resume}`}>
        <div className={styles.sectionLabel}>RESUME COPY</div>
        <h2>可直接用于简历</h2>
        <blockquote>独立设计并实现 AI Travel Planner：借鉴 TREK 的结构化旅行模型，编排历史、文化、风景、美食多主题研究，接入高德 MCP 完成真实 POI 核验与路径规划；以统一 trip.json 驱动响应式行程卡片、地图联动和 GeoJSON 导出，并用青田三日案例验证 19 个 POI、15 段路线的端到端闭环。</blockquote>
        <div className={styles.downloads}>
          <a href="/data/trip.json">trip.json</a>
          <a href="/data/trip.geojson">GeoJSON</a>
          <a href="/data/summary.md">行程摘要</a>
          <Link href="/">交互 Demo</Link>
        </div>
      </section>

      <footer className={styles.footer}>AI Travel Planner · Qing田 Demo · Card-first, map-linked, research-grounded.</footer>
    </main>
  );
}
