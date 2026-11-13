from pygments.style import Style
from pygments.token import (
    Comment,
    Error,
    Generic,
    Keyword,
    Literal,
    Name,
    Number,
    Operator,
    Punctuation,
    String,
)


class CairnStyle(Style):
    """Restrained syntax highlighting palette matching Cairn design tokens."""

    name = "cairn"
    background_color = "transparent"
    default_style = ""

    styles = {
        Comment: "italic #6e7387",
        Keyword: "bold #4338ca",
        Keyword.Type: "#4338ca",
        Operator: "#525866",
        Punctuation: "#525866",
        Name.Function: "#1d4ed8",
        Name.Class: "bold #1d4ed8",
        Name.Builtin: "#4338ca",
        Name.Decorator: "#6d28d9",
        String: "#15803d",
        String.Doc: "italic #6e7387",
        Number: "#b45309",
        Literal: "#b45309",
        Generic.Heading: "bold #18181b",
        Generic.Inserted: "#15803d",
        Generic.Deleted: "#b91c1c",
        Error: "#b91c1c",
    }

