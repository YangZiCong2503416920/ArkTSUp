package com.arktsup.deveco

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.wm.ToolWindowManager

class ArktsupCheckAction : AnAction() {
    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val basePath = project.basePath ?: return

        val cli = ArktsupCli.resolveCli(basePath, ArktsupSettings.instance.cliPath)
        if (cli == null) {
            Messages.showErrorDialog(
                project,
                "未找到 arktsup CLI。\n请在 Settings -> Tools -> ArkTSUp 配置 cliPath，或执行 npm i -g arktsup。",
                "ArkTSUp",
            )
            return
        }

        object : Task.Backgroundable(project, "ArkTSUp 检查中...") {
            override fun run(indicator: ProgressIndicator) {
                val report = ArktsupCli.runCheck(cli, basePath)
                ApplicationManager.getApplication().invokeLater {
                    ArktsupToolWindow.show(project, report, basePath)
                    Messages.showInfoMessage(
                        project,
                        "检查完成: ${report.errors} 错误，${report.warnings} 警告",
                        "ArkTSUp",
                    )
                }
            }
        }.queue()
    }
}
