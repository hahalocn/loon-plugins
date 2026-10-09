# loon-plugins

Loon 插件集合。

## APTV Pro 解锁（RevenueCat 响应注入）

通过 MITM 改写 RevenueCat 订阅者响应，使 APTV 判定为已购买 Pro 买断。

### 导入

Loon → 配置 → 插件 → 添加，粘贴：

```
https://raw.githubusercontent.com/hahalocn/loon-plugins/main/APTV-Pro-Unlock.plugin
```

### 使用前提

- 开启 MitM，并安装 + 信任 Loon 的 CA 证书
- 脚本由插件自动拉取：`aptv_pro.js`
- 导入后完全退出并重开 APTV（RevenueCat 有本地缓存）

### 实测参数（APTV 1.5.11 / com.kimen.aptvpro）

| 项 | 值 |
|---|---|
| RevenueCat 公钥 | `appl_XLnjzAnooYgJCnswSNBaQsnwJrZ` |
| 商品 ID | `com.kimen.aptvpro.lifetime` |
| 权益 ID | `pro` |
| 接口 | `GET /v1/subscribers/<app_user_id>` |

> 仅用于自有设备的兼容性研究。
