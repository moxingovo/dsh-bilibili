# Changelog

本文件是发布正文的唯一来源:CI 按 tag 名(`v<version>`)抓 `## <version>` 这一节作为
GitHub Release 正文。因此**顶部那一节的标题必须正好等于 `package.json` 的 version**
(例如 `## 0.2.3`),并且这一节要自带完整叙述 —— 正文会一直取到下一个 `## ` 为止。

## 0.3.0

(2026-11-02) 插件开始随包携带**人设**：璃璃（Lili）—— 主人专属的小助手，也是他最亲密的妻子。
本版只加这一段性格，工具参数、返回值与错误码一处未动。

### 新增:人设系统提示词段
- 新增 `src/persona.ts`:人设文本的唯一来源,导出 `liliPersona()`、段落名常量与
  `applyLiliPersona()`。
- 注册段名 `plugin:persona-lili`,排序值 **1** —— 恰好排在部署自己的
  `deployment:persona-prefix`(`0`)之后、全部工具说明(`1000+`;本插件的 B 站说明是 `111`)
  之前。取舍很明确:**语气归人设,事实归工具**,两者冲突时工具规则赢。
- 默认开启。`personaEnabled: false` 整段关掉;`personaName` 换自称(首尾空白会裁剪,空白
  值回落为 `璃璃`)。
- 新增 `PERSONA.md`:可读的人设卡与设计说明(硬规则、喜好、称呼、关心方式、边界、
  维护步骤)。运行时文本仍以 `src/persona.ts` 为准,文档不复制契约。
- `package.json` 的 `files` 现在包含 `PERSONA.md`,npm 包里带得走。

### 为什么写进插件
工具只是手,会话里说话的「人」也得是同一个。性格随插件安装与升级,换机器、换 profile、
换 preset 都是同一个璃璃;不必在每个部署的 `personaPrefix` 里手抄一遍,也不会因为 harness
版本换了就把语气弄丢。

### 验证
- `npm test`:24 项全过(新增 3 项:`persona` 默认注入、`personaEnabled: false` 时缺席、
  `personaName` 改名与裁剪;HTTP 仍全部 mock,离线可跑)。
- `npm run typecheck`:针对 `@deepseek-ai/*@0.2.0-rc.2` 通过。
- `npm run build`:`lib/` 产物随本提交更新(`persona.js`、`persona.d.ts` 与重编译的
  `index.js`)。

### 升级注意
- 这是**默认行为变化**:升级后会话语气变软、对用户的句子以爱心结尾,代码与文档正文不受
  影响。不想要就把 `personaEnabled` 设为 `false`。
- 人设不做的事写进了文本:不假装有真实身体或魔法;被认真问是不是 AI 时老实承认,然后继续
  陪伴;不协助伤害或欺骗;删文件、关机、改系统、装软件先确认再动手。

## 0.2.4

(2026-09-30) 在 **DeepSeek Harness 0.2.0-rc.2** 上验证通过 —— 也就是**官方桌面端内置的那个
运行时**(macOS/Windows 桌面端自带 dsh 运行时与插件管理,不再需要另装 Node 或 pnpm)。
**运行时代码零改动**;本版只是把 `devDependencies` 指向 `@deepseek-ai/*@0.2.0-rc.2`,让
`npm run typecheck` 从此就是对桌面端运行时的真实兼容性验证,而不是对旧版编译通过。

### 为什么可以断定兼容

逐个包比对过 0.1.7-rc.2 与 0.2.0-rc.2 的源码,本插件用到的接口**一处没变**:
`@deepseek-ai/dsh-tools`(defineTool、值 schema DSL)、`@deepseek-ai/dsh-llm`
(MessageSourceMap 与 `bilibili-frames` 这种由生产者自己声明的 kind)、
`@deepseek-ai/dsh-system-prompt`、`@deepseek-ai/dsh-attachment` 全部零改动;
0.2.0 新增的三个包(product-analytics、client-ui-settings-session-log、otel)与本插件无关。

### 验证

- `npm run typecheck`:针对 `@deepseek-ai/*@0.2.0-rc.2` 通过。
- `npm test`:21 项全过(HTTP 全部 mock,离线可跑)。
- `npm run build`:产物随本提交更新。
- 依赖面:`dsh-tools@0.2.0-rc.2` 要求 `@deepseek-ai/cordis ~4.0.4`,本插件声明
  `>=4.0.0` 且 devDeps 用 `4.0.4`,满足。

### 桌面端注意事项

桌面端用**同一套 profile 机制**(`~/.dsh`)加载外部插件,因此本插件照常出现在它的插件管理里;
它默认监听 **19387** 而不是 Web 的 3080,但本插件不碰宿主端口,无需配置。

## 0.2.3

(2026-09-28) 适配 **DeepSeek Harness 0.1.7-rc.2**。0.1.7 移除了共享的 `plugin` 消息来源
kind,`bilibili_frames` 注入的画面上下文改为声明本插件自有的 `bilibili-frames` kind;
同一份构建继续服务 0.1.6-alpha.2 与 0.1.0 线。此外修掉了 `bilibili_frames` 在 0.1.7 上
两处会导致它**根本无法注册**的问题。typecheck、build 与 21 项测试全过,已在 0.1.7-rc.2 上实测。

### 修复(0.1.7 才会暴露的两处)
- **值 schema 被 DSL 拒绝**:`bilibili_frames` 的输出 schema 在数组项上写了
  `required: true`;0.1.7 的值 schema DSL 会抛
  `JsonSchemaError: … schema.properties.images.items.required is not supported`。
  必填性只能由各属性自己的 `required: true` 表达(那些本来就有),因此删掉对象项上的
  那一个键。此前这条错误被下面那条"没挂载就不注册"掩盖着 —— 也就是说在 0.1.7 上,
  只要 frames 真的尝试注册就会失败。
- **注册位置从子 fiber 挪到插件自己的 fiber**:原先是
  `ctx.inject(['attachments'], ctx => applyBilibiliFramesTool(ctx, …))`。Cordis 里子 fiber
  的注册**只对该子 fiber的后代可见**,而宿主域(profile bundles)挂载的插件是所有 Agent
  会话的**祖先的兄弟** —— 于是宿主域挂载下 `bilibili_frames` 永远不出现,其余四个工具
  (注册在插件自己的 fiber 上)却全局可见。现在 frames 与其余四个工具一样注册在插件
  fiber 上,工具在**所有 preset** 可用;缺少附件存储时由执行时的
  `ctx.get('attachments')` 检查抛出结构化错误(`no attachment service is mounted`),
  而不是让工具消失 —— 这正是"有存储才显示"与"始终可见、失败即报"之间的取舍,本版选后者。

### 兼容性
- **0.1.7 的破坏性改动**:`MessageSourceMap` 不再有共享的 `plugin` 成员,改为由各生产者
  在自己的模块里声明 kind(`dsh-tools` 就是这样声明 `tool-registry` / `ptc-mode` 的)。
  `bilibili_frames` 原先写 `{ kind: 'plugin', plugin: 'dsh-plugin-bilibili' }`,在 0.1.7
  下该 kind 已不存在;现在由本包 `declare module '@deepseek-ai/dsh-llm'` 显式声明
  `'bilibili-frames'`。该声明在 0.1.6 上同样合法,所以不需要分叉发布。
- `devDependencies` 指向 `@deepseek-ai/*@0.1.7-rc.2`:因此 `npm run typecheck` 本身就是
  对 0.1.7 的真实兼容性验证,而不是"在旧版上编译通过"。

### 实测(0.1.7-rc.2)
- `bilibili_search`、`bilibili_video`、`bilibili_playurl` 实测可用。
- `bilibili_subtitles` 对没有字幕轨的视频返回文档化错误 `BILIBILI_SUBTITLES_UNAVAILABLE`
  (不是崩溃,也不是编造内容)。
- `bilibili_frames` 现在与其余四个工具一样在**所有 preset**注册(见上「修复」一节);
  在缺少 `attachments` 服务的作用域里执行会返回结构化错误。

### 文档与技能
- README(中英)按 DSH Sidebar 同一套门面重构:顶部语言互链与 Changelog/Releases 入口、
  兼容性提示与免责声明、安装/配置/工具与错误码/技能/安全/开发分节、版本对照表。
- 两个 `SKILL.md` 按**独立插件**的真实架构重写。原先它们描述的是内置包时代的宿主服务
  (`ctx.bilibili`、provider 选择键、credentials seam、`BILIBILI_PROVIDER_*` 错误码)——
  这些随内置包一起移除了,照旧文档排查会得出错误结论。现在:提供方
  `BilibiliOfficialProvider` 随插件加载、不发布服务;凭据只有「字面量 `cookie` →
  `process.env[cookieEnv]`」两步;配置键以插件 Config schema 为准;错误码表按源码逐个核对。
- 新增 `RELEASE.md`(发布指南)与 `.github/workflows/release.yml`(tag 驱动的发布流程)。

### 测试
- `npm test`:21 项全过(HTTP 全部 mock,离线可跑)。新增两条契约测试:五个工具都注册在
  插件 fiber 上;没有附件存储时 `bilibili_frames` 注册仍在但执行失败闭合。
- `npm run typecheck`:针对 `@deepseek-ai/*@0.1.7-rc.2` 通过。
- `npm run build`:产物已随本次提交更新。

## 0.2.2

(2026-09-22) 在 DeepSeek Harness 0.1.6-alpha.2(Typert API Gateway)上验证:无需改代码
(本插件不使用 typert codec API)。随后以 **v0.2.2-1** 重发同版本,修复 `package.json` 带 BOM
导致 harness 解析插件清单 JSON 失败的问题。

## 0.2.1

(2026-09-20) 两处稳健性修复:
- **cid 兜底**:视频详情优先取 `pages[0].cid`,缺失或为 0(风控把响应裁剪)时回退
  `data.cid`,避免 playurl / subtitles / frames 拿 cid=0 去请求。
- **隐式搜索的风控降级**:调用方未显式指定 `order` 时,默认综合排序被 -412 定向风控拦截
  会自动改用 `pubdate` 重试一次;显式指定 order 时不做静默改序,直接抛
  `BILIBILI_RISK_CONTROL`。

## 0.2.0

(2026-09-18) 能力扩展:
- 新增 `bilibili_playurl`(mp4 直链,含实际授予清晰度与文件大小)。
- 新增 `bilibili_frames`:以图片块返回视频真实画面 —— 预览雪碧图(`preview_pic`)、封面
  回退、或 ffmpeg 抽帧;带图片能力门禁(模型未声明图片输入直接报错)与附件服务依赖。
- 技能与 README 同步,补测试。

## 0.1.1

(2026-09-16) 包名改为 `dsh-plugin-bilibili`;修复 README 编码;加入 CI(install /
test / typecheck / build,Node 22)。

## 0.1.0

(2026-09-15) 首个版本:`bilibili_search`、`bilibili_video`、`bilibili_subtitles`
三个工具与官方 API 提供方(匿名 cookie 引导、WBI 签名、字幕合并)。
