#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const tempDir = process.env.BANSS_VERCEL_TMP_DIR ?? "/private/tmp/banss-salesops-vercel";
const supabaseRef = process.env.SUPABASE_PROJECT_REF ?? "xahdgabzmjaxmmkcubkf";
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? `https://${supabaseRef}.supabase.co`;
const vercelProject = process.env.VERCEL_PROJECT ?? "banss-salesops-vercel";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    stdio: options.stdio ?? "inherit",
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return result;
}

function output(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
  });
}

function getAnonKey() {
  if (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  }

  const envOutput = output("supabase", [
    "projects",
    "api-keys",
    "--project-ref",
    supabaseRef,
    "-o",
    "env",
  ]);
  const match = envOutput.match(/^SUPABASE_ANON_KEY="(.+)"$/m);
  if (!match) {
    console.error("Could not read SUPABASE_ANON_KEY from Supabase CLI.");
    process.exit(1);
  }
  return match[1];
}

const anonKey = getAnonKey();

run("mkdir", ["-p", tempDir]);
for (const entry of readdirSync(tempDir)) {
  if (entry.startsWith(".env")) {
    rmSync(resolve(tempDir, entry), { force: true });
  }
}
run("rsync", [
  "-a",
  "--delete",
  "--exclude",
  "node_modules",
  "--exclude",
  ".next",
  "--exclude",
  ".vercel",
  "--exclude",
  ".git",
  "--exclude",
  ".env*",
  `${repoRoot}/`,
  `${tempDir}/`,
]);

if (!existsSync(resolve(tempDir, ".vercel/project.json"))) {
  run("npx", ["vercel", "link", "--yes", "--project", vercelProject], {
    cwd: tempDir,
  });
}

run(
  "npx",
  [
    "vercel",
    "deploy",
    "--prod",
    "--yes",
    "--force",
    "--archive=tgz",
    "-b",
    `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`,
    "-b",
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
    "-e",
    `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`,
    "-e",
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anonKey}`,
  ],
  { cwd: tempDir },
);
