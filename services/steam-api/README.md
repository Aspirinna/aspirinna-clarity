# Aspirinna Steam API

为静态博客的 `/games` 页面提供经过缓存和脱敏的 Steam 数据。Steam Web API Key 仅存在于服务器 `.env`，不会返回给浏览器。

## 数据刷新

- 资料、在线状态和最近游玩：默认每 10 分钟刷新。
- 游戏库、等级和徽章：默认每 60 分钟刷新。
- 刷新失败时继续使用磁盘中的上一次有效缓存。

## 本地接口

- `GET /health`：服务和缓存状态。
- `GET /v1/dashboard`：博客游戏页面需要的聚合数据。

## Docker 部署

```bash
cp .env.example .env
chmod 600 .env
# 编辑 .env，填写真实 STEAM_API_KEY
docker compose up -d --build
curl http://127.0.0.1:8788/health
curl http://127.0.0.1:8788/v1/dashboard
```

不要提交 `.env`，不要将 Steam API Key 写入前端或 OpenResty 配置。

## OpenResty

博客站点需要添加精确匹配的反向代理：

```nginx
location = /api/steam {
    proxy_pass http://127.0.0.1:8788/v1/dashboard;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

精确匹配规则会优先于静态网站目录中的 `/api/steam` 占位文件。
