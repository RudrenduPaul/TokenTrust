"""Ported from src/mcp/tool-schema.test.ts."""

from __future__ import annotations

import jsonschema

from tokentrust.mcp.tool_schema import (
    VERIFY_PROXY_SAVINGS_INPUT_SCHEMA,
    VERIFY_TOOL_NAME,
    normalize_proxy_input,
)


def _validate(instance: dict) -> bool:
    try:
        jsonschema.validate(instance=instance, schema=VERIFY_PROXY_SAVINGS_INPUT_SCHEMA)
        return True
    except jsonschema.ValidationError:
        return False


class TestVerifyProxySavingsInputSchema:
    def test_accepts_a_minimal_valid_input_single_proxy_name_only(self):
        assert _validate({"proxy": "rtk"}) is True

    def test_accepts_an_array_of_proxy_names(self):
        assert _validate({"proxy": ["rtk", "headroom"]}) is True

    def test_accepts_the_full_flag_set_mirroring_the_cli_verify_flags(self):
        assert (
            _validate(
                {
                    "proxy": "rtk",
                    "repo": "/some/repo",
                    "tasks": "./my-tasks.yml",
                    "live": True,
                    "confirmCost": True,
                    "liveMaxTasks": 3,
                }
            )
            is True
        )

    def test_rejects_a_missing_proxy_field(self):
        assert _validate({}) is False

    def test_rejects_an_empty_proxy_array(self):
        assert _validate({"proxy": []}) is False

    def test_rejects_an_unsupported_proxy_name(self):
        assert _validate({"proxy": "context-mode"}) is False

    def test_rejects_a_zero_or_negative_live_max_tasks(self):
        assert _validate({"proxy": "rtk", "liveMaxTasks": 0}) is False
        assert _validate({"proxy": "rtk", "liveMaxTasks": -1}) is False

    def test_rejects_a_non_integer_live_max_tasks(self):
        assert _validate({"proxy": "rtk", "liveMaxTasks": 2.5}) is False

    def test_rejects_non_boolean_live_confirm_cost_values(self):
        assert _validate({"proxy": "rtk", "live": "yes"}) is False
        assert _validate({"proxy": "rtk", "confirmCost": "yes"}) is False

    def test_does_not_advertise_a_format_field_the_mcp_surface_never_exposes_it(self):
        assert "format" not in VERIFY_PROXY_SAVINGS_INPUT_SCHEMA["properties"]
        # The schema doesn't reject an unknown extra field either (mirrors zod's default,
        # non-strict object parsing) -- the handler in mcp/server.py simply never reads it.
        assert _validate({"proxy": "rtk", "format": "terminal"}) is True

    def test_wire_field_names_match_the_npm_packages_tool_contract_exactly(self):
        assert set(VERIFY_PROXY_SAVINGS_INPUT_SCHEMA["properties"].keys()) == {
            "proxy",
            "repo",
            "tasks",
            "live",
            "confirmCost",
            "liveMaxTasks",
        }
        assert VERIFY_PROXY_SAVINGS_INPUT_SCHEMA["required"] == ["proxy"]


class TestNormalizeProxyInput:
    def test_wraps_a_single_proxy_name_in_a_list(self):
        assert normalize_proxy_input("rtk") == ["rtk"]

    def test_passes_a_list_of_proxy_names_through_unchanged(self):
        assert normalize_proxy_input(["rtk", "headroom"]) == ["rtk", "headroom"]


class TestVerifyToolName:
    def test_is_a_stable_non_empty_tool_name(self):
        assert VERIFY_TOOL_NAME == "verify_proxy_savings"
