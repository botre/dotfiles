import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, modSource } from "./mod-source.mjs";

// A git stand-in: `git -C <cwd> <args>` answers from `repos`, keyed by folder.
const fakeExec = (repos) => async (cmd, args, { cwd }) => {
  const repo = repos[cwd];
  if (cmd !== "git" || !repo) return { code: 128, stderr: "not a git repository" };
  const key = args.join(" ");
  if (key === "rev-parse --show-toplevel") return { code: 0, stdout: `${cwd}\n` };
  if (key === "rev-parse --path-format=absolute --git-common-dir") return { code: 0, stdout: `${repo.main}/.git\n` };
  if (key === "remote get-url origin") return repo.origin ? { code: 0, stdout: `${repo.origin}\n` } : { code: 2, stderr: "No such remote" };
  return { code: 1, stderr: `unexpected: ${key}` };
};

describe("worktree-org checkout folders", () => {
  const nameOf = async (folder, repos) => {
    const evaluate = loadMod("worktree-org", { exec: fakeExec(repos) });
    return (await evaluate("repoOf(folder)", { folder }))?.name;
  };

  it("names a checkout folder after the origin's owner and repo", async () => {
    const repos = {
      "/dev/botpoison/monorepo": { main: "/dev/botpoison/monorepo", origin: "https://github.com/botpoison/monorepo.git" },
      "/dev/formspark/monorepo": { main: "/dev/formspark/monorepo", origin: "git@github.com:formspark/monorepo.git" },
    };
    assert.equal(await nameOf("/dev/botpoison/monorepo", repos), "botpoison/monorepo");
    assert.equal(await nameOf("/dev/formspark/monorepo", repos), "formspark/monorepo");
  });

  it("names a linked worktree after its main checkout's origin", async () => {
    const repos = { "/w/botre/calmdots/fix": { main: "/dev/botre/calmdots", origin: "https://github.com/botre/calmdots" } };
    assert.equal(await nameOf("/w/botre/calmdots/fix", repos), "botre/calmdots");
  });

  it("falls back to the parent and folder name without a hosted origin", async () => {
    const repos = {
      "/dev/acme/tool": { main: "/dev/acme/tool" },
      "/dev/acme/local": { main: "/dev/acme/local", origin: "/srv/git/local.git" },
    };
    assert.equal(await nameOf("/dev/acme/tool", repos), "acme/tool");
    assert.equal(await nameOf("/dev/acme/local", repos), "acme/local");
  });

  it("keeps the checkout root under ~/.herdr/worktrees", () => {
    const evaluate = loadMod("worktree-org");
    assert.equal(evaluate("ROOT('/home/test')"), "/home/test/.herdr/worktrees");
  });
});

describe("worktree-org wiring", () => {
  it("opens the worktree-org dialog from both menus", () => {
    for (const mod of ["menu-org", "new-menu-org"]) {
      const source = modSource(`${mod}/main.js`);
      assert.match(source, /mod: "worktree-org"/, mod);
      assert.doesNotMatch(source, /mod: "worktree",/, mod);
    }
  });

  it("opens the -org menus from the layout's own mods", () => {
    assert.match(modSource("spaces-plain/main.js"), /mod: "menu-org"/);
    const tabs = modSource("agent-tabs/main.js");
    assert.match(tabs, /mod: "menu-org"/);
    assert.match(tabs, /mod: "new-menu-org"/);
  });
});
