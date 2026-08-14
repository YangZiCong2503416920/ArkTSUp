// ArkTSUp 库入口：供 Node 程序直接调用
export { jsonToArkTs, Json2TsOptions, Json2TsResult, TypeStyle } from './lib/json2ts';
export {
  scanSource, scanFile, scanDirectory, collectEtsFiles,
  Finding, Severity, ScanReport, CheckOptions,
} from './lib/arkts-check';
