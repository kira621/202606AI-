# 202606AI-
AI训练营方向选择判断仓库

## 页面

- 测评入口：`https://personality.kiraown.com/`
- 统计后台：`https://personality.kiraown.com/stats.html`

`stats.html` 不在测评页暴露入口，并设置了 `noindex`。真正的数据权限由统计接口的 token 控制。

## 统计接入

GitHub Pages 只能托管静态页面，不能直接保存访问和答题数据。当前代码已经预留了统计埋点：

- `page_view`：打开测评链接
- `assessment_started`：点击开始测评
- `assessment_completed`：完成答题并生成结果，包含职场人格、主推岗位、可行性分数和五维分数

如要启用统计：

1. 部署 `analytics-server.js` 到一台可长期运行 Node 的服务器。
2. 设置环境变量：
   - `ANALYTICS_TOKEN`：统计后台查询 token
   - `ALLOWED_ORIGIN`：允许访问接口的页面域名，例如 `https://personality.kiraown.com`
   - `PORT`：服务端口，默认 `8788`
3. 配置子域名，例如 `stats-api.kiraown.com`，反向代理到该 Node 服务。
4. 把 `index.html` 里的 `ANALYTICS_ENDPOINT` 改成 `https://stats-api.kiraown.com/event`。
5. 打开 `stats.html`，填写 `https://stats-api.kiraown.com` 和查询 token，即可查看统计。

统计服务会把事件写入 `analytics-events.jsonl`，该文件已加入 `.gitignore`，不要提交到仓库。
