const ts = require("typescript");
const { findDeprecation } = require("/home/yangzicong/projects/ArkTSUp/dist/src/lib/deprecations.js");
const src = [
  'import { fs } from "@ohos.file.fs";',
  'import fs from "@ohos.prompt";',
  'const t = fs.readTextSync("/tmp/x");',
].join("\n");
const sf = ts.createSourceFile("t.ets", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const repls = [];
const handledModules = new Set();
const deprecatedNames = [];
for (const stmt of sf.statements) {
  if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
  const mod = stmt.moduleSpecifier.text;
  const dep = findDeprecation(mod);
  if (!dep) continue;
  handledModules.add(mod);
  repls.push({ start: stmt.moduleSpecifier.getStart(sf), end: stmt.moduleSpecifier.getEnd(), text: "'" + dep.kit + "'" });
  const clause = stmt.importClause;
  if (!clause) continue;
  if (clause.name) {
    const oldName = clause.name.text;
    const newName = dep.names?.[oldName] ?? oldName;
    deprecatedNames.push({ old: oldName, newName });
    repls.push({ start: clause.getStart(sf), end: clause.getEnd(), text: "{ " + newName + " }" });
    continue;
  }
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const spec of bindings.elements) {
      const oldName = spec.name.text;
      const newName = dep.names?.[oldName] ?? oldName;
      if (newName !== oldName) {
        deprecatedNames.push({ old: oldName, newName });
        repls.push({ start: spec.name.getStart(sf), end: spec.name.getEnd(), text: newName });
      }
    }
  }
}
console.log("repls:", JSON.stringify(repls));
console.log("deprecatedNames:", JSON.stringify(deprecatedNames));
console.log("repls.length:", repls.length);
