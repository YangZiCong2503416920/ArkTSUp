package com.arktsup.deveco

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage
import com.intellij.util.xmlb.XmlSerializerUtil

@State(name = "ArktsupSettings", storages = [Storage("arktsup.xml")])
class ArktsupSettings : PersistentStateComponent<ArktsupSettings> {
    var cliPath: String = ""

    override fun getState(): ArktsupSettings = this
    override fun loadState(state: ArktsupSettings) {
        XmlSerializerUtil.copyBean(state, this)
    }

    companion object {
        @JvmStatic
        val instance: ArktsupSettings
            get() = ApplicationManager.getApplication().getService(ArktsupSettings::class.java)
    }
}
