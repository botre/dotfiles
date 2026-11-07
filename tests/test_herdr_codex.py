import io
import json
import os
from pathlib import Path
import re
import runpy
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = runpy.run_path(str(ROOT / 'scripts/herdr-codex'))['main'].__globals__
# The codex function from .zshrc, without the rest of the shell setup.
SHELL_CODEX = re.search(r'^function codex \{\n.*?^\}\n', (ROOT / '.zshrc').read_text(), re.M | re.S).group(0)


class HerdrCodexTests(unittest.TestCase):
    def test_seeds_only_valid_colors_inside_an_interactive_herdr_terminal(self):
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / 'herdr-terminal-palette.json'
            stream = io.StringIO()
            stream.isatty = lambda: True
            with mock.patch.dict(os.environ, {'HC_TERMINAL_ID': 't1', 'XDG_CACHE_HOME': directory}):
                cache.write_text(json.dumps({'foreground': '#4c4f69', 'background': '#eff1f5'}))
                LAUNCHER['seed_palette'](stream)
                self.assertEqual(stream.getvalue(), '\033]10;#4c4f69\007\033]11;#eff1f5\007')
                for content, tty, terminal in [
                    (cache.read_text(), False, 't1'), (cache.read_text(), True, ''),
                    ('broken', True, 't1'), ('null', True, 't1'),
                    (json.dumps({'foreground': '#000000', 'background': '\033]52;clipboard'}), True, 't1'),
                ]:
                    stream.seek(0)
                    stream.truncate()
                    stream.isatty = lambda: tty
                    os.environ['HC_TERMINAL_ID'] = terminal
                    cache.write_text(content)
                    LAUNCHER['seed_palette'](stream)
                    self.assertEqual(stream.getvalue(), '')

    def test_exec_preserves_arguments_and_adds_isolation_only_in_herdr(self):
        for terminal, args, expected in [
            ('t1', ['resume', 'session'], ['--no-daemon', 'resume', 'session']),
            ('t1', ['--no-daemon', 'a prompt with spaces'], ['--no-daemon', 'a prompt with spaces']),
            ('', ['resume', 'session'], ['resume', 'session']),
        ]:
            with mock.patch.dict(os.environ, {'HC_TERMINAL_ID': terminal}):
                with mock.patch.object(sys, 'argv', ['herdr-codex', *args]):
                    with mock.patch.dict(LAUNCHER, {'seed_palette': mock.Mock()}):
                        with mock.patch.object(LAUNCHER['shutil'], 'which', return_value='/usr/bin/codex'):
                            with mock.patch.object(LAUNCHER['os'], 'execv') as execute:
                                LAUNCHER['main']()
                                execute.assert_called_once_with('/usr/bin/codex', ['/usr/bin/codex', *expected])

    @unittest.skipUnless(shutil.which('zsh'), 'zsh is not installed')
    def test_shell_codex_starts_through_herdr_codex_only_inside_herdr(self):
        with tempfile.TemporaryDirectory() as directory:
            home, bin_dir = Path(directory) / 'home', Path(directory) / 'bin'
            (home / 'scripts').mkdir(parents=True)
            bin_dir.mkdir()
            shutil.copy(ROOT / 'scripts/herdr-codex', home / 'scripts/herdr-codex')
            # A stand-in that prints its arguments, so no real Codex starts.
            fake = bin_dir / 'codex'
            fake.write_text('#!/bin/sh\nprintf "%s\\n" "$@"\nexit 7\n')
            fake.chmod(0o755)
            path = f'{bin_dir}:/usr/bin:/bin'
            self.assertEqual(shutil.which('codex', path=path), str(fake))

            def run(terminal, *args, scripts=home):
                env = {'HOME': str(scripts), 'PATH': path, 'HC_TERMINAL_ID': terminal}
                script = SHELL_CODEX + 'codex "$@"'
                done = subprocess.run(['zsh', '-f', '-c', script, 'zsh', *args], env=env, capture_output=True, text=True, timeout=30)
                self.assertEqual(done.returncode, 7, done.stderr)
                return done.stdout.splitlines()

            self.assertEqual(run('t1', 'resume', 'a b', "it's", ''), ['--no-daemon', 'resume', 'a b', "it's", ''])
            self.assertEqual(run('t1', '--no-daemon', 'exec', 'hi'), ['--no-daemon', 'exec', 'hi'])
            self.assertEqual(run('', 'resume', 'x'), ['resume', 'x'])
            self.assertEqual(run('t1', 'x', scripts=Path(directory) / 'elsewhere'), ['x'], 'without the launcher it runs Codex as is')


if __name__ == '__main__':
    unittest.main()
