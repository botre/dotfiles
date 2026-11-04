import { readFileSync } from "node:fs";
import vm from "node:vm";

// Herdr loads mods as ES modules; the tests run them as plain scripts in a vm context.
export function modSource(path) {
  return readFileSync(new URL(`../.config/herdr-app/mods/${path}`, import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/^export (?:default )?/gm, "");
}

export function loadMods(paths, globals = {}) {
  const context = vm.createContext({ View: class {}, ...globals });
  for (const path of paths) vm.runInContext(modSource(path), context);
  return (expression, values = {}) => vm.runInContext(expression, Object.assign(context, values));
}
