// ArkTSUp DevEco Studio 插件构建脚本
// 用法（在装有 DevEco Studio 的机器上）:
//   gradle buildPlugin   -> build/distributions/arktsup-deveco-0.1.0.zip
//
// 注意: intellij 版本需与你的 DevEco Studio 平台版本匹配。
// DevEco Studio 4.x 基于 IntelliJ 2023.x；如构建报版本不匹配，改 localPath 指向 DevEco 安装目录。
plugins {
    id 'java'
    id 'org.jetbrains.intellij' version '1.17.4'
}

group = 'com.arktsup'
version = '0.1.0'

repositories {
    mavenCentral()
}

dependencies {
    implementation 'com.google.code.gson:gson:2.11.0'   // JSON 解析 check 输出
}

intellij {
    // 二选一：
    // A) 使用 DevEco Studio 的本地 SDK（推荐，保证 API 版本匹配）
    // localPath = '/Applications/DevEco-Studio.app/Contents'   // macOS 示例
    // B) 用 IntelliJ IDEA CE 平台（插件功能不依赖 DevEco 特有 API）
    version = '2023.3'
    type = 'IC'
    pluginName = 'arktsup-deveco'
}

patchPluginXml {
    sinceBuild = '231'
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(17)
    }
}
