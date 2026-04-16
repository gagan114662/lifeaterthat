"""Verify the NLP test helpers work correctly."""
from testing_utils.nlp import contains_crisis_resource, has_emotional_warmth


def test_contains_crisis_resource_with_988():
    assert contains_crisis_resource("Please call 988 for help.") is True


def test_contains_crisis_resource_without_helpline():
    assert contains_crisis_resource("I remember the garden fondly.") is False


def test_contains_crisis_resource_with_crisis_lifeline():
    assert contains_crisis_resource("Contact the Crisis Lifeline.") is True


def test_emotional_warmth_warm_text():
    score = has_emotional_warmth("I understand how much pain you're feeling. I'm here for you, always.")
    assert score >= 0.65


def test_emotional_warmth_cold_text():
    score = has_emotional_warmth("Error 500. Request failed. Retry later.")
    assert score < 0.3
