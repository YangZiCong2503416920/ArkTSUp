/**
 * deprecations — 废弃 API / 模块对照表。
 *
 * 数据来源：OpenHarmony 官方 API 参考文档（zh-cn/application-dev/reference/apis-* 目录），
 * 每条映射的 "doc" 字段是官方文档文件路径，可据此复核。
 * 约定：@ohos.* 导入在新版本中仍可编译但已废弃，推荐迁移到 @kit.*。
 */

export interface Deprecation {
  /** 废弃的模块路径（精确匹配 import 的 module specifier） */
  module: string;
  /** 推荐的 kit 模块 */
  kit: string;
  /** 导入名映射：不写则同名；写则旧名 -> 新名（如 fs -> fileIo） */
  names?: Record<string, string>;
  /** 官方文档文件（相对于 reference/ 目录） */
  doc: string;
  /** 补充说明 */
  note?: string;
}

export const DEPRECATIONS: Deprecation[] = [
  // ---------- ArkUI ----------
  { module: '@ohos.promptAction', kit: '@kit.ArkUI', doc: 'apis-arkui/js-apis-promptAction.md' },
  { module: '@ohos.prompt', kit: '@kit.ArkUI', names: { prompt: 'promptAction' }, doc: 'apis-arkui/js-apis-prompt.md', note: 'API 9 起废弃，使用 promptAction.showToast 等' },
  { module: '@ohos.router', kit: '@kit.ArkUI', doc: 'apis-arkui/js-apis-router.md' },
  { module: '@ohos.animator', kit: '@kit.ArkUI', doc: 'apis-arkui/js-apis-animator.md' },
  { module: '@ohos.display', kit: '@kit.ArkUI', doc: 'apis-arkui/js-apis-display.md' },
  { module: '@ohos.mediaquery', kit: '@kit.ArkUI', doc: 'apis-arkui/js-apis-mediaquery.md' },
  { module: '@ohos.matrix4', kit: '@kit.ArkUI', doc: 'apis-arkui/js-apis-matrix4.md' },
  { module: '@ohos.window', kit: '@kit.ArkUI', doc: 'apis-arkui/arkts-apis-window.md' },
  { module: '@ohos.arkui.UIContext', kit: '@kit.ArkUI', doc: 'apis-arkui/arkts-apis-uicontext-uicontext.md' },

  // ---------- Performance Analysis Kit ----------
  { module: '@ohos.hilog', kit: '@kit.PerformanceAnalysisKit', doc: 'apis-performance-analysis-kit/js-apis-hilog.md' },
  { module: '@ohos.hidebug', kit: '@kit.PerformanceAnalysisKit', doc: 'apis-performance-analysis-kit/js-apis-hidebug.md' },
  { module: '@ohos.hiviewdfx.hiappevent', kit: '@kit.PerformanceAnalysisKit', names: { hiAppEvent: 'hiAppEvent' }, doc: 'apis-performance-analysis-kit/js-apis-hiviewdfx-hiappevent.md' },
  { module: '@ohos.bytrace', kit: '@kit.PerformanceAnalysisKit', doc: 'apis-performance-analysis-kit/js-apis-bytrace.md' },

  // ---------- Network Kit ----------
  { module: '@ohos.net.http', kit: '@kit.NetworkKit', doc: 'apis-network-kit/js-apis-http.md' },
  { module: '@ohos.http', kit: '@kit.NetworkKit', doc: 'apis-network-kit/js-apis-http.md' },
  { module: '@ohos.net.connection', kit: '@kit.NetworkKit', doc: 'apis-network-kit/js-apis-net-connection.md' },
  { module: '@ohos.webSocket', kit: '@kit.NetworkKit', doc: 'apis-network-kit/js-apis-webSocket.md' },
  { module: '@ohos.socket', kit: '@kit.NetworkKit', doc: 'apis-network-kit/js-apis-socket.md' },

  // ---------- ArkData ----------
  { module: '@ohos.data.preferences', kit: '@kit.ArkData', doc: 'apis-arkdata/js-apis-data-preferences.md' },
  { module: '@ohos.data.relationalStore', kit: '@kit.ArkData', doc: 'apis-arkdata/js-apis-data-relationalStore.md' },
  { module: '@ohos.distributedKVStore', kit: '@kit.ArkData', doc: 'apis-arkdata/js-apis-distributedKVStore.md' },
  { module: '@ohos.data.dataShare', kit: '@kit.ArkData', doc: 'apis-arkdata/js-apis-data-dataShare.md' },
  { module: '@ohos.data.unifiedDataChannel', kit: '@kit.ArkData', doc: 'apis-arkdata/js-apis-data-unifiedDataChannel.md' },

  // ---------- Ability Kit ----------
  { module: '@ohos.app.ability.UIAbility', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-app-ability-uiAbility.md' },
  { module: '@ohos.app.ability.common', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-app-ability-common.md' },
  { module: '@ohos.app.ability.abilityManager', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-app-ability-abilityManager.md' },
  { module: '@ohos.app.ability.appManager', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-app-ability-appManager.md' },
  { module: '@ohos.app.ability.wantAgent', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-app-ability-wantAgent.md' },
  { module: '@ohos.app.ability.abilityStage', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-app-ability-abilityStage.md' },
  { module: '@ohos.app.ability.wantConstant', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-app-ability-wantConstant.md' },
  { module: '@ohos.app.ability.abilityConstant', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-app-ability-abilityConstant.md' },
  { module: '@ohos.abilityAccessCtrl', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-abilityAccessCtrl.md' },
  { module: '@ohos.bundleManager', kit: '@kit.AbilityKit', doc: 'apis-ability-kit/js-apis-bundleManager.md' },

  // ---------- Core File Kit ----------
  { module: '@ohos.file.fs', kit: '@kit.CoreFileKit', names: { fs: 'fileIo' }, doc: 'apis-core-file-kit/js-apis-file-fs.md', note: '注意导入名 fs -> fileIo' },
  { module: '@ohos.file.picker', kit: '@kit.CoreFileKit', doc: 'apis-core-file-kit/js-apis-file-picker.md' },
  { module: '@ohos.file.fileuri', kit: '@kit.CoreFileKit', doc: 'apis-core-file-kit/js-apis-file-fileuri.md' },
  { module: '@ohos.file.statvfs', kit: '@kit.CoreFileKit', names: { statfs: 'statfs' }, doc: 'apis-core-file-kit/js-apis-file-statvfs.md', note: '模块名 statvfs -> statfs' },

  // ---------- Crypto Architecture Kit ----------
  { module: '@ohos.cryptoFramework', kit: '@kit.CryptoArchitectureKit', doc: 'apis-crypto-architecture-kit/js-apis-cryptoFramework.md' },

  // ---------- Basic Services Kit ----------
  { module: '@ohos.events.emitter', kit: '@kit.BasicServicesKit', doc: 'apis-basic-services-kit/js-apis-emitter.md' },
  { module: '@ohos.commonEventManager', kit: '@kit.BasicServicesKit', doc: 'apis-basic-services-kit/js-apis-commonEventManager.md' },
  { module: '@ohos.deviceInfo', kit: '@kit.BasicServicesKit', doc: 'apis-basic-services-kit/js-apis-device-info.md' },
  { module: '@ohos.request', kit: '@kit.BasicServicesKit', doc: 'apis-basic-services-kit/js-apis-request.md' },
  { module: '@ohos.settings', kit: '@kit.BasicServicesKit', doc: 'apis-basic-services-kit/js-apis-settings.md' },
  { module: '@ohos.systemDateTime', kit: '@kit.BasicServicesKit', doc: 'apis-basic-services-kit/js-apis-date-time.md' },
  { module: '@ohos.pasteboard', kit: '@kit.BasicServicesKit', doc: 'apis-basic-services-kit/js-apis-pasteboard.md' },
  { module: '@ohos.usbManager', kit: '@kit.BasicServicesKit', doc: 'apis-basic-services-kit/js-apis-usbManager.md' },

  // ---------- Background Tasks Kit ----------
  { module: '@ohos.resourceschedule.backgroundTaskManager', kit: '@kit.BackgroundTasksKit', doc: 'apis-backgroundtasks-kit/js-apis-resourceschedule-backgroundTaskManager.md' },
  { module: '@ohos.resourceschedule.workScheduler', kit: '@kit.BackgroundTasksKit', doc: 'apis-backgroundtasks-kit/js-apis-resourceschedule-workScheduler.md' },
  { module: '@ohos.reminderAgentManager', kit: '@kit.BackgroundTasksKit', doc: 'apis-backgroundtasks-kit/js-apis-reminderAgentManager.md' },

  // ---------- Localization Kit ----------
  { module: '@ohos.i18n', kit: '@kit.LocalizationKit', doc: 'apis-localization-kit/js-apis-i18n.md' },
  { module: '@ohos.intl', kit: '@kit.LocalizationKit', doc: 'apis-localization-kit/js-apis-intl.md' },
  { module: '@ohos.resourceManager', kit: '@kit.LocalizationKit', doc: 'apis-localization-kit/js-apis-resource-manager.md' },

  // ---------- ArkTS ----------
  { module: '@ohos.util', kit: '@kit.ArkTS', doc: 'apis-arkts/js-apis-util.md' },
  { module: '@ohos.uri', kit: '@kit.ArkTS', doc: 'apis-arkts/js-apis-uri.md' },
  { module: '@ohos.url', kit: '@kit.ArkTS', doc: 'apis-arkts/js-apis-url.md' },
  { module: '@ohos.taskpool', kit: '@kit.ArkTS', doc: 'apis-arkts/js-apis-taskpool.md' },
  { module: '@ohos.worker', kit: '@kit.ArkTS', doc: 'apis-arkts/js-apis-worker.md' },
  { module: '@ohos.buffer', kit: '@kit.ArkTS', doc: 'apis-arkts/js-apis-buffer.md' },

  // ---------- ArkWeb ----------
  { module: '@ohos.web.webview', kit: '@kit.ArkWeb', doc: 'apis-arkweb/arkts-apis-webview.md' },

  // ---------- Connectivity Kit ----------
  { module: '@ohos.wifiManager', kit: '@kit.ConnectivityKit', doc: 'apis-connectivity-kit/js-apis-wifiManager.md' },
  { module: '@ohos.bluetoothManager', kit: '@kit.ConnectivityKit', doc: 'apis-connectivity-kit/js-apis-bluetoothManager.md' },

  // ---------- Location Kit ----------
  { module: '@ohos.geoLocationManager', kit: '@kit.LocationKit', doc: 'apis-location-kit/js-apis-geoLocationManager.md' },

  // ---------- Telephony Kit ----------
  { module: '@ohos.telephony.sim', kit: '@kit.TelephonyKit', doc: 'apis-telephony-kit/js-apis-sim.md' },
  { module: '@ohos.telephony.sms', kit: '@kit.TelephonyKit', doc: 'apis-telephony-kit/js-apis-sms.md' },
];

const BY_MODULE = new Map<string, Deprecation>();
for (const d of DEPRECATIONS) BY_MODULE.set(d.module, d);

export function findDeprecation(module: string): Deprecation | undefined {
  return BY_MODULE.get(module);
}
