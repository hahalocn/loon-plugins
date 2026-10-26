// CapyPlayer 接口采集脚本 v2（Loon http-response）
// 不再依赖本机 HTTP 服务：报文存进 $persistentStore，用一个特殊 URL 主动取回
var KEY = 'capy_buf_v1';

function readBuf() {
  try { var s = $persistentStore.read(KEY); return s ? JSON.parse(s) : []; } catch (e) { return []; }
}
function writeBuf(b) {
  try { $persistentStore.write(JSON.stringify(b), KEY); } catch (e) {}
}
function clip(s, n) {
  if (typeof s !== 'string') return '';
  return s.length > n ? s.slice(0, n) + '...[cut]' : s;
}

var url = ($request && $request.url) || '';
var resBody = ($response && $response.body) || '';

if (url.indexOf('__capy_dump=1') >= 0) {
  // 取回已采集的报文
  var dump = readBuf();
  $done({ body: JSON.stringify({ count: dump.length, items: dump }) });
} else if (url.indexOf('__capy_clear=1') >= 0) {
  writeBuf([]);
  $done({ body: JSON.stringify({ cleared: true }) });
} else {
  var buf = readBuf();
  buf.push({
    t: Date.now(),
    url: url,
    method: ($request && $request.method) || '',
    reqHeaders: ($request && $request.headers) || {},
    reqBody: clip(($request && $request.body) || '', 2000),
    status: ($response && $response.status) || 0,
    resHeaders: ($response && $response.headers) || {},
    resBody: clip(resBody, 6000)
  });
  while (buf.length > 25) buf.shift();
  writeBuf(buf);
  $done({ body: resBody });
}
