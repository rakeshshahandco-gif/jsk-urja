const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const repoRoot = path.join(__dirname, "..", "..");
const root = path.join(repoRoot, "backend");
const srcRoot = path.join(root, "src");
const tracked = new Set(execSync("git ls-files backend/src", { encoding: "utf8", cwd: repoRoot }).trim().split(/\n/).filter(Boolean).map((p) => p.replace(/^backend\//, "")));
const exts = [".js", "/index.js"];
function resolveImport(fromFile, spec) {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const ext of exts) {
    const p = ext.startsWith("/") ? base + ext : base + ext;
    if (fs.existsSync(p)) return path.relative(srcRoot, p).replace(/\\/g, "/");
  }
  return null;
}
function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, out);
    else if (name.name.endsWith(".js")) out.push(full);
  }
  return out;
}
const missing = new Set();
const indexText = fs.readFileSync(path.join(srcRoot, "routes/v1/index.js"), "utf8");
const routeSpecs = [...indexText.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map((m) => m[1]);
const missingRoutes = [];
for (const spec of routeSpecs) {
  const file = spec.replace("./", "");
  if (!tracked.has(`src/routes/v1/${file}`)) missingRoutes.push(file);
}
for (const file of walk(srcRoot)) {
  const text = fs.readFileSync(file, "utf8");
  const re = /from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(text))) {
    const spec = m[1] || m[2];
    const resolved = resolveImport(file, spec);
    if (!resolved) continue;
    if (!tracked.has(`src/${resolved}`)) missing.add(`src/${resolved}`);
  }
}
console.log("MISSING_V1_ROUTES");
console.log(missingRoutes.sort().join("\n") || "NONE");
console.log("UNTRACKED_IMPORTS");
console.log([...missing].sort().join("\n") || "NONE");
process.exit(missingRoutes.length || missing.size ? 1 : 0);