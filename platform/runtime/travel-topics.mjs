export const TRAVEL_TOPIC_GROUPS = Object.freeze([
  { id: "humanities", label: "人文与城市", description: "从历史、建筑、展馆和地方精神理解目的地" },
  { id: "nature", label: "自然与户外", description: "按地貌、季节、体力和安全条件寻找户外体验" },
  { id: "lifestyle", label: "吃喝与生活", description: "进入当地人的味觉、市场、社区和消费空间" },
  { id: "entertainment", label: "兴趣与娱乐", description: "围绕内容 IP、演出、节庆和专项兴趣规划" },
  { id: "travel_style", label: "旅行方式", description: "根据同行者、交通方式和旅行节奏筛选地点" },
]);

export const TRAVEL_TOPICS = Object.freeze([
  { id: "history", group: "humanities", label: "历史遗迹", scope: "年代、人物、迁徙、考古、历史建筑与地方记忆", aliases: ["历史", "遗迹", "古迹"] },
  { id: "culture", group: "humanities", label: "文化非遗", scope: "非遗、手艺、民俗、地方身份与传承体验", aliases: ["文化", "非遗", "民俗"] },
  { id: "architecture", group: "humanities", label: "建筑漫步", scope: "古建、近现代建筑、街区肌理、城市更新与步行路线", aliases: ["建筑", "城市漫步", "街区"] },
  { id: "museums", group: "humanities", label: "博物馆", scope: "博物馆、纪念馆、专题展馆、馆藏亮点与参观规则", aliases: ["博物馆", "展馆", "纪念馆"] },
  { id: "art", group: "humanities", label: "艺术设计", scope: "美术馆、画廊、公共艺术、设计空间与当期展览", aliases: ["艺术", "展览", "美术馆", "设计"] },
  { id: "faith", group: "humanities", label: "宗教信仰", scope: "寺庙、教堂、祠堂、宗教艺术、礼仪边界与参访规则", aliases: ["宗教", "信仰", "寺庙", "教堂", "古建信仰"] },
  { id: "literature", group: "humanities", label: "文学名人", scope: "作家故居、文学地标、名人足迹、地方作品与阅读空间", aliases: ["文学", "名人", "作家", "故居"] },
  { id: "industrial", group: "humanities", label: "工业遗产", scope: "工业遗址、铁路港口、厂房更新、产业历史与技术遗产", aliases: ["工业", "工业遗产", "厂房", "铁路历史"] },

  { id: "scenery", group: "nature", label: "自然风景", scope: "山水、地貌、季节景观、公园与观景体验", aliases: ["风景", "自然", "山水"] },
  { id: "outdoors", group: "nature", label: "徒步登山", scope: "步道、登山、穿越、海拔、体力分级、天气与户外安全", aliases: ["户外", "徒步", "登山"] },
  { id: "cycling", group: "nature", label: "骑行路线", scope: "城市与郊野骑行、租车、路况、爬升、补给与携车规则", aliases: ["骑行", "自行车", "单车"] },
  { id: "camping", group: "nature", label: "露营观星", scope: "营地、观星、日出、装备、预约、天气与夜间安全", aliases: ["露营", "观星", "星空"] },
  { id: "coast", group: "nature", label: "海滨海岛", scope: "海滩、海岛、潮汐、海岸步道、轮渡与季节风险", aliases: ["海滨", "海岛", "海滩", "海岸"] },
  { id: "water", group: "nature", label: "亲水体验", scope: "游船、漂流、桨板、潜水、湖泊河流与水上安全", aliases: ["亲水", "水上", "漂流", "潜水", "游船"] },
  { id: "snow", group: "nature", label: "冰雪旅行", scope: "滑雪、冰场、雪景、装备租赁、雪季与低温交通风险", aliases: ["冰雪", "滑雪", "雪景"] },
  { id: "wildlife", group: "nature", label: "动物生态", scope: "动物园、湿地、观鸟、自然保护地、生态季节与参访边界", aliases: ["动物", "生态", "观鸟", "湿地"] },

  { id: "food", group: "lifestyle", label: "地方美食", scope: "地方菜、代表小吃、餐厅与饮食习惯", aliases: ["美食", "吃喝", "餐厅"] },
  { id: "local_life", group: "lifestyle", label: "在地生活", scope: "社区、早市、公共空间、本地人的休闲方式与生活节奏", aliases: ["在地", "本地生活", "社区"] },
  { id: "markets", group: "lifestyle", label: "菜场夜市", scope: "菜市场、早市、夜市、时令食材、摊位秩序与营业时段", aliases: ["菜场", "市场", "早市", "夜市"] },
  { id: "coffee", group: "lifestyle", label: "咖啡甜品", scope: "本地咖啡、烘焙、甜品、茶歇空间与特色门店", aliases: ["咖啡", "甜品", "烘焙", "下午茶"] },
  { id: "tea", group: "lifestyle", label: "茶酒体验", scope: "茶园、茶馆、酒庄、酒吧、产地风味、品鉴与预约规则", aliases: ["茶", "茶馆", "酒", "酒庄", "品鉴"] },
  { id: "nightlife", group: "lifestyle", label: "夜游娱乐", scope: "夜景、夜间街区、酒吧、夜间开放场馆与晚间安全", aliases: ["夜游", "娱乐", "夜生活"] },
  { id: "shopping", group: "lifestyle", label: "购物市集", scope: "市集、商圈、地方物产、书店与伴手礼", aliases: ["购物", "市集", "买东西"] },
  { id: "craft", group: "lifestyle", label: "手作体验", scope: "传统工艺、工作坊、手作课程、创意店铺与预约体验", aliases: ["手作", "手工", "工作坊", "工艺体验"] },

  { id: "film", group: "entertainment", label: "影视动漫", scope: "影视取景地、动漫游戏相关场所与主题体验", aliases: ["影视", "动漫", "游戏", "取景地"] },
  { id: "photography", group: "entertainment", label: "摄影打卡", scope: "日出日落、机位、光线、城市天际线与拍摄限制", aliases: ["摄影", "拍照", "打卡"] },
  { id: "performance", group: "entertainment", label: "演出演艺", scope: "戏剧、音乐会、地方演艺、剧场、票务与当期演出", aliases: ["演出", "演艺", "戏剧", "音乐会"] },
  { id: "festivals", group: "entertainment", label: "节庆活动", scope: "节日、庙会、展会、季节活动、日期核验与人流风险", aliases: ["节庆", "节日", "庙会", "展会", "活动"] },
  { id: "sports", group: "entertainment", label: "体育赛事", scope: "球赛、赛车场、体育场馆、赛事日程、票务与观赛交通", aliases: ["体育", "赛事", "球赛", "观赛"] },
  { id: "themeparks", group: "entertainment", label: "乐园游乐", scope: "主题乐园、水乐园、游乐设施、排队策略、票务与身高限制", aliases: ["乐园", "游乐园", "主题公园"] },
  { id: "technology", group: "entertainment", label: "科技探索", scope: "科技馆、天文馆、互动展项、创新园区与工业科技体验", aliases: ["科技", "科技馆", "天文馆", "创新"] },

  { id: "family", group: "travel_style", label: "亲子家庭", scope: "儿童友好场馆、互动体验、休息与照护条件", aliases: ["亲子", "家庭", "儿童"] },
  { id: "wellness", group: "travel_style", label: "康养度假", scope: "温泉、度假村、疗愈空间、休闲与季节适宜性", aliases: ["康养", "温泉", "度假"] },
  { id: "slow", group: "travel_style", label: "慢旅行", scope: "低密度日程、长停留、散步、发呆空间与舒缓节奏", aliases: ["慢旅行", "慢游", "休闲"] },
  { id: "roadtrip", group: "travel_style", label: "自驾公路", scope: "景观公路、停车、补能、盘山路、长途驾驶与沿途停靠", aliases: ["自驾", "公路旅行", "开车"] },
  { id: "railway", group: "travel_style", label: "火车旅行", scope: "观光列车、铁路沿线、车站接驳、班次与沿途停留", aliases: ["火车", "铁路", "高铁", "观光列车"] },
  { id: "accessible", group: "travel_style", label: "无障碍友好", scope: "轮椅通行、电梯、坡道、卫生间、少台阶路线与服务信息", aliases: ["无障碍", "轮椅", "少台阶", "行动不便"] },
  { id: "pet", group: "travel_style", label: "宠物同行", scope: "宠物友好住宿、餐饮、公园、交通限制与牵引要求", aliases: ["宠物", "带狗", "带猫", "宠物友好"] },
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
