# AI Related Papers

<img src="addon/content/icons/favicon.png" alt="AI Related Papers logo" width="72" height="72" />

在 Zotero 中查找关联文献、人工确认关联、浏览交互网络，并通过可选的 AI
重排和关键词标签辅助整理文献。

[English](doc/README-en.md) · [下载与版本](https://github.com/booknary/ai-related-papers/releases) · [问题反馈](https://github.com/booknary/ai-related-papers/issues)

当前版本 **0.1.1**，已在 **Zotero 10.0.6 / Windows** 的隔离测试库中通过
10 项回归测试。保留 Zotero 9 接口回退，但本次未重新实机测试 Zotero 9。
当前声明的兼容上限为 `10.0.*`。

## 安装

1. 打开 [Releases](https://github.com/booknary/ai-related-papers/releases)，从版本的
   **Assets** 下载 `ai-related-papers.xpi`，不要下载源码 ZIP 代替插件。
2. Zotero 中打开 **工具 → 插件**，点击齿轮，选择 **从文件安装附加组件**。
3. 选择 XPI，根据提示重启 Zotero。

如果 Releases 还没有发布版本，可以使用下文开发命令构建 XPI，或从仓库
**Actions → CI → 成功的运行 → build-result** 下载构建产物。下载 Actions
产物需要登录 GitHub，解压后再安装其中的 XPI。

首次安装后，打开 **编辑 → 设置 → AI Related Papers**。
macOS 从 Zotero 菜单打开设置。插件提供简体中文和英文界面，由 Zotero 的语言设置选择。

## 怎么使用

### 查找关联文献

1. 在文献列表中只选中一篇普通文献，右键选择 **查找关联文献**。
2. 插件在设定范围内，用标题、摘要、作者和标签计算本地候选分数。
3. 若启用 AI 重排，仅将本地排名靠前的候选发送给 API。
4. 在候选弹窗中勾选需要关联的文献，点击 **添加 Related Items**。

默认不勾选候选；取消弹窗不会修改关联。确认后会双向关联，例如 A 关联 B 时，
B 也关联 A。附件、笔记、订阅源条目、目标文献自身和已关联文献不会成为新增候选。

搜索只针对本地 Zotero 库，不从互联网检索新论文，也不自动导入论文。

### 关联网络

- 选中文献后，在右侧条目面板查看 **关联网络**。
- 或右键选择 **关联网络**，打开居中的独立弹窗。
- 弹窗支持 **1 层 / 2 层**；第二层是直接关联文献的关联文献。
- 单击气泡可选中对应 Zotero 条目；在 **2 层** 弹窗中，单击非中心气泡还会
  把该文献设为新中心并刷新网络，保留当前层级。
- 拖动气泡可调整位置，连线随之更新。侧栏只展示一层，不提供弹窗的层级切换。

网络表示 Zotero 中已经保存的 related item 关系，不是引用网络，也不是未确认的 AI 推荐。
侧栏最多显示 18 个关联节点，弹窗最多显示 42 个，另加中心条目。

### AI 生成关键词标签

1. 配置 API 地址、模型和 API Key。
2. 在设置中调整 **AI 生成标签数量**，默认 5，范围 1–20。
3. 单选或多选文献，右键选择 **AI 生成标签**。

只使用标题和摘要；缺少任一字段的条目会跳过。生成后直接追加标签，保留已有标签并去重，
完成后报告成功、跳过和失败数量。该命令可以独立于“启用 AI 打分”开关使用。

当前自动化方式是一次右键操作批量处理所选条目；不会监听新导入，也不会在后台自动处理全库。
模型可能返回少于设定数量的标签；重复标签不会再次添加。

### 批量清除关联

单选或多选普通文献，右键选择 **清除关联文献**。居中确认弹窗会显示条目数和关联数，
确认后同时移除正向和反向关联，包括未选中文献上对应的反向关系。
不删除文献、附件或标签。此操作没有插件内的一键撤销功能，请仔细核对确认范围。

## 设置

| 设置               | 默认值                            | 说明                                   |
| ------------------ | --------------------------------- | -------------------------------------- |
| 最大候选数量       | 10                                | 最终候选列表上限，范围 1–50            |
| 最低分数           | 3%                                | 本地候选筛选参考值，不代表相关性的概率 |
| 搜索范围           | 当前分类                          | 可改为当前分类及子分类，或当前文库     |
| 本地权重           | 标题 45、摘要 35、作者 15、标签 5 | 自动归一化，不必手动凑成 100           |
| 启用 AI 打分       | 关闭                              | 仅控制候选重排                         |
| AI rerank 候选数量 | 10                                | 只发送本地 Top N，范围 1–50            |
| AI 分数权重        | 50%                               | 本地与 AI 分数混合权重                 |
| AI 生成标签数量    | 5                                 | 每篇请求的标签数量上限，范围 1–20      |

在 Zotero 10 中多选分类时，搜索使用目标文献所属库内这些分类的并集；递归模式还包含
子分类。没有选中分类时使用目标文献所属库。

最低分不是硬性排除线：没有达到阈值的候选时，会回退到有本地相似信号的最高分结果；
分类内完全没有相似信号时，也可能展示零分候选供人工检查。分类中没有可用候选时，
会再尝试当前文库。请在候选弹窗中核对实际搜索范围和文献内容。

### OpenAI-compatible API

插件调用 `POST {baseURL}/chat/completions`。API Base URL 不要包含最后的
`/chat/completions`，不要在地址中填写 API Key。

| 字段                   | DeepSeek 示例                                      |
| ---------------------- | -------------------------------------------------- |
| API Base URL           | `https://api.deepseek.com`                         |
| 模型                   | 默认 `deepseek-v4-pro`，按服务商实际提供的模型填写 |
| API Key                | 仅在 Zotero 插件设置中输入自己的密钥               |
| DeepSeek thinking 参数 | 默认开启；不支持此参数的兼容服务应关闭             |
| 推理强度               | 默认 `high`，仅在发送 thinking 参数时生效          |

调用可能产生服务商费用。AI 重排失败时会提示并保留本地排序；标签生成失败会在结果摘要中计数。
本次兼容性测试未调用付费 AI API，具体模型、额度和响应格式以服务商为准。

## 隐私与数据

本地候选评分、网络显示和清除关联无需 AI 请求。

- **AI 重排**：发送来源文献及本地 Top N 候选的标题、摘要、作者、标签、年份、
  item ID 和候选本地分数。每篇标题最多 300 字符，摘要最多 1,200 字符。
- **AI 标签**：手动触发后发送标题和摘要，最多分别为 400 和 2,400 字符。
- 不读取或发送 PDF 正文、附件内容或全文索引。
- 数据直接发送到你配置的 API 服务商；保留政策由该服务商决定。仅对有权外发的文献元数据使用 AI。
- API Key 保存在本机 Zotero 偏好设置中，密码输入框只负责遮挡显示，不是独立的加密密钥保险库。
  对外分享 Zotero profile、偏好文件和日志前需自行去除密钥。

仓库不包含 API Key、个人 Zotero profile、文献数据库或 `.env`。`.env.example`
只用于开发路径配置。不要将真实密钥填入源码、Issue、截图或 Git 提交。

## 常见问题

**提示未找到候选**：检查搜索范围、文献标题/摘要/标签，以及相关文献是否已关联。
可以尝试“当前文库”范围或降低阈值。本地评分依赖词面相似性，不能保证召回所有语义相关论文。

**菜单没有显示**：“查找关联文献”和“关联网络”要求恰好选中一篇普通文献。
标签和清除关联支持多选。附件、笔记和订阅源条目不作为普通文献处理。

**AI 没有结果**：核对 Base URL、模型、余额和密钥；第三方服务不支持 DeepSeek 扩展参数时关闭 thinking。
标签生成还要求标题和摘要都存在。

**只看到一层网络**：侧栏固定一层。请从右键菜单打开独立弹窗并选择“2 层”。
如果没有第二跳关联，切换层级也不会增加节点。

## 开发与验证

需要系统 Node.js **22.8 或更新版本**、npm，以及本地 Zotero。

```sh
git clone https://github.com/booknary/ai-related-papers.git
cd ai-related-papers
npm ci
npm run build
npm run lint:check
```

正式产物在 `.scaffold/build/ai-related-papers.xpi`，同时生成 `update.json` 和
`update-beta.json`。构建不会发布或自动安装插件。

Windows 本机回归测试：

```powershell
$env:ZOTERO_PLUGIN_ZOTERO_BIN_PATH = 'D:\Zotero\zotero.exe'
npm test -- --no-watch
npm run build
```

请将路径替换为实际的 Zotero 程序。测试使用 `.scaffold/test` 中的隔离 profile 和数据目录；
测试构建后再次正式构建，确保最终 XPI 是 production 模式。开发热更新用 `npm run start`，
应先按 `.env.example` 配置独立开发 profile，不要指向个人文献库。

代码入口是 `src/index.ts`，生命周期在 `src/hooks.ts`，文献关联模块在
`src/modules/related/`，AI 标签模块在 `src/modules/tags/`，界面翻译在 `addon/locale/`。

## 发布与自动更新

推送 `main` 后，GitHub Actions 执行 CI。发布版本由维护者另行触发：

1. 更新 `package.json` 和 `package-lock.json` 版本，运行构建、lint 和本机回归测试。
2. 提交并推送后，为对应提交创建 `v<version>` 标签，例如当前版本为 `v0.1.1`。
3. 推送标签触发 `.github/workflows/release.yml`，构建 XPI 并上传到对应 GitHub Release，
   同时更新名为 `release` 的更新清单 Release。

```sh
git tag v0.1.1
git push origin v0.1.1
```

也可使用 `npm run release`，该命令执行 `zotero-plugin release`，会进行版本/标签及发布操作；
使用前先确认工作区和版本，避免与手动标签流程重复发布。

自动更新地址固定为：

```text
https://github.com/booknary/ai-related-papers/releases/download/release/update.json
```

发布后检查版本 Release 中的 XPI、更新清单中的下载地址、版本号、SHA-512 和
Zotero 兼容范围。仅推送源码不会创建公开的 XPI Release。

## 致谢与许可证

基于 [Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)，
使用 [Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit)、
[Zotero Plugin Scaffold](https://github.com/zotero-plugin-dev/zotero-plugin-scaffold)
和 [Zotero Types](https://github.com/windingwind/zotero-types)。

项目许可证见 [LICENSE](LICENSE)。依赖和上游组件保留各自许可证。
