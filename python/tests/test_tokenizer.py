"""Ported from src/tokenizer/index.test.ts."""

from tokentrust.tokenizer import count


def test_counts_tokens_in_plain_text():
    result = count("The quick brown fox jumps over the lazy dog.")
    assert result.skipped is False
    assert result.tokens > 0
    # Real tiktoken cl100k_base count for this sentence is 10 tokens --
    # verified identical to js-tiktoken's count for the same string before
    # this port shipped (see CONTRIBUTING.md's tokenizer parity note).
    assert result.tokens == 10


def test_returns_zero_tokens_not_skipped_for_empty_string():
    result = count("")
    assert result.tokens == 0
    assert result.skipped is False


def test_counts_more_tokens_for_longer_more_repetitive_text():
    short = count("hello world")
    long_ = count("hello world " * 20)
    assert long_.tokens > short.tokens


class TestMalformedNonUtf8Input:
    """CRITICAL named failure path."""

    def test_flags_replacement_character_as_skipped_never_raises(self):
        result = count("valid text � more text")
        assert result.skipped is True
        assert "malformed" in result.reason.lower() or "non-utf8" in result.reason.lower()
        assert result.tokens == 0

    def test_does_not_flag_a_real_emoji_as_malformed(self):
        result = count("valid emoji: \U0001f600")
        assert result.skipped is False
        assert result.tokens > 0
