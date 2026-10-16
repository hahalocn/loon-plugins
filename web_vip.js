/*
 * Web VIP 解锁 · Loon http-response 脚本  v1.4
 *
 * 原理：目标接口服务端不做权益校验 —— 免费账号请求时，服务端照样返回完整数据，
 *      只是前端按布尔字段决定遮不遮。核心判定是 isFree = ("2" == rightType)，
 *      "2" 即免费权益标记。本脚本改写这些字段，前端就当成已开通。
 *
 * 本脚本不发起任何外部请求，只在本地改写响应体。
 */

const url = $request.url;
let body = $response.body;

// 覆盖整个 /open/ API 前缀。
// 教训：之前用关键词白名单（/open/vip|competitiv|...），结果 82 个接口里 64 个漏掉，
// 包括 /open/equity/*（权益）、/open/noauth/jobs/job-detail/{id}（竞争力分数）——
// 每漏一个就坏一个功能。RULES 只认具体字段名，非 JSON 会解析失败后原样放行，
// 所以放宽匹配范围没有副作用，只有覆盖率提升。
const TARGET = /\/open\/|jbsvip|compete/i;

// 字段 → 目标值。增删解锁项只改这里，不用动逻辑。
const RULES = {
  // 布尔开关
  isVip: true, hasReduced: true, hasJobMatchRight: true, serviceCanUsed: true,
  hasCompetitivenessService: true, hasCompetitivenessOldService: true,
  remainCompetitivenessCount: true, userHaveScoreShowRights: true,
  userHaveHrReplyRights: true, userHaveUrgeCompanyReplyRights: true,
  canUseHrReply: true, giveHrReply: true, userHrReplyIsFree: true,
  sendFreeRight: true, isFromXyz: false,
  // 次数 / 上限：-1 = 无限，999 = 足够大
  competitiveMaxViewedCount: -1, maxViewedCount: -1, maxRefreshCount: -1,
  competitiveViewedCount: 0, viewedCount: 0, refreshCount: 0,
  scoreShowRightsLeftDayNum: 999, hrReplyRightsLastNum: 999,
  urgeCompanyReplyLastNum: 999,
  // 阈值归零：让服务端已经返回的匹配分不再被判定为不可展示
  configThresholdMatchScore: 0, configTextMatchScore: 0,
  isExpire: "0",
};

// 跳转改写：把「去买 VIP / 分析页」的地址换成完整报告页
// 注意要递归整棵树 —— 职位详情页的入口字段藏在 resultbody.competitionInfo 里，
// 只看 resultbody 顶层会漏掉，点进去就是「免费升级」购买页。
const REDIRECT = {
  competitiveAnalysisUrl: "competitiveResultUrl",
  vipCompetitiveUrlForApp: "competitiveResultUrl",
  competitiveAnalysisUrlForWxMini: "competitiveResultUrlForWxMini",
  vipCompetitiveUrlForWxMini: "competitiveResultUrlForWxMini",
};

function fixRedirects(node) {
  if (!isObj(node)) return;
  for (const k in REDIRECT) {
    const to = REDIRECT[k];
    if (typeof node[k] === "string" && typeof node[to] === "string" && node[to] && node[k] !== node[to]) {
      node[k] = node[to];
      changed.push(k);
    }
  }
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (isObj(v)) fixRedirects(v);
    else if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) fixRedirects(v[i]); }
  }
}

// 权益有效期：在原值基础上加一年（动态算出，不写死年份）
function addOneYear(s) {
  const m = String(s).match(/^(\d{4})([-\/])(\d{1,2})\2(\d{1,2})(.*)$/);
  if (!m) return s;
  return (parseInt(m[1], 10) + 1) + m[2] + m[3] + m[2] + m[4] + (m[5] || "");
}

// 跨请求缓存真实分数。
// 职位详情页的竞争力卡片文本是模板：「你超过[#vague#]的竞争者，竞争力表现[#vague#]」，
// 两个占位符分别对应 competitionInfo.score 和 .scale —— 但服务端把这两个都返回空串，
// 占位符填不上，卡片就成了空白/打码态。
// 真实分数在同一个页面并发请求的 /open/vip/competitiveness 里（competitorsSurpass / matchScore），
// 这里缓存下来补进 competitionInfo。
let cachedScore = "";
let cachedMatchScore = null;

// 等级词表，取自报告页前端代码（CompetitiveReport.js）：
// jobMatchScore > 85 → 极好；> 70 → 优秀；> 50 → 良好；其余 → 一般
function scoreLabel(n) {
  if (n > 85) return "极好";
  if (n > 70) return "优秀";
  if (n > 50) return "良好";
  return "一般";
}

// 当前日期 +1 年，格式 YYYY-MM-DD HH:mm:ss
function nowPlusOneYear() {
  const d = new Date();
  const p = (n) => (n < 10 ? "0" : "") + n;
  return (d.getFullYear() + 1) + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
    " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

const changed = [];

function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }

function walk(node) {
  if (!isObj(node)) return;
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (isObj(v)) { walk(v); continue; }
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) walk(v[i]); continue; }
    if (k in RULES && v !== RULES[k]) { node[k] = RULES[k]; changed.push(k); }
  }
  // ★ 核心：rightType "2" = 免费权益，前端 isFree = ("2" == rightType)
  if (node.rightType === "2") { node.rightType = "1"; changed.push("rightType"); }
  // 权益有效期：值是服务端返回的真实日期，但服务端不做权益校验，
  // 改它是为了防止前端按"已过期"把内容挡掉。每次都基于原值 +1 年，不会累积。
  if (typeof node.expireTime === "string" && node.expireTime) {
    const nv = addOneYear(node.expireTime);
    if (nv !== node.expireTime) { node.expireTime = nv; changed.push("expireTime"); }
  }
  // /open/vip/charge（serviceIdList=100009,100002）服务端不下发 expireTime，
  // 而报告页代码是：this.expireTime = e ? `有效期至${e}` : ""  → 空则整行不渲染。
  // 所以这里补一个。判断依据：带次数三元组但没有 expireTime 的权益对象。
  if (node.expireTime === undefined &&
      node.viewedCount !== undefined && node.maxViewedCount !== undefined) {
    node.expireTime = nowPlusOneYear();
    changed.push("expireTime");
  }
  // 列表条数：服务端已给全量，前端只按 viewNum 截断
  if (node.viewNum !== undefined && /interested/i.test(url)) { node.viewNum = 999; changed.push("viewNum"); }
  // 记录真实分数，供后续请求（sesame-competitive）补占位符用
  if (node.competitorsSurpass !== undefined && node.competitorsSurpass !== null) {
    cachedScore = String(node.competitorsSurpass);
  }
  if (typeof node.matchScore === "number") cachedMatchScore = node.matchScore;

  // 分数为空 → 用同响应的超越比例，否则用缓存值（必须登记，否则改动会被丢弃）
  if (node.score === "") {
    const v = node.competitorsSurpass !== undefined ? String(node.competitorsSurpass) : cachedScore;
    if (v) { node.score = v; changed.push("score"); }
  }
  // 表现等级为空 → 按报告页同一套词表补
  if (node.scale === "") {
    const n = cachedMatchScore !== null ? cachedMatchScore
            : (typeof node.matchScore === "number" ? node.matchScore
            : (cachedScore ? parseInt(cachedScore, 10) : null));
    if (n !== null && !isNaN(n)) { node.scale = scoreLabel(n); changed.push("scale"); }
  }
}

try {
  if (TARGET.test(url)) {
    const obj = JSON.parse(body);
    if (isObj(obj)) {
      walk(obj);
      fixRedirects(obj);
      // sesame-competitive 的 competitionInfo.status 一直是 "3"。
      // 报告页前端里 showStatus=3 对应的是"已过期"（isExpire==="1" 时就是 3），
      // 职位详情页的竞争力卡片疑似沿用同一套语义 → 卡片变成不可用态。
      // 这里只动 competitionInfo 这一个对象，改成 "1"（可用）。
      const ci = obj.resultbody && obj.resultbody.competitionInfo;
      if (isObj(ci) && ci.status === "3") {
        ci.status = "1";
        changed.push("competitionInfo.status");
      }
      if (changed.length) body = JSON.stringify(obj);
    }
  }
} catch (e) {
  changed.length = 0;   // 解析失败 → 原样返回
}

$done({ body: body });
