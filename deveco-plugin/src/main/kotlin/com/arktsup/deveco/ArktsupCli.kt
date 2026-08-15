package com.arktsup.deveco

import com.google.gson.Gson
import com.intellij.openapi.diagnostic.Logger
import java.io.File

/** check --format json 输出的条目结构 */
data class Finding(
    val file: String = "",
    val line: Int = 0,
    val column: Int = 0,
    val severity: String = "",
    val rule: String = "",
    val message: String = "",
    val fix: String = "",
    val snippet: String = "",
)

data class CheckReport(
    val findings: List<Finding> = emptyList(),
    val filesScanned: Int = 0,
    val errors: Int = 0,
    val warnings: Int = 0,
    val infos: Int = 0,
)

object ArktsupCli {
    private val LOG = Logger.getInstance(ArktsupCli::class.java)

    /** 定位 arktsup CLI：配置路径 > 全局 PATH > 工程 node_modules */
    fun resolveCli(projectBasePath: String?, configuredPath: String?): File? {
        if (!configuredPath.isNullOrBlank()) {
            val f = File(configuredPath)
            if (f.exists()) return f
        }
        // 全局安装: which arktsup
        runCatching {
            val proc = ProcessBuilder("sh", "-c", "command -v arktsup").start()
            val out = proc.inputStream.bufferedReader().readText().trim()
            if (out.isNotEmpty() && File(out).exists()) return File(out)
        }
        // 工程内安装
        projectBasePath?.let { base ->
            val local = File(base, "node_modules/arktsup/dist/src/cli.js")
            if (local.exists()) return local
        }
        return null
    }

    /** 运行 arktsup check <dir> --format json */
    fun runCheck(cli: File, target: String): CheckReport {
        val cmd = listOf(
            "node", cli.absolutePath,
            "check", target,
            "--format", "json",
        )
        LOG.info("running: " + cmd.joinToString(" "))
        val proc = ProcessBuilder(cmd).redirectErrorStream(false).start()
        val stdout = proc.inputStream.bufferedReader().readText()
        proc.waitFor()
        return runCatching { Gson().fromJson(stdout, CheckReport::class.java) }
            .getOrDefault(CheckReport())
    }
}
