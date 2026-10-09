/**
 * APTV Pro 解锁脚本（Loon http-response 类型）  v1.2
 *
 * v1.2 变更（参照已验证可用的 RevenueCat 解锁结构）：
 *   - subscriptions 补全 ownership_type / period_type / original_purchase_date 等字段
 *   - expires_date 改为远期时间，兼容按订阅解析的 SDK 版本
 *   - 响应为空（304 / 空 body）时也能注入，并强制回 200
 *   - 命中弹通知，确认生效后把 NOTIFY 改成 false
 *
 * 原理：APTV 的 Pro 权益由 RevenueCat 服务端下发。本脚本在 MITM 解密后，
 *       把 RevenueCat 的订阅者响应改写为「已购买 pro 权益」，使 App 判定为 Pro。
 *
 * 实测参数（APTV 1.5.12 / bundle id: com.kimen.aptvpro）：
 *   RevenueCat 公钥 : appl_XLnjzAnooYgJCnswSNBaQsnwJrZ
 *   商品 ID         : com.kimen.aptvpro.lifetime
 *   权益 ID         : pro
 *   接口            : GET  /v1/subscribers/<app_user_id>
 *                     POST /v1/receipts
 */

const ENTITLEMENT_ID = 'pro';
const PRODUCT_ID     = 'com.kimen.aptvpro.lifetime';
const PURCHASE_DATE  = '2022-09-08T01:04:17Z';
const ORIG_PURCHASE  = '2022-09-08T01:04:18Z';
const FAR_FUTURE     = '2099-12-18T01:04:17Z';

const NOTIFY = true;   // 调试开关，确认生效后改 false

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildPayload(appUserId) {
  const now = isoNow();
  const subscription = {
    is_sandbox: false,
    ownership_type: 'PURCHASED',
    billing_issues_detected_at: null,
    period_type: 'normal',
    expires_date: FAR_FUTURE,
    grace_period_expires_date: null,
    unsubscribe_detected_at: null,
    original_purchase_date: ORIG_PURCHASE,
    purchase_date: PURCHASE_DATE,
    store: 'app_store'
  };
  const entitlement = {
    grace_period_expires_date: null,
    purchase_date: PURCHASE_DATE,
    product_identifier: PRODUCT_ID,
    expires_date: FAR_FUTURE
  };
  return {
    request_date: now,
    request_date_ms: Date.now(),
    subscriber: {
      entitlements: { [ENTITLEMENT_ID]: entitlement },
      first_seen: PURCHASE_DATE,
      last_seen: now,
      management_url: null,
      non_subscriptions: {},
      original_app_user_id: appUserId,
      original_application_version: '1.0',
      original_purchase_date: ORIG_PURCHASE,
      other_purchases: {},
      subscriptions: { [PRODUCT_ID]: subscription }
    }
  };
}

function extractAppUserId(url, original) {
  if (original && original.subscriber && original.subscriber.original_app_user_id) {
    return original.subscriber.original_app_user_id;
  }
  const m = String(url).match(/\/v1\/subscribers\/([^\/?]+)/);
  if (m) return decodeURIComponent(m[1]);
  return '$RCAnonymousID:aptv';
}

function notify(title, sub, content) {
  if (!NOTIFY) return;
  try { $notification.post(title, sub, content); } catch (e) {}
}

const raw = $response.body;
let original = null;
try { original = JSON.parse(raw); } catch (e) { original = null; }

const appUserId = extractAppUserId($request.url, original);

const alreadyPro = !!(original && original.subscriber &&
  original.subscriber.entitlements &&
  original.subscriber.entitlements[ENTITLEMENT_ID]);

if (alreadyPro) {
  notify('APTV Pro', '命中但已有权益，放行', appUserId);
  $done({});
} else {
  const body = JSON.stringify(buildPayload(appUserId));
  notify('APTV Pro', '已注入 pro 权益', appUserId);
  // 空 body（304 等）时一并把状态码拉回 200，避免客户端拿到空响应
  if (raw === '' || raw === undefined || raw === null) {
    $done({ status: 200, headers: { 'Content-Type': 'application/json' }, body });
  } else {
    $done({ body });
  }
}
