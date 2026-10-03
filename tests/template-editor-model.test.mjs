/* Run: node --test tests/template-editor-model.test.mjs
 * Load the real TypeScript model and its tests using the installed compiler.
 * The production import paths and application TS configuration stay intact. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireModule = createRequire(import.meta.url);

function loadModule(relative, dependencies = {}) {
  const filename = path.join(root, relative);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  const compiled = vm.runInThisContext(
    `(function(require,module,exports){${source}\n})`,
    { filename },
  );
  const unit = { exports: {} };
  compiled(
    (name) =>
      Object.hasOwn(dependencies, name)
        ? dependencies[name]
        : requireModule(name),
    unit,
    unit.exports,
  );
  return unit.exports;
}

loadModule("lib/template-editor/model.test.ts", {
  "./model": loadModule("lib/template-editor/model.ts"),
});
