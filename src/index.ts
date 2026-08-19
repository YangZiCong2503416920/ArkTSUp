// ArkTSUp 库入口：供 Node 程序直接调用
export { jsonToArkTs, Json2TsOptions, Json2TsResult, TypeStyle } from './lib/json2ts';
export {
  scanSource, scanFile, scanDirectory, collectEtsFiles,
  Finding, Severity, ScanReport, CheckOptions, ScanOptions,
  applyRuleConfig, isBuiltinRuleName,
} from './lib/arkts-check';
export { loadConfig, validateConfig, ArktsUpConfig, RuleSeveritySetting } from './lib/config';
export {
  compileSelector, compileCustomRule, compileCustomRules,
  CustomRuleSpec, CompiledCustomRule,
} from './lib/custom-rules';
