/**
 * Fixes JS/MJS files saved as UTF-16 (breaks Node). Run before dev if login shows "Cannot reach server".
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function isUtf16Le(buf) {
    if (buf.length < 4) return false;
    for (let i = 1; i < Math.min(20, buf.length); i += 2) {
        if (buf[i] !== 0) return false;
    }
    return buf[0] !== 0;
}

function walk(dir, exts, out = []) {
    if (!fs.existsSync(dir)) return out;
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, name.name);
        if (name.isDirectory() && name.name !== "node_modules") walk(full, exts, out);
        else if (name.isFile() && exts.some((e) => name.name.endsWith(e))) out.push(full);
    }
    return out;
}

const targets = [
    ...walk(path.join(ROOT, "src"), [".js", ".mjs"]),
    ...walk(path.join(ROOT, "scripts"), [".js", ".mjs"]),
    ...walk(path.join(ROOT, "test"), [".js", ".mjs"]),
    ...walk(path.resolve(ROOT, "..", "src"), [".js", ".jsx", ".scss"]),
    ...walk(path.resolve(ROOT, "..", "scripts"), [".js", ".mjs", ".cjs"]),
];

let fixed = 0;
for (const file of targets) {
    const buf = fs.readFileSync(file);
    if (!isUtf16Le(buf)) continue;
    const text = buf.toString("utf16le");
    fs.writeFileSync(file, text, "utf8");
    console.log("UTF-8 fixed:", path.relative(ROOT, file));
    fixed += 1;
}
console.log(fixed ? `Done. Fixed ${fixed} file(s).` : "All checked files are UTF-8.");