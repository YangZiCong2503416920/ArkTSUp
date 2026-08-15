package com.arktsup.deveco

import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.TextRange
import com.intellij.openapi.vfs.LocalFileSystem
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.openapi.wm.ToolWindowManager
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.table.JBTable
import java.awt.BorderLayout
import java.io.File
import javax.swing.JPanel
import javax.swing.JScrollPane
import javax.swing.table.DefaultTableModel

class ArktsupToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = JPanel(BorderLayout())
        toolWindow.contentManager.addContent(
            ContentFactory.getInstance().createContent(panel, "Check", false)
        )
    }
}

object ArktsupToolWindow {
    fun show(project: Project, report: CheckReport, basePath: String) {
        val toolWindow = ToolWindowManager.getInstance(project)
            .getToolWindow("ArkTSUp") ?: return

        val columns = arrayOf("级别", "文件", "行", "规则", "消息")
        val model = DefaultTableModel(columns, 0)
        val base = File(basePath)

        for (f in report.findings) {
            model.addRow(
                arrayOf(
                    f.severity,
                    File(base, f.file).path.takeLast(60),
                    f.line,
                    f.rule,
                    f.message + (if (f.fix.isNotEmpty()) " | 建议: " + f.fix else ""),
                )
            )
        }

        val table = object : JBTable(model) {}
        table.rowSelectionAllowed = true
        table.columnModel.getColumn(0).preferredWidth = 50
        table.columnModel.getColumn(2).preferredWidth = 50
        table.columnModel.getColumn(4).preferredWidth = 500

        // 双击跳转到对应文件行
        table.addMouseListener(object : java.awt.event.MouseAdapter() {
            override fun mouseClicked(evt: java.awt.event.MouseEvent) {
                if (evt.clickCount == 2) {
                    val row = table.selectedRow
                    if (row < 0) return
                    val finding = report.findings[row]
                    val file = File(basePath, finding.file)
                    if (file.exists()) {
                        val vf = LocalFileSystem.getInstance().findFileByIoFile(file) ?: return
                        val editor = FileEditorManager.getInstance(project).openTextEditor(
                            com.intellij.openapi.fileEditor.OpenFileDescriptor(project, vf, finding.line - 1, finding.column - 1),
                            true,
                        )
                        editor?.selectionModel?.setSelection(
                            TextRange(finding.column - 1, finding.column - 1 + finding.snippet.length)
                        )
                    }
                }
            }
        })

        val content = toolWindow.contentManager.getContent(0)
        val panel = content?.component as? JPanel
        panel?.removeAll()
        panel?.add(JScrollPane(table), BorderLayout.CENTER)
        panel?.revalidate()
        toolWindow.show()
    }
}
