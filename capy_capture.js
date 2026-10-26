// CapyPlayer 接口采集脚本（Loon http-response）
// 作用：把命中域名的请求/响应完整回传到本机 8899，并在 JSON 响应体里插入标记用于验证
var LOG = 'http://192.168.31.141:8899/log';

function clip(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) + '...[truncated]' : s;
}

var hdrs = ($response && $response.headers) || {};
var ct = hdrs['Content-Type'] || hdrs['content-type'] || '';
var body = ($response && $response.body) || '';

// 回传原始报文
try {
  $httpClient.post({
    url: LOG,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: ($request && $request.url) || '',
      method: ($request && $request.method) || '',
      reqHeaders: ($request && $request.headers) || {},
      reqBody: clip(($request && $request.body) || '', 20000),
      status: ($response && $response.status) || 0,
      resHeaders: hdrs,
      resBody: clip(body, 80000)
    })
  }, function () {});
} catch (e) {}

// 插入可观测标记，便于用 curl 确认脚本确实执行
if (typeof body === 'string' && body.length) {
  if (/json/i.test(ct) && body.trim().charAt(0) === '{') {
    body = body.replace(/^\{/, '{"_capy_script":"ran",');
  } else if (/json/i.test(ct)) {
    body = body;
  } else {
    body = body + '\n<!--capy-script-ran-->';
  }
}

$done({ body: body });
