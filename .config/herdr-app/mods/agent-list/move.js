// Move to machine: carries an idle agent, its branch and its conversation to
// another connected machine, then resumes it there.
//
// The steps, each on the machine it concerns (through exec's `on`):
// 1. Source: commit every change as "WIP: moved to <machine>" (skipping files
//    over 20 MB), then push the branch. Never forced.
// 2. Target: find a checkout of the same remote (the project's folder there,
//    else ~/.herdr/repos/<owner>/<repo>, cloned when missing), fetch the
//    branch, and check it out in ~/.herdr/worktrees/<owner>/<repo>/<slug>.
// 3. Copy the conversation file, with the old checkout's path rewritten.
// 4. Start the agent in a new tab there with the same project label, then
//    close the source pane. A failure before this leaves the source running.
//
// Everything here is pure except moveAgent(), which takes its effects as `io`
// so tests can play every machine. No imports: main.js hands in the herdr API.

export const BIG = 20 * 1024 * 1024;
// Linux caps one argument at 128 KiB, and the writer passes text as one.
export const CHUNK_BYTES = 120 * 1024;
// A conversation passes through the app's memory once.
export const MAX_SESSION = 64 * 1024 * 1024;
export const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALUE = /^[A-Za-z0-9._:\[\]-]+$/;
const BUSY = new Set(["working", "blocked"]);

// Copied from projects/store.js (a mod can't import another mod's files);
// tests/herdr-agent-list-move.test.mjs checks they still agree.
export function normalizeRemote(url) {
  const s = String(url ?? "").trim();
  if (!s) return null;
  let host, path, m;
  if ((m = /^([a-z][a-z0-9+.-]*):\/\/(?:[^@/]*@)?([^/:?#]+)(?::\d*)?\/+([^?#]*)/i.exec(s))) {
    if (m[1].toLowerCase() === "file") return null;
    [, , host, path] = m;
  } else if ((m = /^(?:[^@/:]+@)?([^/:]+):(?!\/)(.+)$/.exec(s))) {
    [, host, path] = m;
    if (host.length < 2) return null;
  } else return null;
  path = path.replace(/\/+$/, "").replace(/\.git$/i, "").replace(/\/+$/, "").replace(/^\/+/, "");
  if (!path || !host) return null;
  return `${host.toLowerCase()}/${path}`;
}

// Copied from worktree-org/main.js, so both name a branch's folder alike.
export const slug = (branch) => {
  const normalized = branch.normalize("NFC");
  const name = normalized.replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
  if (name) return name;
  // Hash the original name so symbol-only branches do not share a folder.
  let hash = 2166136261;
  for (const char of normalized) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return `branch-${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

// "github.com/Org/Repo" gives "Org/Repo"; a nested group keeps its parts.
// Null when a part could climb out of the folder ("..").
export function repoPath(id) {
  const parts = String(id ?? "").split("/").slice(1);
  if (parts.length < 1 || parts.some((p) => !p || p === "." || p === ".." || p.includes("\\"))) return null;
  return parts.join("/");
}

// Claude Code keeps a conversation in ~/.claude/projects/<folder>/<id>.jsonl,
// where <folder> is the cwd with every character but A-Z, a-z and 0-9 as "-"
// ("/home/b/x/.claude/wt" is "-home-b-x--claude-wt", as seen on disk).
export const claudeFolder = (cwd) => String(cwd).replace(/[^A-Za-z0-9]/g, "-");

export const machineOf = (address) => (String(address).includes("/") ? String(address).split("/")[0] : null);
export const localId = (id) => String(id).split("/").pop();
export const machineName = (name) => name ?? "This computer";

// Ready machines to move to, this computer first, without the agent's own.
export function machineChoices(list, current) {
  return (list ?? [])
    .filter((m) => m.layout === "ready" && (m.name ?? null) !== (current ?? null))
    .sort((a, b) => (a.name === null ? -1 : b.name === null ? 1 : a.name.localeCompare(b.name)))
    .map((m) => ({ name: m.name ?? null, label: machineName(m.name ?? null) }));
}

// The resume mod's label: { agent, session, cwd, flags }, or null.
export function sessionOf(label) {
  let rec;
  try { rec = JSON.parse(label ?? ""); } catch { return null; }
  if (!rec || (rec.agent !== "claude" && rec.agent !== "codex") || !ID.test(rec.session ?? "")) return null;
  if (typeof rec.cwd !== "string" || !rec.cwd.startsWith("/")) return null;
  return { agent: rec.agent, session: rec.session, cwd: rec.cwd, flags: Array.isArray(rec.flags) ? rec.flags : [] };
}

// Why an agent can't move now, or null. A working agent is refused rather
// than queued: its turn may need the person, and a queued move would act
// on a state they no longer see.
export function refusal(status, rec, from, to) {
  if ((from ?? null) === (to ?? null)) return "It already runs there.";
  if (BUSY.has(status)) return status === "blocked" ? "It is waiting for you. Answer it first, then move it." : "It is working. Move it once its turn ends.";
  if (!rec) return "Its session isn't known yet. Try again in half a minute.";
  return null;
}

// Paths of NUL-separated output, as git -z and find -print0 give them.
export const nulList = (out) => String(out ?? "").split("\0").filter(Boolean);

// Prints, NUL-separated, the changed or untracked (not ignored) files over
// $0 bytes, relative to the repository's top. Symbolic links don't count.
export const BIG_FILES_SCRIPT = 'git ls-files -z -m -o --exclude-standard | xargs -0 sh -c \'for f; do [ -f "$f" ] && [ ! -L "$f" ] && [ $(( $(wc -c < "$f") )) -gt "$0" ] && printf "%s\\0" "$f"; done; exit 0\' "$1"';

// The git commands that make the WIP commit: everything but the big files.
export function commitPlan(dirty, big, machine) {
  if (!dirty) return [];
  return [
    ["add", "-A", "--", ".", ...big.map((p) => `:(exclude,literal)${p}`)],
    ["commit", "-q", "--no-verify", "-m", `WIP: moved to ${machineName(machine)}`],
  ];
}

// `git worktree list --porcelain` as [{ path, branch }], prunable ones left out.
export function parseWorktrees(out) {
  const list = [];
  for (const block of String(out ?? "").split(/\n\n+/)) {
    const lines = block.split("\n");
    const path = lines.find((l) => l.startsWith("worktree "))?.slice(9);
    if (!path || lines.some((l) => l === "bare" || l.startsWith("prunable"))) continue;
    const branch = lines.find((l) => l.startsWith("branch "))?.slice(7).replace(/^refs\/heads\//, "") ?? null;
    list.push({ path, branch });
  }
  return list;
}

// Where the target gets the branch: a checkout that already has it, or a new
// worktree, from the local branch when one exists, else tracking origin's.
export function worktreePlan({ worktrees, branch, path, localBranch }) {
  const have = worktrees.find((w) => w.branch === branch);
  if (have) return { kind: "reuse", path: have.path };
  if (worktrees.some((w) => w.path === path)) return { kind: "taken", path };
  return {
    kind: "add",
    path,
    args: localBranch ? ["worktree", "add", path, branch] : ["worktree", "add", "--track", "-b", branch, path, `origin/${branch}`],
  };
}

// Folders that may hold a checkout of `id` on a machine, best first.
export function checkoutCandidates(dirs, machine, id, home) {
  const rel = repoPath(id);
  const out = [dirs?.[machine ?? ""]?.[id], rel && `${home}/.herdr/repos/${rel}`];
  return [...new Set(out.filter((d) => typeof d === "string" && d.startsWith("/")))];
}

// The first candidate whose origin is the same project, else where to clone.
export function checkoutPlan(probes, id, home) {
  const hit = probes.find((p) => p.remote && normalizeRemote(p.remote) === id);
  if (hit) return { kind: "use", path: hit.path };
  const rel = repoPath(id);
  return rel ? { kind: "clone", path: `${home}/.herdr/repos/${rel}` } : { kind: "none" };
}

// The agent's folder in the new checkout: the same place below its top.
export function newCwd(top, prefix) {
  const sub = String(prefix ?? "").replace(/\/+$/, "");
  return sub ? `${top}/${sub}` : top;
}

// The old checkout's paths inside a conversation, rewritten to the new one.
// Only whole JSON string values that are a path or start with one followed by
// "/" change, so prose that mentions the path stays as written.
export function rewritePaths(text, pairs) {
  const map = new Map();
  for (const [from, to] of pairs) if (from && from !== to && !map.has(from)) map.set(JSON.stringify(from).slice(1, -1), JSON.stringify(to).slice(1, -1));
  if (!map.size) return text;
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`"(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?=["/])`, "g");
  return text.replace(re, (_, k) => `"${map.get(k)}`);
}

const utf8 = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

// Text in pieces of at most `budget` UTF-8 bytes, never splitting a character.
export function chunks(text, budget = CHUNK_BYTES) {
  const out = [];
  let start = 0, bytes = 0, i = 0;
  for (const ch of text) {
    const b = utf8(ch.codePointAt(0));
    if (bytes + b > budget && i > start) { out.push(text.slice(start, i)); start = i; bytes = 0; }
    bytes += b;
    i += ch.length;
  }
  if (i > start || !out.length) out.push(text.slice(start));
  return out;
}

// The sh calls that write `text` to `path` on a machine: into path.part
// piece by piece, then renamed, so a cut-off copy never looks complete.
export function writeCalls(path, text, budget = CHUNK_BYTES) {
  return chunks(text, budget).map((piece, i) => [
    "sh",
    ["-c", i === 0 ? 'mkdir -p "$(dirname "$2")" && printf %s "$1" > "$2.part"' : 'printf %s "$1" >> "$2.part"', "_", piece, path],
  ]).concat([["mv", ["-f", `${path}.part`, path]]]);
}

// Where the conversation goes on the target.
export function sessionTarget(rec, sourcePath, { fromHome, toHome, cwd }) {
  if (rec.agent === "claude") return `${toHome}/.claude/projects/${claudeFolder(cwd)}/${rec.session}.jsonl`;
  const root = `${fromHome}/.codex/sessions/`;
  const rel = sourcePath.startsWith(root) ? sourcePath.slice(root.length) : sourcePath.split("/").pop();
  return `${toHome}/.codex/sessions/${rel}`;
}

// Of the conversation files found, the one under the agent's own folder.
export function pickSession(paths, rec) {
  if (rec.agent === "claude") return paths.find((p) => p.split("/").at(-2) === claudeFolder(rec.cwd)) ?? paths[0] ?? null;
  return paths[0] ?? null;
}

const quote = (word) => (VALUE.test(word) ? word : `'${String(word).replace(/'/g, `'\\''`)}'`);

// Flags the resume mod kept, minus folders (they name the old machine's
// paths) and anything not plain.
export function resumeFlags(flags) {
  const out = [];
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    if (f === "--add-dir") { while (i + 1 < flags.length && !flags[i + 1].startsWith("-")) i++; continue; }
    if (f === "--no-daemon" || !VALUE.test(f)) continue;
    out.push(f);
  }
  return out;
}

// What to type into the new shell, as the resume mod would.
export function resumeCommand(rec, cwd) {
  const flags = resumeFlags(rec.flags ?? []);
  const words = rec.agent === "claude"
    ? ["claude", ...flags, "--resume", rec.session].map(quote).join(" ")
    : ['"$HOME/scripts/herdr-codex"', "resume", ...flags.map(quote), rec.session].join(" ");
  return `cd ${quote(cwd)} && ${words}`;
}

// hc run arguments for the new tab's shell, labelled into a space on the
// target (a fresh id makes Herdr open a new space) and the source's project.
export function startArgs({ to, cwd, space, tab, project }) {
  return [
    "run", "--bg", "--json", "--keep", "--no-parent",
    ...(to ? ["--on", to] : []),
    "--cwd", cwd,
    "--label", `herdr.space=${space}`,
    "--label", `herdr.tab=${tab}`,
    ...(project ? ["--label", `project=${project}`] : []),
  ];
}

// The address hc run printed, with the machine in front for another one.
export function startedAddress(out, to) {
  let address = null;
  try { address = JSON.parse(out)?.address ?? null; } catch {}
  address ??= /\b((?:[\w.-]+\/)?t[0-9a-z]+)\b/.exec(String(out ?? ""))?.[1] ?? null;
  if (address && to && !address.includes("/")) address = `${to}/${address}`;
  return address;
}

const randomHex = () => Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");

class Stop extends Error {}

// Runs the move. io: { exec, hc, notify, run, sleep, agents, terminals,
// panes, spaces, dirs, hex?, big? }. Resolves with { ok, why?, ... }; every
// outcome is also a toast.
export async function moveAgent(io, address, to) {
  const toName = machineName(to);
  const title = `Move to ${toName}`;
  const from = machineOf(address);
  const term = io.terminals().find((t) => t.address === address);
  const status = io.agents().find((a) => a.address === address)?.status ?? "idle";
  const rec = sessionOf(term?.labels?.resume);
  const project = term?.labels?.project ?? "";
  const say = (body, level = "info") => io.notify({ title, body, level, timeout: level === "error" ? undefined : 4000 });
  const stop = (why) => { throw new Stop(why); };
  const run = async (on, cwd, command, args, timeout = 120_000) => {
    const r = await io.exec(command, args, { on, cwd, timeout }).catch((e) => ({ code: -1, stdout: "", stderr: String(e) }));
    return { ok: r.code === 0, code: r.code, out: r.stdout ?? "", err: (r.stderr ?? "").trim() };
  };
  const git = (on, cwd, args, timeout) => run(on, cwd, "git", args, timeout);
  const homeOf = async (on) => {
    const r = await run(on, undefined, "sh", ["-c", 'printf %s "$HOME"']);
    if (!r.ok || !r.out.startsWith("/")) stop(`Couldn't reach ${machineName(on)}. ${r.err}`.trim());
    return r.out;
  };

  const why = refusal(status, rec, from, to);
  if (why) { say(why, "warning"); return { ok: false, why }; }

  let pushed = false;
  const report = {};
  try {
    // 1. Source: its branch, committed and pushed.
    const top = await git(from, rec.cwd, ["rev-parse", "--show-toplevel"]);
    if (!top.ok) stop("Its folder isn't in a git repository.");
    const oldTop = top.out.trim();
    const prefix = (await git(from, rec.cwd, ["rev-parse", "--show-prefix"])).out.trim();
    const head = await git(from, oldTop, ["symbolic-ref", "--short", "-q", "HEAD"]);
    if (!head.ok || !head.out.trim()) stop("Its checkout has no branch (detached HEAD).");
    const branch = head.out.trim();
    const url = (await git(from, oldTop, ["config", "--get", "remote.origin.url"])).out.trim();
    const id = normalizeRemote(url);
    if (!id) stop("Its repository has no shareable origin remote.");
    const changes = await git(from, oldTop, ["status", "--porcelain"]);
    if (!changes.ok) stop(changes.err || "git status failed.");
    const big = changes.out ? nulList((await run(from, oldTop, "sh", ["-c", BIG_FILES_SCRIPT, "_", String(io.big ?? BIG)])).out) : [];
    report.skipped = big;
    let committed = false;
    for (const args of commitPlan(changes.out !== "", big, to)) {
      if (args[0] === "commit" && (await git(from, oldTop, ["diff", "--cached", "--quiet"])).ok) break;
      const r = await git(from, oldTop, args, 600_000);
      if (!r.ok) stop(`Couldn't commit its changes. ${r.err}`.trim());
      committed ||= args[0] === "commit";
    }
    say(`Pushing ${branch}${big.length ? `. Left behind, over 20 MB: ${big.join(", ")}` : ""}`, big.length ? "warning" : "info");
    const push = await git(from, oldTop, ["push", "-u", "origin", branch], 600_000);
    if (!push.ok) {
      // The changes go back to uncommitted, as they were.
      if (committed) await git(from, oldTop, ["reset", "-q", "HEAD~1"]);
      stop(`Couldn't push ${branch}. ${push.err.split("\n").pop()}`.trim());
    }
    pushed = true;

    // 2. Target: a checkout of the branch.
    const [fromHome, toHome] = [await homeOf(from), await homeOf(to)];
    const probes = [];
    for (const path of checkoutCandidates(io.dirs, to, id, toHome)) {
      probes.push({ path, remote: (await git(to, path, ["config", "--get", "remote.origin.url"])).out.trim() || null });
    }
    const where = checkoutPlan(probes, id, toHome);
    if (where.kind === "none") stop(`No folder fits ${id}.`);
    if (where.kind === "clone") {
      const there = await run(to, undefined, "test", ["-e", where.path]);
      if (there.ok) stop(`${where.path} exists but isn't a clone of ${id}.`);
      say(`Cloning ${id}`);
      await run(to, undefined, "mkdir", ["-p", where.path.slice(0, where.path.lastIndexOf("/"))]);
      const c = await git(to, undefined, ["clone", "-q", "--", url, where.path], 1_800_000);
      if (!c.ok) stop(`Couldn't clone ${id}. ${c.err.split("\n").pop()}`.trim());
    }
    const repo = where.path;
    const fetch = await git(to, repo, ["fetch", "-q", "origin", `+refs/heads/${branch}:refs/remotes/origin/${branch}`], 600_000);
    if (!fetch.ok) stop(`Couldn't fetch ${branch}. ${fetch.err}`.trim());
    const rel = repoPath(id);
    const plan = worktreePlan({
      worktrees: parseWorktrees((await git(to, repo, ["worktree", "list", "--porcelain"])).out),
      branch,
      path: `${toHome}/.herdr/worktrees/${rel}/${slug(branch)}`,
      localBranch: (await git(to, repo, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`])).ok,
    });
    if (plan.kind === "taken") stop(`${plan.path} holds another branch.`);
    if (plan.kind === "reuse") {
      const s = await git(to, plan.path, ["status", "--porcelain"]);
      if (!s.ok || s.out) stop(`${plan.path} has uncommitted changes.`);
    } else {
      if ((await run(to, undefined, "test", ["-e", plan.path])).ok) stop(`${plan.path} is in the way.`);
      await run(to, undefined, "mkdir", ["-p", plan.path.slice(0, plan.path.lastIndexOf("/"))]);
      const a = await git(to, repo, plan.args, 600_000);
      if (!a.ok) stop(`Couldn't make the worktree. ${a.err}`.trim());
    }
    const ff = await git(to, plan.path, ["merge", "-q", "--ff-only", `origin/${branch}`]);
    if (!ff.ok) stop(`${branch} there has commits that origin lacks.`);
    const cwd = newCwd(plan.path, prefix);
    report.worktree = plan.path;

    // 3. The conversation.
    const finder = rec.agent === "claude"
      ? ['find "$HOME/.claude/projects" -maxdepth 2 -name "$1.jsonl" -print0', rec.session]
      : ['find "$HOME/.codex/sessions" -name "rollout-*-$1.jsonl" -print0', rec.session];
    const found = pickSession(nulList((await run(from, undefined, "sh", ["-c", finder[0], "_", finder[1]])).out), rec);
    if (!found) stop("Couldn't find its conversation file.");
    const size = Number((await run(from, undefined, "sh", ["-c", 'wc -c < "$1"', "_", found])).out.trim());
    if (!(size > 0) || size > MAX_SESSION) stop(`Its conversation is ${size > 0 ? "over 64 MB" : "empty"}.`);
    const read = await run(from, undefined, "cat", [found]);
    if (!read.ok) stop(`Couldn't read its conversation. ${read.err}`.trim());
    // The agent may know its checkout by another path (a symbolic link).
    const sub = prefix.replace(/\/+$/, "");
    const cwdTop = sub && rec.cwd.endsWith(`/${sub}`) ? rec.cwd.slice(0, -sub.length - 1) : rec.cwd;
    const text = rewritePaths(read.out, [[oldTop, plan.path], [cwdTop, plan.path]]);
    const dest = sessionTarget(rec, found, { fromHome, toHome, cwd });
    for (const [command, args] of writeCalls(dest, text)) {
      const w = await run(to, undefined, command, args);
      if (!w.ok) stop(`Couldn't write its conversation. ${w.err}`.trim());
    }

    // 4. The agent there, then the source goes.
    const space = io.spaces().find((s) => (s.machine ?? null) === (to ?? null));
    const hex = io.hex ?? randomHex;
    const started = await io.hc(startArgs({ to, cwd, space: space ? localId(space.id) : `sp${hex()}`, tab: `tb${hex()}`, project }))
      .catch((e) => ({ code: 1, stderr: String(e) }));
    const fresh = started.code === 0 ? startedAddress(started.stdout, to) : null;
    if (!fresh) stop(`Couldn't open a tab there. ${(started.stderr ?? "").trim()}`.trim());
    const sent = await io.hc(["send", fresh, resumeCommand(rec, cwd)]).catch((e) => ({ code: 1, stderr: String(e) }));
    if (sent.code !== 0) stop(`Couldn't start the agent there. ${(sent.stderr ?? "").trim()}`.trim());
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      const t = io.terminals().find((x) => x.address === fresh);
      up = [t?.foreground?.name, String(t?.foreground?.argv?.[0] ?? "").split("/").pop()].some((n) => n === rec.agent);
      if (!up) await io.sleep(500);
    }
    if (!up) stop(`The agent didn't start in ${fresh}.`);
    report.address = fresh;
    // Typed into while it moved: keep both, so nothing is lost.
    if (BUSY.has(io.agents().find((a) => a.address === address)?.status)) stop(`It started working again. Both copies run; close one (${fresh} is the new one).`);
    const pane = io.panes().find((p) => p.terminal === address);
    if (pane) io.run("pane.close", { pane: pane.pane });
    say(`${branch} in ${cwd}${big.length ? `. Left behind: ${big.join(", ")}` : ""}`, "success");
    return { ok: true, branch, cwd, ...report };
  } catch (e) {
    const why = e instanceof Stop ? e.message : String(e);
    io.notify({ title: `Couldn't move it to ${toName}`, body: pushed ? `${why} The agent keeps running here.` : why, level: "error" });
    return { ok: false, why, pushed, ...report };
  }
}
