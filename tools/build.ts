/** Bundles src/plugin.ts (+ ws and the Stream Deck SDK) into a single ESM file the Stream Deck app can run. */
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { PLUGIN_UUID } from "../src/ui/layout.ts";

const outDir = path.resolve(`${PLUGIN_UUID}.sdPlugin`, "bin");
const watch = process.argv.includes("--dev");

await build({
	entryPoints: ["src/plugin.ts"],
	outfile: path.join(outDir, "plugin.js"),
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node20",
	minify: !watch,
	sourcemap: watch ? "linked" : false,
	legalComments: "none",
	// ws probes for optional native accelerators inside try/catch — they are meant to be absent.
	external: ["bufferutil", "utf-8-validate"],
	// Bundled CommonJS dependencies (ws) call require() on Node built-ins; give the ESM bundle a real one.
	banner: { js: "import { createRequire as __rlhudCreateRequire } from 'node:module'; const require = __rlhudCreateRequire(import.meta.url);" },
});
fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ type: "module" }));
const kb = (fs.statSync(path.join(outDir, "plugin.js")).size / 1024).toFixed(0);
console.log(`built ${path.relative(process.cwd(), path.join(outDir, "plugin.js"))} (${kb} kB)`);
