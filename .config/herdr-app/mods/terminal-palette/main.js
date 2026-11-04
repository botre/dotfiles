import { View, div } from "gpui-kit";
import { theme, terminals, exec } from "herdr";

const WRITE = `import json, os, pathlib, sys, tempfile
root = pathlib.Path(os.environ.get("XDG_CACHE_HOME") or pathlib.Path.home() / ".cache")
root.mkdir(parents=True, exist_ok=True)
fd, temporary = tempfile.mkstemp(prefix=".herdr-palette-", dir=root)
try:
    with os.fdopen(fd, "w") as stream:
        stream.write(sys.argv[1])
    os.replace(temporary, root / "herdr-terminal-palette.json")
finally:
    pathlib.Path(temporary).unlink(missing_ok=True)
`;

export default class TerminalPalette extends View {
  init(_props, cx) {
    this.published = new Map();
    cx.spawn(async () => this.sync());
    cx.timer.every(5000, (cx) => cx.spawn(async () => this.sync()));
  }

  async sync() {
    if (this.busy) return;
    this.busy = true;
    try {
      const colors = theme();
      const palette = JSON.stringify({ foreground: colors.terminal_foreground || colors.foreground, background: colors.background });
      const machines = new Set([null, ...terminals().filter((t) => t.state === "live" && t.address.includes("/"))
        .map((t) => t.address.slice(0, t.address.lastIndexOf("/")))]);
      await Promise.allSettled([...machines].map(async (on) => {
        if (this.published.get(on) === palette) return;
        const result = await exec("python3", ["-c", WRITE, palette], { on });
        if (result.code === 0) this.published.set(on, palette);
      }));
      for (const on of this.published.keys()) if (!machines.has(on)) this.published.delete(on);
    } finally { this.busy = false; }
  }

  render(cx) {
    const palette = `${theme().terminal_foreground || theme().foreground}:${theme().background}`;
    if (this.rendered !== palette) {
      this.rendered = palette;
      cx.spawn(async () => this.sync());
    }
    return div();
  }
}
