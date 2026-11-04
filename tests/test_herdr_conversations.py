import json
import os
from pathlib import Path
import runpy
import stat
import sys
import tempfile
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
PROBE = runpy.run_path(str(ROOT / ".config/herdr-app/mods/agent-list/conversations.py"), run_name="conversations")
PROBE = PROBE["resolve"].__globals__
SESSION = "12345678-1234-1234-1234-123456789abc"


class TranscriptTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.patch = mock.patch.dict(os.environ, {"XDG_CACHE_HOME": str(self.root / "cache")})
        self.patch.start()
        self.addCleanup(self.patch.stop)

    def make_claude(self):
        config = self.root / "claude-profile"
        (config / "sessions").mkdir(parents=True)
        (config / "sessions/42.json").write_text(json.dumps({"sessionId": SESSION}))
        transcript = config / "projects/project" / f"{SESSION}.jsonl"
        transcript.parent.mkdir(parents=True)
        transcript.write_text(json.dumps({"type": "assistant", "timestamp": "2026-11-04T10:00:00Z", "message": {"content": "Test result"}}) + "\n")
        return config, transcript

    def test_resolves_claude_from_the_process_profile(self):
        config, transcript = self.make_claude()
        with mock.patch.dict(PROBE, {"process_env": lambda _: {"CLAUDE_CONFIG_DIR": str(config)}}):
            value = PROBE["resolve"]({"pid": 42, "agent": "claude"})
        self.assertEqual(value["path"], transcript)
        self.assertEqual(value["session"], SESSION)

    def test_resolves_codex_from_an_unambiguous_index_with_a_spinner_title(self):
        config = self.root / "codex"
        transcript = config / "sessions/2026/11/04" / f"rollout-today-{SESSION}.jsonl"
        transcript.parent.mkdir(parents=True)
        transcript.write_text('{}\n')
        (config / "session_index.jsonl").write_text(json.dumps({"id": SESSION, "thread_name": "Fix login"}) + '\n')
        with mock.patch.dict(PROBE, {"process_env": lambda _: {"CODEX_HOME": str(config)}}):
            value = PROBE["resolve"]({"pid": 999999999, "agent": "codex", "title": "✦ Fix login | api"})
        self.assertEqual(value["path"], transcript)

    def test_codex_tool_calls_advance_conversation_freshness(self):
        _, transcript = self.make_claude()
        for kind in ['function_call', 'custom_tool_call', 'custom_tool_call_output', 'reasoning']:
            transcript.write_text(json.dumps({"type": "response_item", "timestamp": "2026-11-04T11:00:00Z",
                                              "payload": {"type": kind}}) + '\n')
            self.assertEqual(PROBE["conversation"](transcript)["conversationAt"], 1793790000000)

    def test_bounded_runner_stops_output_floods_and_timeouts(self):
        for code, error, timeout in [("print('x'*300000)", ValueError, 3), ("import time; time.sleep(5)", TimeoutError, 0.05)]:
            started = time.monotonic()
            with self.assertRaises(error):
                PROBE["bounded_run"]([sys.executable, '-c', code], os.environ.copy(), self.root, timeout=timeout)
            self.assertLess(time.monotonic() - started, 3)

    def test_recap_keeps_original_transcript_and_private_cache_and_deduplicates(self):
        config, transcript = self.make_claude()
        before = transcript.read_bytes()
        resolved = {"agent": "claude", "session": SESSION, "path": transcript, "config": config, "env": {"PATH": os.environ["PATH"]}}
        seen = []
        def command(argv, env, cwd):
            seen.append((env, cwd))
            return json.dumps({"result": json.dumps({"activity": "Verify the login fix"})})
        with mock.patch.dict(PROBE, {"resolve": lambda _: resolved, "bounded_run": command}):
            PROBE["recap"]({"session": SESSION})
            PROBE["recap"]({"session": SESSION})
        self.assertEqual(len(seen), 1)
        self.assertFalse(any(key.startswith(('HC_', 'HERDR_', 'CODEX_THREAD')) for key in seen[0][0]))
        self.assertEqual(seen[0][0]["CLAUDE_CONFIG_DIR"], str(config))
        self.assertEqual(transcript.read_bytes(), before)
        result = PROBE["read_cache"](SESSION)
        self.assertEqual(result["activity"], "Verify the login fix")
        self.assertEqual(stat.S_IMODE(PROBE["cache_path"](SESSION).stat().st_mode), 0o600)
        self.assertFalse(PROBE["cache_path"](SESSION).with_suffix('.lock').exists())

    def test_native_subprocess_contract_for_each_provider_without_network(self):
        config, transcript = self.make_claude()
        binaries = self.root / 'bin'
        binaries.mkdir()
        launcher = '#!' + sys.executable + '\n' + '''import json, pathlib, sys
activity = json.dumps({"activity": "Verify the completed checks"})
if pathlib.Path(sys.argv[0]).name == "codex":
    pathlib.Path(sys.argv[sys.argv.index("--output-last-message") + 1]).write_text(activity)
else:
    print(json.dumps({"result": activity}))
'''
        for provider in ['codex', 'claude']:
            command = binaries / provider
            command.write_text(launcher)
            command.chmod(0o700)
            resolved = {"agent": provider, "session": SESSION, "path": transcript, "config": config,
                        "env": {"PATH": str(binaries)}}
            PROBE["cache_path"](SESSION).unlink(missing_ok=True)
            with mock.patch.dict(PROBE, {"resolve": lambda _: resolved}):
                PROBE["recap"]({"session": SESSION})
            self.assertEqual(PROBE["read_cache"](SESSION)["activity"], 'Verify the completed checks')

    def test_changed_session_is_rejected_before_any_model_call(self):
        with mock.patch.dict(PROBE, {"resolve": lambda _: {"session": "another"}}):
            with self.assertRaisesRegex(ValueError, "Session changed"):
                PROBE["recap"]({"session": SESSION})

    def test_recap_retains_the_before_stamp_when_the_conversation_changes(self):
        config, transcript = self.make_claude()
        original = PROBE["conversation"](transcript)
        resolved = {"agent": "claude", "session": SESSION, "path": transcript, "config": config, "env": {}}
        def command(*args):
            with transcript.open('a') as stream:
                stream.write(json.dumps({"type": "user", "timestamp": "2026-11-04T11:00:00Z"}) + '\n')
            return json.dumps({"result": json.dumps({"activity": "Previous task complete"})})
        with mock.patch.dict(PROBE, {"resolve": lambda _: resolved, "bounded_run": command}):
            PROBE["recap"]({"session": SESSION})
        cached = PROBE["read_cache"](SESSION)
        self.assertEqual(cached["stamp"], original["stamp"])
        self.assertNotEqual(cached["stamp"], PROBE["conversation"](transcript)["stamp"])

    def test_existing_lock_prevents_a_duplicate_request(self):
        config, transcript = self.make_claude()
        resolved = {"agent": "claude", "session": SESSION, "path": transcript, "config": config, "env": {}}
        path = PROBE["cache_path"](SESSION)
        path.parent.mkdir(parents=True)
        path.with_suffix('.lock').touch()
        command = mock.Mock(side_effect=AssertionError("Duplicate recap"))
        with mock.patch.dict(PROBE, {"resolve": lambda _: resolved, "bounded_run": command}):
            PROBE["recap"]({"session": SESSION})
        command.assert_not_called()

    def test_recap_errors_are_cached_and_locks_are_released(self):
        config, transcript = self.make_claude()
        resolved = {"agent": "claude", "session": SESSION, "path": transcript, "config": config, "env": {}}
        with mock.patch.dict(PROBE, {"resolve": lambda _: resolved, "bounded_run": mock.Mock(side_effect=TimeoutError("Recap timed out"))}):
            PROBE["recap"]({"session": SESSION})
        self.assertEqual(PROBE["read_cache"](SESSION)["error"], "Recap timed out")
        self.assertFalse(PROBE["cache_path"](SESSION).with_suffix('.lock').exists())


if __name__ == '__main__':
    unittest.main()
