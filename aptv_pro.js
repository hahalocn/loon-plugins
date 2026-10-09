/**
 * APTV Pro 解锁脚本（Loon http-response 类型）
 *
 * 原理：APTV 的 Pro 权益由 RevenueCat 服务端下发。本脚本在 MITM 解密后，
 *       把 RevenueCat 的订阅者响应改写为「已购买 pro 权益」，使 App 判定为 Pro。
 *
 * 实测参数（来自 APTV 1.5.11 / bundle id: com.kimen.aptvpro）：
 *   RevenueCat 公钥 : appl_XLnjzAnooYgJCnswSNBaQsnwJrZ
 *   商品 ID         : com.kimen.aptvpro.lifetime
 *   权益 ID         : pro
 *   接口            : GET  /v1/subscribers/<app_user_id>
 *                     POST /v1/receipts
 */

const ENTITLEMENT_ID = 'pro';
const PRODUCT_ID     = 'com.kimen.aptvpro.lifetime';
const PURCHASE_DATE  = '2024-01-01T00:00:00Z';

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function buildPayload(appUserId) {
  const now = isoNow();
  return {
    request_date: now,
    request_date_ms: Date.now(),
    subscriber: {
      entitlements: {
        [ENTITLEMENT_ID]: {
          expires_date: null,
          grace_period_expires_date: null,
          product_identifier: PRODUCT_ID,
          purchase_date: PURCHASE_DATE
        }
      },
      first_seen: PURCHASE_DATE,
      last_seen: now,
      management_url: null,
      non_subscriptions: {
        [PRODUCT_ID]: [
          {
            id: 'aptvpro-lifetime',
            is_sandbox: false,
            purchase_date: PURCHASE_DATE,
            store: 'app_store'
          }
        ]
      },
      original_app_user_id: appUserId,
      original_application_version: '1.0',
      original_purchase_date: PURCHASE_DATE,
      other_purchases: {},
      subscriptions: {}
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

let body = $response.body;
let original = null;
try { original = JSON.parse(body); } catch (e) { original = null; }

const appUserId = extractAppUserId($request.url, original);

const alreadyPro = !!(original && original.subscriber &&
  original.subscriber.entitlements &&
  original.subscriber.entitlements[ENTITLEMENT_ID]);

if (!alreadyPro) {
  body = JSON.stringify(buildPayload(appUserId));
}

$done({ body });
