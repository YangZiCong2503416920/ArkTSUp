import { fs } from "@ohos.file.fs";
import fs from "@ohos.prompt";
const t = fs.readTextSync("/tmp/x");
const u = fs.showToast({ message: "hi" });
