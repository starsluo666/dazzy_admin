# dazzy_admin

DAZZY 运营管理后台，使用 Vue 3、TypeScript、Vite 和 Element Plus。

```bash
npm install
npm run dev
```

## 收款与提现配置

入口：运营配置 → 收款与提现配置。沿用平台全局 `operations.manage` 权限；先部署后端 `backoffice.0031` 迁移，再发布后台前端。
字段、生效范围及服务器配置边界见后端 `docs/provider-receiving-account.md`。

```bash
npm run test:receiving-settings
npm run build
```

浏览器离线回归：准备 Playwright / Chromium，启动开发服务器后运行 `npm run test:receiving-settings:browser`。
默认本地地址 `http://127.0.0.1:5194`，可通过 `ADMIN_TEST_URL` 修改；`PLAYWRIGHT_MODULE` 可指向现有 Playwright 模块，`CHROME_EXECUTABLE` 可指定本机 Chromium，`TEST_SCREENSHOT` 可指定截图输出路径。测试仅在开发模式 `preview` 中运行，拦截全部业务接口并阻止外部网络请求，不使用真实账号或操作渠道资金。
