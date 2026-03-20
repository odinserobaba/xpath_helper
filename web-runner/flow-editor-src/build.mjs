#!/usr/bin/env node
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, "..", "static");

mkdirSync(staticDir, { recursive: true });

await esbuild.build({
  entryPoints: [join(__dirname, "main.js")],
  bundle: true,
  format: "esm",
  outfile: join(staticDir, "flow-editor.bundle.js"),
  platform: "browser",
  target: ["es2020"],
  logLevel: "info",
});

copyFileSync(
  join(__dirname, "node_modules", "reactflow", "dist", "style.css"),
  join(staticDir, "reactflow.css"),
);

console.log("OK: static/flow-editor.bundle.js + static/reactflow.css");
