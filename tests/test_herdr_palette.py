import io
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = runpy.run_path(str(ROOT / 'scripts/herdr-codex'))['main'].__globals__


class PaletteTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
