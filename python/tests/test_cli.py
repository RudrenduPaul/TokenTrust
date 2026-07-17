"""Ported from src/cli.test.ts."""

import pytest

from tokentrust.cli import parse_cli_flags, resolve_verify_options
from tokentrust.verify import CliUsageError


class TestParseCliFlags:
    def test_parses_a_single_proxy_flag(self):
        flags = parse_cli_flags(["--proxy", "rtk"])
        assert flags.proxy == ["rtk"]
        assert flags.live is False
        assert flags.confirm_cost is False
        assert flags.format == "terminal"

    def test_parses_repeated_proxy_flags(self):
        flags = parse_cli_flags(["--proxy", "rtk", "--proxy", "headroom"])
        assert flags.proxy == ["rtk", "headroom"]

    def test_parses_live_confirm_cost_and_live_max_tasks_together(self):
        flags = parse_cli_flags(
            ["--proxy", "rtk", "--live", "--confirm-cost", "--live-max-tasks", "3"]
        )
        assert flags.live is True
        assert flags.confirm_cost is True
        assert flags.live_max_tasks == "3"

    def test_defaults_repo_and_tasks_to_none_when_omitted(self):
        flags = parse_cli_flags(["--proxy", "rtk"])
        assert flags.repo is None
        assert flags.tasks is None

    def test_parses_repo_and_tasks_and_format(self):
        flags = parse_cli_flags(
            ["--proxy", "rtk", "--repo", "/some/repo", "--tasks", "custom.yml", "--format", "json"]
        )
        assert flags.repo == "/some/repo"
        assert flags.tasks == "custom.yml"
        assert flags.format == "json"

    def test_rejects_unknown_flag(self):
        with pytest.raises(CliUsageError, match="Unknown flag"):
            parse_cli_flags(["--proxy", "rtk", "--bogus-flag"])

    def test_rejects_proxy_flag_with_no_value(self):
        with pytest.raises(CliUsageError, match="--proxy requires a value"):
            parse_cli_flags(["--proxy"])


class TestResolveVerifyOptions:
    cwd = "/home/dev/my-repo"

    def test_requires_at_least_one_proxy(self):
        with pytest.raises(CliUsageError, match="--proxy is required"):
            resolve_verify_options(parse_cli_flags([]), self.cwd)

    def test_rejects_unsupported_proxy_name(self):
        with pytest.raises(CliUsageError, match='Unknown proxy "context-mode"'):
            resolve_verify_options(parse_cli_flags(["--proxy", "context-mode"]), self.cwd)

    def test_repo_defaults_to_given_cwd_when_omitted(self):
        options = resolve_verify_options(parse_cli_flags(["--proxy", "rtk"]), self.cwd)
        assert options.repo == self.cwd

    def test_tasks_defaults_to_bundled_corpus_path_when_omitted(self):
        options = resolve_verify_options(parse_cli_flags(["--proxy", "rtk"]), self.cwd)
        assert options.tasks_path.endswith("tasks.yml")

    def test_live_max_tasks_defaults_to_5(self):
        options = resolve_verify_options(parse_cli_flags(["--proxy", "rtk"]), self.cwd)
        assert options.live_max_tasks == 5

    def test_rejects_non_positive_live_max_tasks(self):
        with pytest.raises(CliUsageError, match="--live-max-tasks must be a positive integer"):
            resolve_verify_options(parse_cli_flags(["--proxy", "rtk", "--live-max-tasks", "0"]), self.cwd)

    def test_rejects_invalid_format(self):
        with pytest.raises(CliUsageError, match="--format must be"):
            resolve_verify_options(parse_cli_flags(["--proxy", "rtk", "--format", "xml"]), self.cwd)

    def test_accepts_repeated_proxy_for_tt04(self):
        options = resolve_verify_options(parse_cli_flags(["--proxy", "rtk", "--proxy", "headroom"]), self.cwd)
        assert options.proxies == ["rtk", "headroom"]


class TestMain:
    def test_unknown_command_returns_exit_code_1(self, capsys):
        from tokentrust.cli import main

        code = main(["bogus"])
        assert code == 1
        assert "Unknown command" in capsys.readouterr().err

    def test_no_args_returns_exit_code_1(self, capsys):
        from tokentrust.cli import main

        code = main([])
        assert code == 1

    def test_top_level_help_returns_0(self, capsys):
        from tokentrust.cli import main

        code = main(["--help"])
        assert code == 0
        assert "tokentrust verify" in capsys.readouterr().out

    def test_verify_help_returns_0(self, capsys):
        from tokentrust.cli import main

        code = main(["verify", "--help"])
        assert code == 0
        assert "--proxy" in capsys.readouterr().out

    def test_verify_without_proxy_returns_1(self, capsys):
        from tokentrust.cli import main

        code = main(["verify"])
        assert code == 1
        assert "--proxy is required" in capsys.readouterr().err
