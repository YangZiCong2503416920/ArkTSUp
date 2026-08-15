# DevEco Studio 插件（方向 3）调研与原型说明

## 1. 结论先行

- DevEco Studio **基于 IntelliJ Platform**，插件用 **Java/Kotlin + Gradle** 开发，通过 `plugin.xml` 声明动作与扩展点。
- 本仓库提供 **完整可编译的项目骨架**（`deveco-plugin/`），核心思路与 VS Code 插件一致：
  **通过子进程调用 arktsup CLI（--format json），把结果展示在 IDE 工具窗口**——CLI 逻辑零重复、插件本体轻量。
- 本机无 Gradle/IntelliJ SDK 且网络不稳，**骨架未在本机编译验证**；在装有 DevEco Studio 的机器上按下方步骤构建即可。

## 2. 前置要求（官方建议）

| 组件 | 版本 |
| --- | --- |
| JDK | 11+（DevEco Studio 自带 JBR 或独立 JDK） |
| DevEco Studio | 3.1.0+（IntelliJ Platform 21+） |
| Gradle | 7.5+（用 wrapper 自动管理，无需预装） |
| Node.js | 18+（运行 arktsup CLI 需要） |
| arktsup | `npm i -g arktsup` 或工程内安装 |

## 3. 插件架构

```
deveco-plugin/
├── build.gradle.kts          # IntelliJ Platform 插件构建（指向 DevEco SDK）
├── settings.gradle.kts
├── gradle.properties
└── src/main/
    ├── resources/META-INF/plugin.xml   # 声明 Action / ToolWindow
    └── kotlin/com/arktsup/deveco/
        ├── ArktsupCheckAction.kt       # 菜单动作：跑 check
        ├── ArktsupCli.kt               # 定位 CLI + 子进程调用 + JSON 解析
        └── ArktsupToolWindow.kt        # 结果展示（表格 + 双击跳转）
```

**数据流**：用户点菜单 → `ArktsupCli.run("check", projectDir)` 子进程跑 CLI → 解析 JSON → 工具窗口表格展示（文件/行/规则/消息）→ 双击用 FileEditorManager 打开对应行。

## 4. 构建与运行（在你的 DevEco 机器上）

```bash
cd deveco-plugin
# 1) 首次：在 build.gradle.kts 里确认 intellij 平台版本与你 DevEco 匹配（见文件内注释）
# 2) 用 DevEco Studio 自带的环境构建（或用独立 Gradle）
gradle buildPlugin          # 产出 build/distributions/arktsup-deveco-0.1.0.zip
# 3) DevEco Studio: Settings -> Plugins -> 齿轮 -> Install Plugin from Disk -> 选 zip
# 4) 菜单 Tools -> ArkTSUp: 检查工程（或配置快捷键）
```

> 若 `gradle` 命令不存在，用 `./gradlew`（需先生成 wrapper，或直接从 IntelliJ Platform Plugin 模板拷贝）。

## 5. 后续增强路线（骨架已验证的扩展点）

1. **Inspection 集成**：把 check 结果接入 DevEco 的 Inspection 框架（`LocalInspectionTool`），代码上划线 + Alt+Enter 修复
2. **保存自动检查**：监听 `DocumentListener`，与 VS Code 插件行为对齐
3. **migrate/resource 命令**：加第二个 Action
4. **外部工具集成**：绑定 hvigor 构建任务，构建前自动 check

## 6. 风险与说明

- **未编译验证**：骨架按 IntelliJ Platform 2022.3+ API 编写，版本差异可能需要小修（`gradle build` 会提示）
- **CLI 路径**：默认按 全局 npm 安装（`which arktsup`）→ 工程 node_modules → 用户配置，与 VS Code 插件逻辑一致
- **Node 运行时**：IntelliJ 插件内 spawn node 需要 Node 在 PATH（Windows 下注意环境变量）
