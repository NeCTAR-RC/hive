"""The one way a Nectar rule refuses a request."""


class RuleViolation(ValueError):
    """A request breaks a Nectar rule; the message tells the user which
    and how to fix it. The rules raise it knowing nothing of HTTP; the
    API answers 400 (``hive.errors``), and a request model that calls a
    rule in a validator answers 422 with the message on the field."""
