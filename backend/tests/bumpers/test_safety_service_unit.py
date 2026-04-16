"""Unit tests for the safety service -- runs without the server."""
import pytest
from app.services.safety_service import is_crisis_message, SAFE_RESPONSE


@pytest.mark.parametrize("text", [
    "I want to hurt myself",
    "I don't want to be here anymore",
    "I've been thinking about ending it all",
    "I'm feeling suicidal",
    "I want to kill myself",
    "thinking about self-harm lately",
])
def test_crisis_detected(text: str):
    assert is_crisis_message(text) is True


@pytest.mark.parametrize("text", [
    "I miss my grandmother so much",
    "The holidays are really hard without her",
    "I feel so alone since he passed",
    "Tell me about your favorite memory",
    "I want to hear your voice again",
])
def test_grief_not_flagged_as_crisis(text: str):
    assert is_crisis_message(text) is False


def test_safe_response_contains_988():
    assert "988" in SAFE_RESPONSE


def test_safe_response_is_warm():
    assert "pain" in SAFE_RESPONSE.lower() or "hear" in SAFE_RESPONSE.lower()
