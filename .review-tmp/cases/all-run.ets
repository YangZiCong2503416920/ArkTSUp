import { fileIo } from '@kit.CoreFileKit';
import { promptAction } from '@kit.ArkUI';
import * as ns from '@kit.PerformanceAnalysisKit';
import { http as myHttp } from '@kit.NetworkKit';

// string containing fs must not change
const s = "this contains fs and prompt text";
// comment containing fs must not change
const t = fileIo.readTextSync("/tmp/x");
const u = promptAction.showToast({ message: "hi" });
ns.info(0, "tag", "msg");
myHttp.createHttp();
const obj = { fs: 1, prompt: 2 };
const n = obj.fs;
const shorthand = { fileIo };
const o = { promptAction };
