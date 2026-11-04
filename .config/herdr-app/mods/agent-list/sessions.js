import { terminals, shared, setShared, exec } from "herdr";
import { isAgent, machineOf, observe, parseElapsed } from "./model.js";
import { STORE } from "./ui.js";

// Measure the foreground process so a kept shell's age does not inflate sessions.
export class SessionTracker {
  constructor() { this.starts = new Map(); }

  async sync(cx) {
    if (this.busy) return;
    this.busy = true;
    try {
      const all = terminals().filter(isAgent), now = Date.now();
      const previous = shared(STORE) ?? {};
      const records = { ...previous };
      await Promise.allSettled(all.map(async (terminal) => {
        const pid = terminal.foreground?.pid;
        const key = `${terminal.address}:${terminal.created_ms}:${pid}`;
        let start = this.starts.get(key);
        if (!start || (!start.at && now - start.tried > 60000)) {
          start = { at: null, tried: now };
          const saved = previous[terminal.address];
          if (saved?.pid === pid && saved?.createdAt === terminal.created_ms && saved.startedAt) start.at = saved.startedAt;
          else if (Number.isInteger(pid) && pid > 0) {
            const r = await exec("ps", ["-p", String(pid), "-o", "etime="], { on: machineOf(terminal.address) }).catch(() => null);
            const age = r?.code === 0 ? parseElapsed(r.stdout) : null;
            if (age !== null) start.at = Date.now() - age;
          }
          this.starts.set(key, start);
        }
        records[terminal.address] = observe(terminal, previous[terminal.address], now, start.at);
      }));
      // Retain offline machines' timelines for up to 30 days.
      const live = new Set(all.map((t) => t.address));
      for (const [address, record] of Object.entries(records)) {
        if (!live.has(address) && now - (record.updatedAt ?? record.startedAt ?? 0) > 30 * 86400000) delete records[address];
      }
      if (JSON.stringify(records) !== JSON.stringify(previous)) setShared(STORE, records);
      const keys = new Set(all.map((t) => `${t.address}:${t.created_ms}:${t.foreground?.pid}`));
      for (const key of this.starts.keys()) if (!keys.has(key)) this.starts.delete(key);
    } finally { this.busy = false; cx.notify(); }
  }
}
