// Bundles src/player.js (+ everything it imports) into one self-contained
// dist/index.html. A tiny ESM → IIFE bundler: each module becomes a function
// in a registry, imports become destructuring from that registry.
//   node tools/build.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = path.join(root, 'src/player.js');

const mods = new Map();          // abs path → { id, code, deps }
function load(file) {
  if (mods.has(file)) return mods.get(file).id;
  const id = path.relative(path.join(root, 'src'), file).replace(/\\/g, '/');
  const rec = { id, code: '', deps: [] };
  mods.set(file, rec);
  let src = fs.readFileSync(file, 'utf8');
  const exports = new Set();
  // imports
  src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"];?/gm, (_, names, rel) => {
    const dep = path.resolve(path.dirname(file), rel);
    const depId = load(dep);
    rec.deps.push(depId);
    const binds = names.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const m = s.match(/^(\w+)\s+as\s+(\w+)$/);
      return m ? `${m[1]}: ${m[2]}` : s;
    });
    return `const { ${binds.join(', ')} } = __req(${JSON.stringify(depId)});`;
  });
  // re-export lists: export { a, b };
  src = src.replace(/^export\s*\{([^}]*)\};?/gm, (_, names) => {
    names.split(',').map(s => s.trim()).filter(Boolean).forEach(n => exports.add(n));
    return '';
  });
  // declarations
  src = src.replace(/^export\s+(async\s+)?function\s+(\w+)/gm, (_, a, n) => { exports.add(n); return `${a || ''}function ${n}`; });
  src = src.replace(/^export\s+class\s+(\w+)/gm, (_, n) => { exports.add(n); return `class ${n}`; });
  src = src.replace(/^export\s+(const|let|var)\s+(\w+)/gm, (_, k, n) => { exports.add(n); return `${k} ${n}`; });
  if (/^\s*(import|export)\s/m.test(src)) throw new Error(`unhandled import/export in ${id}`);
  rec.code = `${src}\nreturn { ${[...exports].join(', ')} };`;
  return id;
}
load(entry);

let bundle = `(() => {
const __defs = {}, __cache = {};
const __req = id => (__cache[id] ||= __defs[id]());
`;
for (const { id, code } of mods.values()) bundle += `__defs[${JSON.stringify(id)}] = function () {\n${code}\n};\n`;
bundle += `__req(${JSON.stringify(load(entry))});\n})();\n`;

const tpl = fs.readFileSync(path.join(root, 'tools/page.html'), 'utf8');
const html = tpl.replace('/*__BUNDLE__*/', () => bundle.replace(/<\/script/gi, '<\\/script'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
// standalone copy with a full document skeleton (double-click to open locally)
const cut = html.indexOf('<main');
const standalone = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${html.slice(0, cut)}</head>
<body>
${html.slice(cut)}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'dist/clawd-goes-to-sea.html'), standalone);
// same page for GitHub Pages (served from /docs)
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), standalone);
console.log(`modules: ${mods.size}, bundle ${(bundle.length / 1024).toFixed(1)} KB, page ${(html.length / 1024).toFixed(1)} KB`);
