import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./case-study.module.css";

export const metadata: Metadata = {
  title: "项目作品集｜青田 AI Travel Planner",
  description: "从多主题研究、真实高德 POI 到卡片与地图联动的 AI 旅行规划产品案例。",
};

const stages = [
  ["01", "说出偏好", "选择目的地、天数和兴趣重点，例如青田三日、美食优先。"],
  ["02", "发现地点", "从历史、文化、风景与美食中找到值得加入旅程的真实地点。"],
  ["03", "确认可去", "核对位置、开放提示、停留时间，以及地点之间是否真正顺路。"],
  ["04", "生成行程", "把地点组合成节奏合理的每日路线，并在地图中呈现真实道路。"],
  ["05", "随时调整", "加入候选点、改变顺序或移除地点，地图和通勤时间即时刷新。"],
];

const features = [
  ["真实道路", "地图显示高德实际道路，不用地点之间的直线代替可执行路线。"],
  ["候选点上图", "还没加入行程的地点也能在地图中查看，先判断位置再决定。"],
  ["自由调整", "智能插入候选点，也可以上移、下移或移除站点，路线自动重算。"],
  ["地点简介", "每张卡片都能展开推荐原因、建议停留、开放提示和现场看点。"],
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
          <h1>从想去的地方，生成<br />真正走得通的旅行</h1>
          <p className={styles.lead}>用卡片了解每个地点，用地图查看真实道路；找到新的候选点后，可以直接加入当天路线并重新规划。</p>
          <div className={styles.heroActions}>
            <Link href="/">体验三日规划</Link>
            <Link href="/summary" className={styles.secondary}>查看行程摘要</Link>
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
        <div className={styles.sectionLabel}>01 / PRODUCT IDEA</div>
        <div className={styles.twoCol}>
          <h2>旅行规划不应该是一篇读完就放下的攻略。</h2>
          <div className={styles.bodyCopy}>
            <p>用户需要知道的不只是“哪里值得去”，还包括它在哪一天、为什么被选择、前后怎么走，以及临时想加一个地点时会不会绕路。</p>
            <p>AI Travel Planner 把地点理解、每日安排和地图操作放在同一个界面里，让旅行者可以边看、边选、边调整。</p>
          </div>
        </div>
      </section>

      <section className={`${styles.section} ${styles.dark}`}>
        <div className={styles.sectionLabel}>02 / WORKFLOW</div>
        <h2>从旅行想法，到每天可以直接照着走。</h2>
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
          <h2>卡片帮助选择，地图帮助行动。</h2>
          <p className={styles.bigNote}>在卡片里了解推荐原因和现场看点，在地图里检查真实道路与通勤成本；任何路线调整都会同步反映到两边。</p>
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
        <div className={styles.sectionLabel}>05 / EXPERIENCE</div>
        <div className={styles.roleGrid}>
          <div><h3>看懂地点</h3><p>展开卡片即可查看为什么去、现场看什么、建议停留多久以及开放提示。</p></div>
          <div><h3>看见路线</h3><p>每天使用不同颜色呈现，真实道路、地点顺序和通勤成本一眼可见。</p></div>
          <div><h3>加入候选</h3><p>地图上的“＋”代表可加入地点，系统会自动寻找绕行更少的位置。</p></div>
          <div><h3>自己做决定</h3><p>路线并非一次性结果；旅行者可以继续排序、删除，并随时恢复默认方案。</p></div>
        </div>
      </section>
      <footer className={styles.footer}>AI Travel Planner · 青田三日 · 看懂地点，也走得通路线。</footer>
    </main>
  );
}
