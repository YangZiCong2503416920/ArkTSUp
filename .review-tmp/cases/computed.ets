import { fileIo } from '@kit.CoreFileKit';
const key = fileIo.readTextSync("/tmp/x");
const m = { [key]: 1 };
const o = { ['fs']: 2 };
const p = { fs: 3 };
