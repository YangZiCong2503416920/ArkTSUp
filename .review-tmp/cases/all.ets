import { fs } from "@ohos.file.fs";
import prompt from "@ohos.prompt";
import * as ns from "@ohos.hilog";
import { http as myHttp } from "@ohos.net.http";

// string containing fs must not change
const s = "this contains fs and prompt text";
// comment containing fs must not change
const t = fs.readTextSync("/tmp/x");
const u = prompt.showToast({ message: "hi" });
ns.info(0, "tag", "msg");
myHttp.createHttp();
const obj = { fs: 1, prompt: 2 };
const n = obj.fs;
const shorthand = { fs };
const o = { prompt };
