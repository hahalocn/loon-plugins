/**
 * APTV Pro 解锁脚本（Loon http-response 类型）  v1.3
 *
 * v1.3 修复：
 *   - 只处理真正的 CustomerInfo 响应（含 subscriber 字段，或路径恰为
 *     /v1/subscribers/<id> 或 /v1/receipts）；此前会误伤
 *     /v1/subscribers/<id>/offerings，导致 App 购买模块出错
 *   - 匹配范围补上 api-production.8-lives-cat.io
 *
 * 原理：APTV 的 Pro 权益（isPro）来自 RevenueCat 的 CustomerInfo.entitlements。
 *       本脚本在 MITM 解密后把订阅者响应改写为「已购买 pro 权益」。
 *
 * 实测参数（APTV 1.5.12 / com.kimen.aptvpro）：
 *   RevenueCat 公钥 : appl_XLnjzAnooYgJCnswSNBaQsnwJrZ
 *   商品 ID         : com.kimen.aptvpro.lifetime
 *   权益 ID         : pro
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
  return {
    request_date: now,
    request_date_ms: Date.now(),
    subscriber: {
      entitlements: {
        [ENTITLEMENT_ID]: {
          grace_period_expires_date: null,
          purchase_date: PURCHASE_DATE,
          product_identifier: PRODUCT_ID,
          expires_date: FAR_FUTURE
        }
      },
      first_seen: PURCHASE_DATE,
      last_seen: now,
      management_url: null,
      non_subscriptions: {},
      original_app_user_id: appUserId,
      original_application_version: '1.0',
      original_purchase_date: ORIG_PURCHASE,
      other_purchases: {},
      subscriptions: {
        [PRODUCT_ID]: {
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
        }
      }
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

const url = $request.url || '';
const path = url.split('?')[0];

let original = null;
try { original = JSON.parse($response.body); } catch (e) { original = null; }

const looksLikeCustomerInfo = !!(original && typeof original === 'object' && original.subscriber);
const isCustomerInfoEndpoint =
  /\/v1\/subscribers\/[^\/]+$/.test(path) || /\/v1\/receipts$/.test(path);

// 不是权益响应（例如 offerings / product_entitlement_mapping）→ 原样放行
if (!looksLikeCustomerInfo && !isCustomerInfoEndpoint) {
  $done({});
} else {
  const appUserId = extractAppUserId(url, original);
  const alreadyPro = !!(original && original.subscriber &&
    original.subscriber.entitlements &&
    original.subscriber.entitlements[ENTITLEMENT_ID]);

  if (alreadyPro) {
    notify('APTV Pro', '命中但已有权益，放行', appUserId);
    $done({});
  } else {
    const body = JSON.stringify(buildPayload(appUserId));
    notify('APTV Pro', '已注入 pro 权益', appUserId);
    if ($response.body === '' || $response.body === undefined || $response.body === null) {
      $done({ status: 200, headers: { 'Content-Type': 'application/json' }, body });
    } else {
      $done({ body });
    }
  }
}
