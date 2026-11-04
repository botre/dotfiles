import io
from pathlib import Path
import runpy
import sys
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
ROUTE = runpy.run_path(str(ROOT / "scripts/herdr-context"), run_name="herdr_context")["resolve"].__globals__
SESSION = "12345678-1234-1234-1234-123456789abc"


def terminal(address, session=None):
    return {"address": address, "state": "live", "foreground": {"pid": 42, "argv": ["codex"]},
            "labels": {"herdr.session": session, "herdr.session.pid": "42"}}


class HerdrContextTests(unittest.TestCase):
    def resolve(self, records, env=None):
        def core(command, *args):
            if command == "ls":
                return {"terminals": [{"address": key, "state": "live", "agent": "codex"} for key in records]}
            if args[-1] not in records:
                raise RuntimeError("Missing terminal")
            return records[args[-1]]
        return ROUTE["resolve"](env or {"HC_TERMINAL_ID": "wrong", "CODEX_THREAD_ID": SESSION}, get=core)

    def test_shared_daemon_routes_by_thread_instead_of_inherited_terminal(self):
        found = self.resolve({"wrong": terminal("wrong", "other"), "right": terminal("right", SESSION)})
        self.assertEqual(found["address"], "right")

    def test_missing_inherited_terminal_does_not_prevent_thread_resolution(self):
        self.assertEqual(self.resolve({"right": terminal("right", SESSION)})["address"], "right")

    def test_duplicate_or_missing_matches_refuse_to_write(self):
        for records in [{"a": terminal("a", SESSION), "b": terminal("b", SESSION)}, {"a": terminal("a", "other")}]:
            with self.assertRaisesRegex(RuntimeError, "uniquely identify"):
                self.resolve(records)

    def test_native_claude_uses_its_own_terminal_even_with_inherited_codex_variables(self):
        found = self.resolve({"claude": terminal("claude")}, {"HC_TERMINAL_ID": "claude", "CODEX_THREAD_ID": SESSION, "CLAUDECODE": "1"})
        self.assertEqual(found["address"], "claude")

    def test_stale_session_pid_is_not_trusted(self):
        stale = terminal("wrong", SESSION)
        stale["foreground"]["pid"] = 43
        with self.assertRaises(RuntimeError):
            self.resolve({"wrong": stale})

    def test_label_updates_use_verified_address_and_bind_the_process(self):
        calls = []
        with mock.patch.dict(ROUTE, {"resolve": lambda _: terminal("right", SESSION), "core": lambda *args: calls.append(args)}):
            with mock.patch.object(sys, "argv", ["herdr-context", "label", "summary.activity=Test fix", "summary.updated=123"]):
                ROUTE["main"]()
        self.assertEqual(calls[0][1], "right")
        self.assertIn("summary.pid=42", calls[0])

    def test_label_rejects_other_keys_without_writing(self):
        calls = []
        with mock.patch.dict(ROUTE, {"resolve": lambda _: terminal("right", SESSION), "core": lambda *args: calls.append(args)}):
            for argv in [["label", "herdr.context=x"], ["label", "summary.goal"], ["label"], ["publish", "summary.goal=x"]]:
                with mock.patch.object(sys, "argv", ["herdr-context", *argv]), self.assertRaises(RuntimeError):
                    ROUTE["main"]()
        self.assertEqual(calls, [])

    def test_read_prints_the_terminal_context(self):
        found = terminal("right", SESSION)
        found["labels"]["herdr.context"] = "# Herdr plugin context\n\n"
        with mock.patch.dict(ROUTE, {"resolve": lambda _: found}), mock.patch.object(sys, "argv", ["herdr-context"]):
            with mock.patch("sys.stdout", new_callable=io.StringIO) as output:
                ROUTE["main"]()
        self.assertEqual(output.getvalue(), "# Herdr plugin context\n")


if __name__ == "__main__":
    unittest.main()
