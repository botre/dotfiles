import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as move from "../.config/herdr-app/mods/agent-list/move.js";
import { normalizeRemote as storeNormalize } from "../.config/herdr-app/mods/projects/store.js";

const SESSION = "e3420013-f979-4e9c-b28c-a216bf058a48";
const CODEX = "01a1f2e2-aa00-79d1-acfe-2e69fa6ea031";

describe("agent-list move to machine: planning", () => {
  it("encodes Claude Code's project folders as seen in ~/.claude/projects", () => {
    // Folder names observed on disk for these working folders.
    assert.equal(move.claudeFolder("/home/me/Development/acme/monorepo/.claude/worktrees/pr1558-operators"),
      "-home-me-Development-acme-monorepo--claude-worktrees-pr1558-operators");
    assert.equal(move.claudeFolder("/home/me/Development/website/.bare"), "-home-me-Development-website--bare");
    assert.equal(move.claudeFolder("/home/me/Development/botre/dotfiles"), "-home-me-Development-botre-dotfiles");
  });

  it("normalizes remotes exactly as the projects mod does", () => {
    for (const url of ["git@github.com:Org/Repo.git", "https://user@GitHub.com/Org/Repo/", "ssh://git@github.com:22/Org/Repo.git", "/srv/repo.git", "file:///x", "C:/repo", "", "https://gitlab.com/a/b/c.git"]) {
      assert.equal(move.normalizeRemote(url), storeNormalize(url), url);
    }
  });

  it("names worktree folders with worktree-org's slug", () => {
    const source = readFileSync(new URL("../.config/herdr-app/mods/worktree-org/main.js", import.meta.url), "utf8");
    const mine = readFileSync(new URL("../.config/herdr-app/mods/agent-list/move.js", import.meta.url), "utf8");
    const body = (text) => /const slug = \(branch\) => \{[\s\S]*?\n\};/.exec(text)?.[0];
    assert.ok(body(source));
    assert.equal(body(mine), body(source));
    assert.equal(move.slug("feature/login fix"), "feature-login-fix");
    assert.match(move.slug("///"), /^branch-[0-9a-f]{8}$/);
  });

  it("maps a project to its repos folder, refusing parts that climb out", () => {
    assert.equal(move.repoPath("github.com/Org/Repo"), "Org/Repo");
    assert.equal(move.repoPath("gitlab.com/group/sub/repo"), "group/sub/repo");
    assert.equal(move.repoPath("evil.com/../x"), null);
    assert.equal(move.repoPath("host"), null);
  });

  it("lists ready machines other than the agent's, this computer first", () => {
    const list = [{ name: "vps", layout: "ready" }, { name: null, layout: "ready" }, { name: "box", layout: "loading" }, { name: "alpha", layout: "ready" }];
    assert.deepEqual(move.machineChoices(list, null).map((m) => m.label), ["alpha", "vps"]);
    assert.deepEqual(move.machineChoices(list, "vps").map((m) => m.label), ["This computer", "alpha"]);
    assert.equal(move.machineOf("vps/t7"), "vps");
    assert.equal(move.machineOf("t7"), null);
  });

  it("refuses a working or blocked agent, one without a session, and the same machine", () => {
    const rec = { agent: "claude", session: SESSION, cwd: "/x" };
    assert.match(move.refusal("working", rec, null, "vps"), /working/);
    assert.match(move.refusal("blocked", rec, null, "vps"), /waiting for you/);
    assert.match(move.refusal("idle", null, null, "vps"), /session/);
    assert.match(move.refusal("idle", rec, "vps", "vps"), /already/);
    assert.equal(move.refusal("done", rec, null, "vps"), null);
    assert.equal(move.sessionOf("not json"), null);
    assert.equal(move.sessionOf(JSON.stringify({ agent: "claude", session: "nope", cwd: "/x" })), null);
    assert.deepEqual(move.sessionOf(JSON.stringify({ agent: "codex", session: CODEX, cwd: "/x" })), { agent: "codex", session: CODEX, cwd: "/x", flags: [] });
  });

  it("commits only a dirty checkout, leaving big files out", () => {
    assert.deepEqual(move.commitPlan(false, [], "vps"), []);
    assert.deepEqual(move.commitPlan(true, ["data/huge.bin"], "vps"), [
      ["add", "-A", "--", ".", ":(exclude,literal)data/huge.bin"],
      ["commit", "-q", "--no-verify", "-m", "WIP: moved to vps"],
    ]);
    assert.equal(move.commitPlan(true, [], null)[1].at(-1), "WIP: moved to This computer");
  });

  it("reuses a checkout of the branch, or adds a worktree from the local or origin's branch", () => {
    const worktrees = move.parseWorktrees("worktree /r\nHEAD 1\nbranch refs/heads/main\n\nworktree /w/feat\nHEAD 2\nbranch refs/heads/feat\n\nworktree /w/gone\nprunable gitdir file points to non-existent location\n");
    assert.deepEqual(worktrees, [{ path: "/r", branch: "main" }, { path: "/w/feat", branch: "feat" }]);
    assert.deepEqual(move.worktreePlan({ worktrees, branch: "feat", path: "/x", localBranch: true }), { kind: "reuse", path: "/w/feat" });
    assert.deepEqual(move.worktreePlan({ worktrees, branch: "new", path: "/w/feat", localBranch: false }), { kind: "taken", path: "/w/feat" });
    assert.deepEqual(move.worktreePlan({ worktrees, branch: "b", path: "/w/b", localBranch: true }).args, ["worktree", "add", "/w/b", "b"]);
    assert.deepEqual(move.worktreePlan({ worktrees, branch: "b", path: "/w/b", localBranch: false }).args, ["worktree", "add", "--track", "-b", "b", "/w/b", "origin/b"]);
  });

  it("finds an existing checkout of the project, else plans a clone", () => {
    const dirs = { vps: { "github.com/o/r": "/srv/r" }, "": { "github.com/o/r": "/home/me/r" } };
    assert.deepEqual(move.checkoutCandidates(dirs, "vps", "github.com/o/r", "/root"), ["/srv/r", "/root/.herdr/repos/o/r"]);
    assert.deepEqual(move.checkoutCandidates(dirs, null, "github.com/o/r", "/home/me"), ["/home/me/r", "/home/me/.herdr/repos/o/r"]);
    assert.deepEqual(move.checkoutPlan([{ path: "/srv/r", remote: "git@github.com:o/r.git" }], "github.com/o/r", "/root"), { kind: "use", path: "/srv/r" });
    assert.deepEqual(move.checkoutPlan([{ path: "/srv/r", remote: "git@github.com:o/other.git" }, { path: "/root/.herdr/repos/o/r", remote: null }], "github.com/o/r", "/root"),
      { kind: "clone", path: "/root/.herdr/repos/o/r" });
  });

  it("rewrites the old checkout's paths in JSON values only", () => {
    const old = "/home/a/repo";
    const lines = [
      JSON.stringify({ type: "user", cwd: "/home/a/repo/sub", message: { content: "I ran ls in /home/a/repo yesterday" } }),
      JSON.stringify({ type: "session_meta", payload: { cwd: old, runtime_workspace_roots: [old], file: "/home/a/repo-other/x" } }),
      JSON.stringify({ tool: { file_path: "/home/a/repo/src/main.rs" }, note: "C:\\path \"/home/a/repo\"" }),
    ].join("\n");
    const out = move.rewritePaths(lines, [[old, "/home/b/.herdr/worktrees/o/repo/feat"], [old, "/ignored"]]).split("\n").map((l) => JSON.parse(l));
    assert.equal(out[0].cwd, "/home/b/.herdr/worktrees/o/repo/feat/sub");
    assert.equal(out[0].message.content, "I ran ls in /home/a/repo yesterday");
    assert.equal(out[1].payload.cwd, "/home/b/.herdr/worktrees/o/repo/feat");
    assert.deepEqual(out[1].payload.runtime_workspace_roots, ["/home/b/.herdr/worktrees/o/repo/feat"]);
    assert.equal(out[1].payload.file, "/home/a/repo-other/x");
    assert.equal(out[2].tool.file_path, "/home/b/.herdr/worktrees/o/repo/feat/src/main.rs");
    assert.equal(out[2].note, "C:\\path \"/home/a/repo\"", "an escaped quote inside prose is not a value start");
  });

  it("rewrites both the real and the linked path of a checkout in one pass", () => {
    const text = JSON.stringify({ a: "/real/repo/x", b: "/link/repo" });
    const out = JSON.parse(move.rewritePaths(text, [["/real/repo", "/new"], ["/link/repo", "/new"]]));
    assert.deepEqual(out, { a: "/new/x", b: "/new" });
    assert.equal(move.rewritePaths(text, [["/new", "/real/repo"]]), text);
  });

  it("chunks text by UTF-8 bytes without splitting characters", () => {
    const text = "ab\u00e9\u{1F600}cd".repeat(50);
    const parts = move.chunks(text, 16);
    assert.equal(parts.join(""), text);
    for (const p of parts) assert.ok(Buffer.byteLength(p) <= 16);
    assert.ok(parts.every((p) => !/^[\uDC00-\uDFFF]/.test(p)));
    assert.deepEqual(move.chunks(""), [""]);
    const calls = move.writeCalls("/h/f.jsonl", "x".repeat(10), 4);
    assert.equal(calls.length, 4);
    assert.match(calls[0][1][1], /> "\$2.part"/);
    assert.match(calls[1][1][1], />> "\$2.part"/);
    assert.deepEqual(calls.at(-1), ["mv", ["-f", "/h/f.jsonl.part", "/h/f.jsonl"]]);
  });

  it("places the conversation for Claude under the new folder and for Codex at the same date path", () => {
    const claude = { agent: "claude", session: SESSION, cwd: "/home/a/repo" };
    assert.equal(move.sessionTarget(claude, "/home/a/.claude/projects/-home-a-repo/x.jsonl", { fromHome: "/home/a", toHome: "/root", cwd: "/root/.herdr/worktrees/o/repo/feat" }),
      `/root/.claude/projects/-root--herdr-worktrees-o-repo-feat/${SESSION}.jsonl`);
    const codex = { agent: "codex", session: CODEX, cwd: "/home/a/repo" };
    const file = `/home/a/.codex/sessions/2026/11/19/rollout-2026-11-19T09-18-23-${CODEX}.jsonl`;
    assert.equal(move.sessionTarget(codex, file, { fromHome: "/home/a", toHome: "/root", cwd: "/x" }), `/root/.codex/sessions/2026/11/19/rollout-2026-11-19T09-18-23-${CODEX}.jsonl`);
    assert.equal(move.pickSession(["/h/.claude/projects/-other/s.jsonl", "/h/.claude/projects/-home-a-repo/s.jsonl"], claude), "/h/.claude/projects/-home-a-repo/s.jsonl");
  });

  it("builds the resume command for Claude and Codex, dropping folder flags", () => {
    const claude = { agent: "claude", session: SESSION, flags: ["--model", "opus", "--add-dir", "/old/a", "/old/b", "--effort", "high"] };
    assert.equal(move.resumeCommand(claude, "/w/it's"), `cd '/w/it'\\''s' && claude --model opus --effort high --resume ${SESSION}`);
    const codex = { agent: "codex", session: CODEX, flags: ["--no-daemon", "-m", "gpt-5"] };
    assert.equal(move.resumeCommand(codex, "/w/x"), `cd '/w/x' && "$HOME/scripts/herdr-codex" resume -m gpt-5 ${CODEX}`);
  });

  it("opens the new tab with the source's project label in a space on the target", () => {
    assert.deepEqual(move.startArgs({ to: "vps", cwd: "/w", space: "sp1", tab: "tb2", project: "github.com/o/r" }), [
      "run", "--bg", "--json", "--keep", "--no-parent", "--on", "vps", "--cwd", "/w",
      "--label", "herdr.space=sp1", "--label", "herdr.tab=tb2", "--label", "project=github.com/o/r",
    ]);
    assert.ok(!move.startArgs({ to: null, cwd: "/w", space: "s", tab: "t", project: "" }).includes("--on"));
    assert.equal(move.startedAddress('{"address":"t9"}', "vps"), "vps/t9");
    assert.equal(move.startedAddress('{"address":"vps/t9"}', "vps"), "vps/t9");
    assert.equal(move.startedAddress('{"address":"t9"}', null), "t9");
  });
});

// Two machines as two home folders on this one, with git and sh for real.
describe("agent-list move to machine: the executor", () => {
  let root;
  const git = (cwd, ...args) => {
    const r = spawnSync("git", args, { cwd, env: env(root), encoding: "utf8" });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };
  // Identity and an https remote that points at a bare repo in the temp folder.
  const env = (home) => ({
    PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
    GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: `url.${root}/remotes/.insteadOf`, GIT_CONFIG_VALUE_0: "https://example.test/",
    GIT_CONFIG_KEY_1: "init.defaultBranch", GIT_CONFIG_VALUE_1: "main",
  });

  before(() => {
    root = mkdtempSync(join(tmpdir(), "herdr-move-"));
    for (const d of ["src", "vps", "remotes/o"]) mkdirSync(join(root, d), { recursive: true });
    git(join(root, "remotes/o"), "init", "-q", "--bare", "r.git");
    const repo = join(root, "src/work/r");
    mkdirSync(join(repo, "sub"), { recursive: true });
    git(join(root, "src/work"), "init", "-q", "r");
    git(repo, "remote", "add", "origin", "https://example.test/o/r.git");
    writeFileSync(join(repo, ".gitignore"), "ignored.txt\n");
    writeFileSync(join(repo, "sub/a.txt"), "one\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "first");
    git(repo, "push", "-q", "-u", "origin", "main");
    git(repo, "checkout", "-q", "-b", "feat/x");
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  // io for moveAgent: "vps" is root/vps, this computer is root/src.
  function fakeIo({ agent = "claude", status = "idle", dirs = {}, spaces = [] } = {}) {
    const homeOf = (on) => join(root, on ? "vps" : "src");
    const calls = { hc: [], run: [], notes: [] };
    const terms = new Map();
    const rec = { agent, session: agent === "claude" ? SESSION : CODEX, cwd: join(root, "src/work/r/sub"), flags: [] };
    terms.set("t1", { address: "t1", labels: { resume: JSON.stringify(rec), project: "example.test/o/r" } });
    const io = {
      exec: async (command, args, { on, cwd } = {}) => {
        const r = spawnSync(command, args, { cwd: cwd ?? homeOf(on), env: env(homeOf(on)), encoding: "utf8" });
        if (r.error) throw r.error;
        return { code: r.status, stdout: r.stdout, stderr: r.stderr };
      },
      hc: async (args) => {
        calls.hc.push(args);
        if (args[0] === "run") return { code: 0, stdout: '{"address":"t5"}', stderr: "" };
        if (args[0] === "send") terms.set(args[1], { address: args[1], foreground: { name: agent, argv: [agent] } });
        return { code: 0, stdout: "", stderr: "" };
      },
      notify: (n) => calls.notes.push(n),
      run: (name, args) => calls.run.push([name, args]),
      sleep: async () => {},
      agents: () => [{ address: "t1", status }],
      terminals: () => [...terms.values()],
      panes: () => [{ pane: "p1", terminal: "t1", tab: "tb1" }],
      spaces: () => spaces,
      dirs,
      hex: () => "0".repeat(32),
      big: 1024,
    };
    return { io, calls, rec };
  }

  it("refuses a working agent without touching git", async () => {
    const { io, calls } = fakeIo({ status: "working" });
    const r = await move.moveAgent(io, "t1", "vps");
    assert.equal(r.ok, false);
    assert.equal(calls.notes[0].level, "warning");
    assert.equal(git(join(root, "src/work/r"), "status", "--porcelain"), "");
  });

  it("commits, pushes, clones, makes the worktree, copies the Claude conversation and resumes it there", async () => {
    const repo = join(root, "src/work/r");
    writeFileSync(join(repo, "sub/a.txt"), "two\n");
    writeFileSync(join(repo, "new.txt"), "untracked\n");
    writeFileSync(join(repo, "ignored.txt"), "secret\n");
    writeFileSync(join(repo, "huge.bin"), "x".repeat(2048));
    const { io, calls, rec } = fakeIo();
    const folder = join(root, "src/.claude/projects", move.claudeFolder(rec.cwd));
    mkdirSync(folder, { recursive: true });
    const lines = [{ type: "user", cwd: rec.cwd, sessionId: SESSION, message: { content: `see ${repo}` } }, { type: "assistant", cwd: rec.cwd, tool: { file_path: `${repo}/sub/a.txt` } }];
    writeFileSync(join(folder, `${SESSION}.jsonl`), lines.map((l) => JSON.stringify(l)).join("\n") + "\n");

    const r = await move.moveAgent(io, "t1", "vps");
    assert.equal(r.ok, true, JSON.stringify(calls.notes));
    assert.deepEqual(r.skipped, ["huge.bin"]);

    // Source: the WIP commit has the tracked change and the untracked file, not the ignored or big ones.
    assert.equal(git(repo, "log", "-1", "--format=%s"), "WIP: moved to vps");
    assert.deepEqual(git(repo, "show", "--name-only", "--format=", "HEAD").split("\n").sort(), ["new.txt", "sub/a.txt"]);
    assert.equal(git(repo, "status", "--porcelain"), "?? huge.bin");
    assert.equal(git(join(root, "remotes/o/r.git"), "log", "-1", "--format=%s", "feat/x"), "WIP: moved to vps");

    // Target: a clone and a worktree on the branch, tracking origin.
    const wt = join(root, "vps/.herdr/worktrees/o/r/feat-x");
    assert.equal(r.worktree, wt);
    assert.ok(existsSync(join(root, "vps/.herdr/repos/o/r/.git")));
    assert.equal(readFileSync(join(wt, "sub/a.txt"), "utf8"), "two\n");
    assert.equal(git(wt, "rev-parse", "--abbrev-ref", "feat/x@{upstream}"), "origin/feat/x");

    // The conversation, under the new folder's name, with paths rewritten.
    const copied = readFileSync(join(root, "vps/.claude/projects", move.claudeFolder(`${wt}/sub`), `${SESSION}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(copied[0].cwd, `${wt}/sub`);
    assert.equal(copied[0].message.content, `see ${repo}`);
    assert.equal(copied[1].tool.file_path, `${wt}/sub/a.txt`);

    // The new tab, the resume command, then the source pane closes.
    const start = calls.hc.find((a) => a[0] === "run");
    assert.ok(start.includes("project=example.test/o/r"));
    assert.deepEqual(start.slice(start.indexOf("--on"), start.indexOf("--on") + 4), ["--on", "vps", "--cwd", `${wt}/sub`]);
    assert.ok(start.includes(`herdr.space=sp${"0".repeat(32)}`), "no space on vps yet: a new one");
    assert.deepEqual(calls.hc.find((a) => a[0] === "send"), ["send", "vps/t5", `cd '${wt}/sub' && claude --resume ${SESSION}`]);
    assert.deepEqual(calls.run, [["pane.close", { pane: "p1" }]]);
    assert.equal(calls.notes.at(-1).level, "success");
    rmSync(join(repo, "huge.bin"));
    rmSync(join(repo, "ignored.txt"));
  });

  it("moves a Codex agent back into an existing clean worktree from the project's folder", async () => {
    const repo = join(root, "src/work/r");
    writeFileSync(join(repo, "sub/a.txt"), "three\n");
    git(repo, "commit", "-q", "-am", "three");
    // The vps worktree from before is clean and behind; the project's folder there is its clone.
    const { io, calls, rec } = fakeIo({ agent: "codex", dirs: { vps: { "example.test/o/r": join(root, "vps/.herdr/repos/o/r") } }, spaces: [{ id: "vps/sp7", machine: "vps" }] });
    const day = join(root, "src/.codex/sessions/2026/11/19");
    mkdirSync(day, { recursive: true });
    const name = `rollout-2026-11-19T09-18-23-${CODEX}.jsonl`;
    writeFileSync(join(day, name), JSON.stringify({ type: "session_meta", payload: { id: CODEX, cwd: rec.cwd, runtime_workspace_roots: [rec.cwd] } }) + "\n");

    const r = await move.moveAgent(io, "t1", "vps");
    assert.equal(r.ok, true, JSON.stringify(calls.notes));
    assert.equal(git(repo, "log", "-1", "--format=%s"), "three", "a clean checkout gets no WIP commit");
    const wt = join(root, "vps/.herdr/worktrees/o/r/feat-x");
    assert.equal(readFileSync(join(wt, "sub/a.txt"), "utf8"), "three\n");
    const meta = JSON.parse(readFileSync(join(root, "vps/.codex/sessions/2026/11/19", name), "utf8"));
    assert.equal(meta.payload.cwd, `${wt}/sub`);
    assert.ok(calls.hc.find((a) => a[0] === "run").includes("herdr.space=sp7"));
    assert.equal(calls.hc.find((a) => a[0] === "send")[2], `cd '${wt}/sub' && "$HOME/scripts/herdr-codex" resume ${CODEX}`);
    assert.ok(!readdirSync(join(root, "vps/.codex/sessions/2026/11/19")).some((f) => f.endsWith(".part")));
  });

  it("refuses a detached HEAD and undoes the WIP commit when the push fails", async () => {
    const repo = join(root, "src/work/r");
    git(repo, "checkout", "-q", "--detach");
    let r = await move.moveAgent(fakeIo().io, "t1", "vps");
    assert.match(r.why, /detached/);
    git(repo, "checkout", "-q", "feat/x");
    git(repo, "remote", "set-url", "origin", "https://example.test/o/missing.git");
    writeFileSync(join(repo, "sub/a.txt"), "four\n");
    const { io, calls } = fakeIo();
    r = await move.moveAgent(io, "t1", "vps");
    assert.equal(r.ok, false);
    assert.equal(r.pushed, false);
    assert.match(r.why, /Couldn't push feat\/x/);
    assert.equal(git(repo, "log", "-1", "--format=%s"), "three");
    assert.equal(git(repo, "status", "--porcelain"), "M sub/a.txt");
    assert.deepEqual(calls.run, [], "the source keeps running");
    git(repo, "remote", "set-url", "origin", "https://example.test/o/r.git");
  });

  it("leaves the source running when the target checkout is dirty", async () => {
    const wt = join(root, "vps/.herdr/worktrees/o/r/feat-x");
    writeFileSync(join(wt, "local.txt"), "mine\n");
    const { io, calls } = fakeIo();
    const r = await move.moveAgent(io, "t1", "vps");
    assert.equal(r.ok, false);
    assert.equal(r.pushed, true);
    assert.match(r.why, /uncommitted changes/);
    assert.match(calls.notes.at(-1).body, /keeps running here/);
    assert.deepEqual(calls.run, []);
  });
});
