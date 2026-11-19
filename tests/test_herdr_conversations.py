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


class HerdrConversationsTests(unittest.TestCase):
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
        def command(argv, env, cwd, stdin=None):
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
        def command(*args, **kwargs):
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


def claude_line(kind, content, stamp="2026-11-04T10:00:00Z", **extra):
    role = "assistant" if kind == "assistant" else "user"
    return json.dumps({"type": kind, "timestamp": stamp, "message": {"role": role, "content": content, **extra}})


def codex_line(kind, payload, stamp="2026-11-04T10:00:00Z"):
    return json.dumps({"type": kind, "timestamp": stamp, "payload": payload})


class HerdrLiveActivityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, lines, name="transcript.jsonl"):
        path = self.root / name
        path.write_text("\n".join(lines) + "\n")
        return path

    def live(self, lines):
        return PROBE["conversation"](self.write(lines), live=True)["live"]

    def test_command_phrase_keeps_the_first_command(self):
        self.assertEqual(PROBE["command_phrase"]("tail -8 a.log; tail -4 b.log"), "Running tail -8 a.log")
        self.assertEqual(PROBE["command_phrase"]("cd /x && npm test | tee out.log"), "Running npm test")
        self.assertEqual(PROBE["command_phrase"]('echo "a;b" && ls'), 'Running echo "a;b"')

    def test_claude_tool_phrases(self):
        cases = [
            ("Bash", {"command": "cd /srv/api && node --test --test-isolation=none tests/*.test.mjs\necho done"},
             "Running node --test --test-isolation=none tests/*.test.mjs"),
            ("Edit", {"file_path": "/a/b/overview.js"}, "Editing overview.js"),
            ("Write", {"file_path": "/a/notes.md"}, "Writing notes.md"),
            ("Read", {"file_path": "/a/model.js"}, "Reading model.js"),
            ("Grep", {"pattern": "activityState"}, "Searching for activityState"),
            ("Glob", {"pattern": "**/*.py"}, "Finding **/*.py"),
            ("WebFetch", {"url": "https://example.com/docs?x=1"}, "Fetching example.com"),
            ("Agent", {"description": "Audit the docs"}, "Delegating Audit the docs"),
            ("mcp__chrome-live__navigate_page", {"url": "https://example.com/cart"}, "Opening example.com"),
            ("mcp__linear__get_issue", {}, "Using linear get_issue"),
        ]
        for name, args, expected in cases:
            self.assertEqual(PROBE["tool_phrase"](name, args), expected)
        long = PROBE["tool_phrase"]("Bash", {"command": "x" * 200})
        self.assertLessEqual(len(long), len("Running ") + 70)

    def test_secrets_are_stripped_from_phrases(self):
        phrase = PROBE["tool_phrase"]("Bash", {"command": "API_KEY=abc123 curl --token s3cr3t https://example.com"})
        self.assertEqual(phrase, "Running curl")
        self.assertEqual(PROBE["command_phrase"]("mysql -u root --password=hunter2 db"), "Running mysql -u root")
        self.assertNotIn("hunter2", PROBE["first_sentence"]("Use PASSWORD=hunter2 now. Then go."))

    def test_claude_mid_turn_and_final_message(self):
        prompt = claude_line("user", "Fix the login page")
        tool = claude_line("assistant", [{"type": "text", "text": "Let me **check** the `tests` first. Then fix."},
                                         {"type": "tool_use", "name": "Bash", "input": {"command": "npm test"}}],
                           "2026-11-04T10:00:05Z", stop_reason="tool_use")
        result = claude_line("user", [{"type": "tool_result", "content": "ok"}], "2026-11-04T10:00:09Z")
        live = self.live([prompt, tool, result])
        self.assertEqual(live["action"], "Running npm test")
        self.assertEqual(live["actionAt"], 1793786405000)
        self.assertEqual(live["message"], "Let me check the tests first.")
        self.assertTrue(live["working"])
        final = claude_line("assistant", [{"type": "text", "text": "## Done\n- The login page works now."}],
                            "2026-11-04T10:01:00Z", stop_reason="end_turn")
        live = self.live([prompt, tool, result, final])
        self.assertFalse(live["working"])
        self.assertEqual(live["message"], "Done The login page works now.")
        # A new prompt starts a new turn without the previous turn's action.
        live = self.live([prompt, tool, result, final, claude_line("user", "Now add a test")])
        self.assertTrue(live["working"])
        self.assertIsNone(live["action"])
        # A sentence after the action supersedes it, so the action never goes stale.
        said = claude_line("assistant", [{"type": "text", "text": "Tests pass. Now the page."}],
                           "2026-11-04T10:00:20Z", stop_reason="tool_use")
        live = self.live([prompt, tool, result, said])
        self.assertIsNone(live["action"])
        self.assertEqual(live["message"], "Tests pass.")

    def test_codex_code_mode_and_function_calls(self):
        cell = 'text(await tools.exec_command({cmd:"cd /srv && rg -n \\"activityState\\" model.js",max_output_tokens:500}));'
        lines = [
            codex_line("event_msg", {"type": "task_started"}),
            codex_line("response_item", {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Fix the overview"}]}),
            codex_line("response_item", {"type": "custom_tool_call", "name": "exec", "input": cell}, "2026-11-04T10:00:03Z"),
            codex_line("response_item", {"type": "function_call", "name": "wait", "arguments": "{}"}, "2026-11-04T10:00:04Z"),
        ]
        live = self.live(lines)
        self.assertEqual(live["action"], 'Running rg -n "activityState" model.js')
        self.assertTrue(live["working"])
        patch = 'text(await tools.apply_patch("*** Begin Patch\\n*** Update File: /srv/overview.js\\n@@\\n*** End Patch"));'
        self.assertEqual(PROBE["code_phrase"](patch), "Editing overview.js")
        self.assertEqual(PROBE["code_phrase"]('text(await tools.mcp__chrome_devtools__list_pages({}));'), "Using chrome_devtools list_pages")
        call = codex_line("response_item", {"type": "function_call", "name": "shell", "arguments": json.dumps({"command": ["bash", "-lc", "make test"]})})
        self.assertEqual(self.live([call])["action"], "Running make test")
        done = codex_line("event_msg", {"type": "item_completed", "item": {"type": "CommandExecution", "command": ["/usr/bin/zsh", "-lc", "pytest -q"]},
                                        "started_at_ms": 1793786410000})
        # A finished command reads in the past tense.
        self.assertEqual(self.live(lines + [done])["action"], "Ran pytest -q")
        self.assertEqual(self.live(lines + [done])["actionAt"], 1793786410000)

    def test_codex_final_answer_ends_the_turn_and_skips_injected_context(self):
        lines = [
            codex_line("response_item", {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "# AGENTS.md instructions for /srv"}]}),
            codex_line("response_item", {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "<environment_context>x</environment_context>"}]}),
            codex_line("response_item", {"type": "message", "role": "user", "content": [{"type": "input_text", "text": "Ship the fix\nwith tests"}]}),
            codex_line("response_item", {"type": "message", "role": "assistant", "phase": "final_answer",
                                         "content": [{"type": "output_text", "text": "Shipped: the fix is merged. Tests pass."}]}),
            codex_line("event_msg", {"type": "task_complete"}),
        ]
        observed = PROBE["conversation"](self.write(lines), live=True)
        self.assertFalse(observed["live"]["working"])
        self.assertEqual(observed["live"]["message"], "Shipped: the fix is merged.")
        self.assertEqual(observed["firstPrompt"], "Ship the fix")

    def test_excerpt_holds_the_first_prompt_and_recent_messages_within_its_cap(self):
        lines = [claude_line("user", "Build the overview " + "a" * 2000)]
        for index in range(30):
            lines.append(claude_line("assistant", [{"type": "text", "text": f"Step {index} " + "b" * 1000},
                                                   {"type": "tool_use", "name": "Read", "input": {"file_path": f"/x/f{index}.js"}}]))
            lines.append(claude_line("user", f"Reply {index}"))
        text = PROBE["excerpt"](self.write(lines))
        self.assertLessEqual(len(text), 4000)
        self.assertTrue(text.startswith("First user message:\nBuild the overview"))
        self.assertIn("Reply 29", text)
        self.assertIn("Tool: Reading f29.js", text)
        self.assertNotIn("Step 10 ", text)
        self.assertNotIn("b" * 401, text)

    def test_recap_argv_uses_the_smallest_model_and_stdin_without_resuming(self):
        transcript = self.write([claude_line("user", "Fix the login page"), claude_line("assistant", [{"type": "text", "text": "Fixed."}])])
        output = self.root / "answer.json"
        for agent, model in [("claude", "haiku"), ("codex", PROBE["CODEX_RECAP_MODEL"])]:
            argv = PROBE["recap_command"]({"agent": agent, "session": SESSION, "path": transcript}, output, title=True)
            self.assertIn(model, argv)
            self.assertNotIn(SESSION, argv)
            self.assertFalse({"--resume", "--fork-session", "fork", "resume"} & set(argv))
            self.assertIn('"title"', argv[-1])
        self.assertNotIn('"title"', PROBE["recap_command"]({"agent": "claude", "session": SESSION}, output)[-1])
        seen = {}
        def command(argv, env, cwd, stdin=None):
            seen.update(argv=argv, stdin=stdin)
            return json.dumps({"result": json.dumps({"goal": "Fix login", "activity": "Fixed it", "title": "Login page fix"})})
        resolved = {"agent": "claude", "session": SESSION, "path": transcript, "config": self.root, "env": {}, "renamed": None}
        with mock.patch.dict(os.environ, {"XDG_CACHE_HOME": str(self.root / "cache")}), \
                mock.patch.dict(PROBE, {"resolve": lambda _: resolved, "bounded_run": command}):
            PROBE["recap"]({"session": SESSION, "wantTitle": True})
            cached = PROBE["read_cache"](SESSION)
        self.assertIn("Fix the login page", seen["stdin"])
        self.assertEqual((cached["goal"], cached["title"]), ("Fix login", "Login page fix"))

    def test_recap_skips_the_title_for_a_renamed_session(self):
        transcript = self.write([claude_line("user", "Fix the login page")])
        seen = {}
        def command(argv, env, cwd, stdin=None):
            seen["prompt"] = argv[-1]
            return json.dumps({"result": json.dumps({"goal": "Fix login", "activity": "Fixed it", "title": "Ignored"})})
        resolved = {"agent": "claude", "session": SESSION, "path": transcript, "config": self.root, "env": {}, "renamed": "Mine"}
        with mock.patch.dict(os.environ, {"XDG_CACHE_HOME": str(self.root / "cache")}), \
                mock.patch.dict(PROBE, {"resolve": lambda _: resolved, "bounded_run": command}):
            PROBE["recap"]({"session": SESSION, "wantTitle": True})
            cached = PROBE["read_cache"](SESSION)
        self.assertNotIn('"title"', seen["prompt"])
        self.assertNotIn("title", cached)

    def test_resolve_reports_a_rename_only_from_the_person(self):
        config = self.root / "claude-profile"
        (config / "sessions").mkdir(parents=True)
        transcript = config / "projects/project" / f"{SESSION}.jsonl"
        transcript.parent.mkdir(parents=True)
        transcript.write_text("{}\n")
        for source, expected in [("user", "Sampler regions"), ("derived", None)]:
            (config / "sessions/42.json").write_text(json.dumps({"sessionId": SESSION, "name": "Sampler regions", "nameSource": source}))
            with mock.patch.dict(PROBE, {"process_env": lambda _: {"CLAUDE_CONFIG_DIR": str(config)}}):
                self.assertEqual(PROBE["resolve"]({"pid": 42, "agent": "claude"})["renamed"], expected)


if __name__ == '__main__':
    unittest.main()
