export const TRAVEL_TOPICS = Object.freeze([
  { id: "history", label: "历史遗迹", scope: "年代、人物、迁徙、考古、历史建筑与地方记忆", aliases: ["历史", "遗迹", "古迹"] },
  { id: "culture", label: "文化非遗", scope: "非遗、手艺、民俗、节庆、社区文化与地方身份", aliases: ["文化", "非遗", "民俗"] },
  { id: "scenery", label: "自然风景", scope: "山水、海滨、地貌、季节景观、公园与观景体验", aliases: ["风景", "自然", "山水"] },
  { id: "food", label: "地方美食", scope: "地方菜、代表小吃、餐厅、咖啡馆、市场与饮食习惯", aliases: ["美食", "吃喝", "餐厅"] },
  { id: "architecture", label: "建筑漫步", scope: "古建、近现代建筑、街区肌理、城市更新与步行路线", aliases: ["建筑", "城市漫步", "街区"] },
  { id: "museums", label: "博物馆", scope: "博物馆、纪念馆、专题展馆、馆藏亮点与参观规则", aliases: ["博物馆", "展馆", "纪念馆"] },
  { id: "art", label: "艺术展览", scope: "美术馆、画廊、公共艺术、设计空间、演出与当期展览", aliases: ["艺术", "展览", "美术馆"] },
  { id: "local_life", label: "在地生活", scope: "社区、早市、日常公共空间、本地人的休闲方式与生活节奏", aliases: ["在地", "本地生活", "社区"] },
  { id: "family", label: "亲子家庭", scope: "儿童友好场馆、互动体验、动物园、乐园、休息与照护条件", aliases: ["亲子", "家庭", "儿童"] },
  { id: "nightlife", label: "夜游娱乐", scope: "夜景、夜市、演出、酒吧、夜间开放场馆与晚间安全", aliases: ["夜游", "娱乐", "夜生活"] },
  { id: "shopping", label: "购物市集", scope: "市集、商圈、地方物产、手作店、书店与伴手礼", aliases: ["购物", "市集", "买东西"] },
  { id: "outdoors", label: "户外运动", scope: "徒步、骑行、露营、水上活动、滑雪与户外安全", aliases: ["户外", "运动", "徒步", "露营"] },
  { id: "photography", label: "摄影打卡", scope: "日出日落、机位、光线、城市天际线与拍摄限制", aliases: ["摄影", "拍照", "打卡"] },
  { id: "wellness", label: "康养度假", scope: "温泉、度假村、疗愈空间、慢旅行、休闲与季节适宜性", aliases: ["康养", "温泉", "度假"] },
  { id: "faith", label: "古建信仰", scope: "寺庙、教堂、祠堂、宗教艺术、礼仪边界与参访规则", aliases: ["宗教", "信仰", "寺庙", "教堂"] },
  { id: "film", label: "影视动漫", scope: "影视取景地、文学地标、动漫游戏相关场所与主题体验", aliases: ["影视", "动漫", "文学", "游戏"] },
]);

export const DEFAULT_TRAVEL_TOPIC_IDS = Object.freeze(["history", "culture", "scenery", "food"]);
export const MAX_SELECTED_TRAVEL_TOPICS = 8;

function normalized(value) {
  return String(value ?? "").normalize("NFKC").trim().toLowerCase().replace(/[\s·•・_\-—/]+/gu, "");
}

const topicById = new Map(TRAVEL_TOPICS.map((topic) => [topic.id, topic]));
const topicByName = new Map(TRAVEL_TOPICS.flatMap((topic) => [topic.label, ...topic.aliases].map((name) => [normalized(name), topic])));

export function topicFor(value) {
  return topicById.get(String(value ?? "")) ?? topicByName.get(normalized(value)) ?? null;
}

export function topicsForInterests(interests = []) {
  const selected = [];
  const seen = new Set();
  const unknown = [];
  for (const interest of interests) {
    const topic = topicFor(interest);
    if (topic && !seen.has(topic.id)) {
      seen.add(topic.id);
      selected.push(topic);
    } else if (!topic && String(interest ?? "").trim()) {
      unknown.push(String(interest).trim());
    }
    if (selected.length >= MAX_SELECTED_TRAVEL_TOPICS) break;
  }
  if (unknown.length && selected.length < MAX_SELECTED_TRAVEL_TOPICS) {
    selected.push({
      id: "special_interest",
      label: unknown.slice(0, 4).join(" / "),
      scope: `用户自定义兴趣：${unknown.slice(0, 8).join("、")}`,
      aliases: unknown.slice(0, 8),
    });
  }
  if (!selected.length) return TRAVEL_TOPICS.filter((topic) => DEFAULT_TRAVEL_TOPIC_IDS.includes(topic.id));
  return selected.slice(0, MAX_SELECTED_TRAVEL_TOPICS);
}

export function defaultTravelTopicLabels() {
  return TRAVEL_TOPICS.filter((topic) => DEFAULT_TRAVEL_TOPIC_IDS.includes(topic.id)).map((topic) => topic.label);
}
