"""
Crisis safety classifier.

Runs BEFORE the LLM call. If crisis intent is detected, returns a
deterministic safe response -- no LLM involved.
"""
import re

CRISIS_PATTERNS = [
    r"want to (hurt|harm|kill) myself",
    r"don.t want to (be here|live|exist)",
    r"thinking about (ending|suicide|dying)",
    r"(suicidal|self.harm|self harm)",
]

SAFE_RESPONSE = (
    "I can hear how much pain you're in right now, and I'm so glad you reached out. "
    "Please know you are not alone. If you're having thoughts of hurting yourself, "
    "please call or text 988 (Suicide & Crisis Lifeline) \u2014 they're available 24/7. "
    "You matter deeply to everyone who loves you."
)


def is_crisis_message(text: str) -> bool:
    """Return True if the message contains self-harm or suicidal intent."""
    return any(re.search(p, text, re.IGNORECASE) for p in CRISIS_PATTERNS)
