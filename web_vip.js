/*
 * Web VIP 解锁 · Loon http-response 脚本
 *
 * 原理：目标接口服务端不做权益校验 —— 免费账号请求时，服务端照样返回完整数据，
 *      只是前端按布尔字段决定遮不遮。核心判定是 isFree = ("2" == rightType)，
 *      "2" 即免费权益标记。本脚本改写这些字段，前端就当成已开通。
 *
 * 关闭回传：把 DEBUG 改成 false。不影响任何改写功能。
 */

const DEBUG = true;
const REPORT_URL = "http://192.168.31.49:11510/api/gkld/_report";

const url = $request.url;
let body = $response.body;
const status = $response.status || "";

// 只碰带权益字段的接口；其余请求不解析、不改写，原样放行
const TARGET = /\/open\/vip|user-rights|my-page|competitiv|interested|resume-refresh/i;

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

// 跳转改写：把「去买 VIP」的地址换成报告页
const REDIRECT = {
  competitiveAnalysisUrl: "competitiveResultUrl",
  vipCompetitiveUrlForApp: "competitiveResultUrl",
  competitiveAnalysisUrlForWxMini: "competitiveResultUrlForWxMini",
  vipCompetitiveUrlForWxMini: "competitiveResultUrlForWxMini",
};

// 权益有效期：在原值基础上加一年（动态算出，不写死年份）
function addOneYear(s) {
  const m = String(s).match(/^(\d{4})([-\/])(\d{1,2})\2(\d{1,2})(.*)$/);
  if (!m) return s;
  return (parseInt(m[1], 10) + 1) + m[2] + m[3] + m[2] + m[4] + (m[5] || "");
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
  // 列表条数：服务端已给全量，前端只按 viewNum 截断
  if (node.viewNum !== undefined && /interested/i.test(url)) { node.viewNum = 999; changed.push("viewNum"); }
  // 分数为空时用超越比例补上
  if (node.score === "" && node.competitorsSurpass !== undefined) node.score = String(node.competitorsSurpass);
}

// 只上报真正改动过的请求，payload 尽量小
function report(payload) {
  if (!DEBUG) return false;
  let text;
  try { text = JSON.stringify(payload); } catch (e) { return false; }
  const headers = { "Content-Type": "application/json" };
  try {
    if ($httpClient && $httpClient.post) {
      $httpClient.post({ url: REPORT_URL, headers: headers, body: text }, function () {});
      return true;
    }
  } catch (e) { /* 换下一种 */ }
  try {
    if ($task && $task.fetch) {
      $task.fetch({ url: REPORT_URL, method: "POST", headers: headers, body: text })
        .then(function () {}, function () {});
      return true;
    }
  } catch (e) { /* 放弃上报 */ }
  return false;
}

let done = false;
function finish(b) { if (done) return; done = true; $done({ body: b }); }

try {
  if (TARGET.test(url)) {
    const obj = JSON.parse(body);
    if (isObj(obj)) {
      walk(obj);
      const rb = obj.resultbody;
      if (isObj(rb)) {
        for (const k in REDIRECT) {
          const to = REDIRECT[k];
          if (typeof rb[k] === "string" && typeof rb[to] === "string" && rb[to]) {
            rb[k] = rb[to];
            changed.push(k);
          }
        }
      }
      if (changed.length) body = JSON.stringify(obj);
    }
  }
} catch (e) {
  changed.length = 0;   // 解析失败 → 原样返回，也不上报
}

if (changed.length) {
  const uniq = changed.filter(function (v, i, a) { return a.indexOf(v) === i; });
  const started = report({
    u: url.replace(/^https?:\/\/[^/]+/, "").slice(0, 120),
    st: status,
    ch: uniq,
  });
  if (started) setTimeout(function () { finish(body); }, 200);
  else finish(body);
} else {
  finish(body);
}
