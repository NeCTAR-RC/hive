#!/usr/bin/env node
// Installs Hive's managed git hooks from scripts/hooks/ into the repository's
// real hooks folder. Runs from the `prepare` script on every `pnpm install`
// and is safe to run again.
//
// It installs only pre-push. The pre-commit slot belongs to the pre-commit
// framework (`pre-commit install`, .pre-commit-config.yaml) and commit-msg
// to `git review -s` (Gerrit's Change-Id hook). It never sets
// core.hooksPath, so Git and git-review keep using .git/hooks, and it never
// replaces a hook it did not write.
//
// Skipped outside a git work tree (an installed tarball) and when
// ARDC_HOOKS=0 or CI is set (tox and CI install dependencies too).

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The line every managed hook carries, so ours can be told from others. */
const MANAGED_MARKER = "hive managed hook";
const HOOKS = ["pre-push"];

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(scriptsDir, "hooks");
const frontendDir = resolve(scriptsDir, "..");

function log(message) {
  console.log(`install-git-hooks: ${message}`);
}

/** Runs git in the frontend folder; empty output when git fails. */
function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: frontendDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

if (process.env.ARDC_HOOKS === "0" || process.env.CI) {
  log("ARDC_HOOKS=0 or CI is set; not installing hooks.");
  process.exit(0);
}
if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") {
  log("not inside a git work tree; not installing hooks.");
  process.exit(0);
}

// The real hooks folder, also from a linked work tree, where it is the main
// repository's (hooks are shared by every work tree of a repository). Git
// prints it relative to the folder it ran in.
const hooksDir = resolve(
  frontendDir,
  git(["rev-parse", "--git-path", "hooks"]),
);
mkdirSync(hooksDir, { recursive: true });

for (const name of HOOKS) {
  const source = join(sourceDir, name);
  const target = join(hooksDir, name);
  if (
    existsSync(target) &&
    !readFileSync(target, "utf8").includes(MANAGED_MARKER)
  ) {
    log(`${target} exists and is not Hive's; leaving it alone.`);
    continue;
  }
  copyFileSync(source, target);
  chmodSync(target, 0o755);
  log(`installed ${name}.`);
}
