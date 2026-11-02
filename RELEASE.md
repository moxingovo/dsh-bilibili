# 发布指南 / Release Guide

把 dsh-plugin-bilibili 发布到 GitHub（带 npm 打包产物）的全流程。

**现在的发布是 tag 驱动的**：本地打 tag → push → CI 自动跑验证、打包、建 Release。
手工产物不再需要上传，第 3 节末尾留给 CI 不可用时的兜底。

## 0. 发布前自查（每次都要过一遍）

- 只提交 **dsh-bilibili 这个文件夹** 里的内容。git 仓库必须建在 `dsh-bilibili` 内，不能建在
  上一级 `dsh-plugin-publish` 目录 —— 上一级还有另一个插件的仓库。
- `node_modules/` 在 `.gitignore` 里，别用 `git add -f` 把它带上去。
- ⚠️ **`package.json` 不能带 BOM**：harness 解析插件清单时按 UTF-8 读取该文件，带 BOM 会让
  整个插件挂载失败（v0.2.2 专门修过这个）。编辑后可用
  `node -e "const b=require('fs').readFileSync('package.json');console.log(b[0],b[1],b[2])"`
  确认头三字节不是 `239 187 191`。
- `~/.dsh` 下的 SESSDATA 与 API key 永远不会进入本项目。
- 提交前 `git status` 干净、`git log` 上没有误提交的凭据或机器路径。

## 1. 改版本号与 CHANGELOG（顺序不能颠倒）

1. 改 `package.json` 的 `version`。**这是版本号唯一的权威来源**：README 的安装示例、
   CHANGELOG 的标题、git tag、Release 名都跟它走。
2. 在 `CHANGELOG.md` **顶部**加一节，标题必须正好是 `## <version>`（例如 `## 0.2.4`）。
   CI 用 `awk` 从 CHANGELOG 抓这一节当 Release 正文：
   - 抓不到 → CI 报 `No CHANGELOG section found for <version>` 并失败；
   - 正文从下一个 `^## ` 开始截断，所以这一节要自带完整叙述（兼容性 / 实测 / 文档 / 测试分段是惯例）。
3. 顺带核对 README（中英）里的数字：测试条数、工具条数、错误码表条目都要跟着源码走。

## 2. 本地验证

```powershell
cd C:\Users\20906\dsh-plugin-publish\dsh-bilibili

npm ci --registry=https://registry.npmjs.org/   # 与 CI 一样的干净安装
npm test                                        # 20 项，离线（HTTP 全部 mock）
npm run typecheck                               # 对着 @deepseek-ai/* 的类型验证兼容性
npm run build                                   # 产物进 lib/，随提交一起走
```

> `typecheck` 就是「这条 harness 线能不能用」的本地答案：`devDependencies` 指向哪个
> `@deepseek-ai/*` 版本，验的就是哪一条线。升级插件兼容性时先改这几个 devDependencies。

## 3. 打 tag 并推送（CI 自动发布）

```powershell
cd C:\Users\20906\dsh-plugin-publish\dsh-bilibili
git add .
git commit -m "release: v0.2.4 — <一句话说明>"
git tag v0.2.4
git push && git push --tags
```

push 时会弹浏览器让你登录 GitHub（Git Credential Manager，Git for Windows 自带）；
若弹窗失败：github.com → Settings → Developer settings → Personal access tokens (classic)
→ 生成一个勾选 `repo` 的 token，登录时用户名填 lili844、密码粘贴 token。

推上去之后 `.github/workflows/release.yml` 会依次做：

1. `npm ci --registry=https://registry.npmjs.org/`；
2. `npm test`（20 项）；
3. `npm run typecheck`（对着 `@deepseek-ai/*` 的类型）；
4. `npm run build`；
5. `npm pack` 出 `.tgz` 并上传 artifact；
6. 从 CHANGELOG 抓 `<tag 去掉 v>` 那一节当正文，先删同 tag 的旧 Release（重发安全），
   再用 `softprops/action-gh-release` 建/更新 Release 并挂上 `.tgz`。

只看进度、不发布：仓库页 **Actions → Release → Run workflow**
（`workflow_dispatch`，只出 artifact，不建 Release）。

### 兜底：CI 不可用或要手工发

```powershell
npm pack                       # 产出 dsh-plugin-bilibili-<version>.tgz
```

然后在仓库页 **Releases → Draft a new release** → 选/建 tag `v<version>` → 贴 CHANGELOG 那一节
→ 把 `.tgz` 拖进附件区 → **Publish release**。tag 名必须是 `v<version>`，否则用户按版本号找不到包。

发到 npm（可选）：

```powershell
npm publish --access public --registry=https://registry.npmjs.org/
```

## 4. 仓库首页与上架

**About**（仓库页右侧齿轮改，上限 350 字符）：建议

> Unofficial DeepSeek Harness plugin: Bilibili video search, metadata, subtitle transcripts, direct
> play URLs and real video frames as image blocks (bilibili_search / video / subtitles / playurl /
> frames). 非官方社区插件。

**Topics**：`ai-agent` `bilibili` `deepseek` `deepseek-harness` `dsh-plugin` `llm-tools`
（`dsh-plugin` 会被官方生态收录）。

## 5. 版本线备忘

- `0.1.x`：只有 search / video / subtitles。
- `0.2.0` 起：`bilibili_playurl` 与多模态 `bilibili_frames`。
- `0.2.3` 起：同时支持 **DSH 0.1.6-alpha.2** 与 **0.1.7-rc.2**（0.1.7 移除了共享的
  `plugin` 消息来源 kind，改成插件自声明 `bilibili-frames`）。
- 动工具参数或返回结构前先看 `skills/plugin-tool-bilibili/SKILL.md` —— 它和 README、
  测试一起构成对模型/用户的契约，三者要同改。
