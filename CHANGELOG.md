# 项目变更记录

| 变更编号 | 变更日期 | 变更提出人 | 变更审核人 | 变更类型 | 影响等级 | 关联需求/缺陷 | 变更原因 | 变更内容 | 影响范围 | 测试验证 | 回滚方案 | 备注 |
|----------|----------|------------|------------|:---------|:---------|:--------------|:---------|:---------|:---------|:---------|:---------|:---------|
| C-20260804-01 | 2026-08-04 | 肖通 | — | 配置变更 | 一般 | — | 网站已迁移至 Cloudflare Pages 托管，原 Netlify git-gateway 后端无法在 Cloudflare 上使用，需切换 CMS 认证方式以支持图文自助发布 | 1. Decap CMS 后端从 `git-gateway` 改为 `github`（`static/admin/config.yml`）<br>2. 创建 GitHub 仓库 `lachie-lq/lawyerx-site`<br>3. 创建 GitHub OAuth App "LawyerX CMS"<br>4. Cloudflare Pages 关联 GitHub 仓库，构建命令 `node build.js`，输出目录 `_site` | CMS 认证方式变更，不影响网站前端展示；CMS 后台登录方式从 Netlify Identity 改为 GitHub OAuth | 手工验证：访问 https://lawyerx-site.pages.dev/admin/ 确认 CMS 后台可通过 GitHub 账号登录 | 将 `config.yml` 后端改回 `git-gateway` 并重新部署 | GitHub OAuth App Client ID: Ov23liAu7S214kcDrvZV；Cloudflare Pages 项目: lawyerx-site |
