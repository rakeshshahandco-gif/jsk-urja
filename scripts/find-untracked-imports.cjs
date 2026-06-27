const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const tracked = new Set(execSync("git ls-files src", { encoding: "utf8" }).trim().split(/\n/).filter(Boolean));
const aliasRoot = path.join(process.cwd(), "src");
const exts = [".jsx", ".js", "/index.jsx", "/index.js"];
function resolveImport(fromFile, spec) {
  if (!spec.startsWith("@/") && !spec.startsWith(".")) return null;
  const base = spec.startsWith("@/") ? path.join(aliasRoot, spec.slice(2)) : path.resolve(path.dirname(fromFile), spec);
  for (const ext of exts) {
    const p = ext.startsWith("/") ? base + ext : base + ext;
    if (fs.existsSync(p)) return path.relative(process.cwd(), p).replace(/\\/g, "/");
  }
  return null;
}
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(name.name)) out.push(full);
  }
  return out;
}
const missing = new Set();
for (const file of walk(path.join(process.cwd(), "src"))) {
  const text = fs.readFileSync(file, "utf8");
  const re = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    const resolved = resolveImport(file, m[1] || m[2]);
    if (resolved && !tracked.has(resolved)) missing.add(resolved);
  }
}
console.log([...missing].sort().join("\n") || "NONE");