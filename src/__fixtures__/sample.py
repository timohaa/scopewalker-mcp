"""Sample Python file for testing."""


def greet(name: str) -> str:
    """Returns a greeting message."""
    return f"Hello, {name}!"


def farewell(name: str) -> str:
    # No docstring - should be flagged
    return f"Goodbye, {name}!"


class Person:
    """Represents a person."""

    def __init__(self, name: str):
        """Initialize with name."""
        self.name = name

    def introduce(self) -> str:
        # Undocumented method
        return f"I am {self.name}"
