import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadMod, modSource, plain } from "./mod-source.mjs";

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
      "/dev/acme/monorepo": { main: "/dev/acme/monorepo", origin: "https://github.com/acme/monorepo.git" },
      "/dev/globex/monorepo": { main: "/dev/globex/monorepo", origin: "git@github.com:globex/monorepo.git" },
    };
    assert.equal(await nameOf("/dev/acme/monorepo", repos), "acme/monorepo");
    assert.equal(await nameOf("/dev/globex/monorepo", repos), "globex/monorepo");
  });

  it("names a linked worktree after its main checkout's origin", async () => {
    const repos = { "/w/acme/webapp/fix": { main: "/dev/acme/webapp", origin: "https://github.com/acme/webapp" } };
    assert.equal(await nameOf("/w/acme/webapp/fix", repos), "acme/webapp");
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

describe("worktree-org removal", () => {
  const setup = ({ status = { code: 0, stdout: "" }, removal = { code: 0 } } = {}) => {
    const calls = [];
    const evaluate = loadMod("worktree-org", {
      props: () => ({ space: "sp1" }),
      spaces: () => [{ id: "sp1" }],
      run: (...args) => calls.push(args),
      exec: async (_cmd, args) => {
        if (args.includes("status")) return status;
        if (args[0] === "rev-parse") return { code: 0, stdout: "/dev/tool/.git/worktrees/fix" };
        if (args.includes("config")) return { code: 1 };
        if (args[0] === "worktree") { calls.push(args); return removal; }
        throw new Error(`Unexpected git call: ${args.join(" ")}`);
      },
    });
    const view = evaluate("new Worktree()");
    Object.assign(view, { repo: { top: "/w/tool/fix", main: "/dev/tool", linked: true }, dirty: false, unpushed: [] });
    return { view, calls };
  };

  it("keeps the space and checkout when the final status check fails", async () => {
    for (const stderr of ["permission denied", ""]) {
      const { view, calls } = setup({ status: { code: 128, stderr } });
      assert.equal(await view.remove(), stderr || "git status failed.");
      assert.deepEqual(calls, []);
    }
  });

  it("closes the space before it removes a clean checkout without force", async () => {
    const { view, calls } = setup();
    assert.equal(await view.remove(), "");
    assert.deepEqual(plain(calls), [
      ["space.close", { id: "sp1", confirmed: true }],
      ["worktree", "remove", "/w/tool/fix"],
    ]);
  });

  it("requires another confirmation for edits made after the dialog opened", async () => {
    const { view, calls } = setup({ status: { code: 0, stdout: " M notes.txt" } });
    assert.match(await view.remove(), /changed since this opened/);
    assert.deepEqual(calls, []);
    assert.equal(view.dirty, true);
    assert.equal(await view.remove(), "");
    assert.deepEqual(plain(calls.at(-1)), ["worktree", "remove", "--force", "/w/tool/fix"]);
  });

  it("reports a failed worktree removal", async () => {
    const { view } = setup({ removal: { code: 128, stderr: "checkout is locked" } });
    assert.equal(await view.remove(), "checkout is locked");
  });
});
