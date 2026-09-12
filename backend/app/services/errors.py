class ProviderError(Exception):
    def __init__(self, code: str, public_message: str, status_code: int = 502) -> None:
        super().__init__(public_message)
        self.code = code
        self.public_message = public_message
        self.status_code = status_code


class ClientInputError(ProviderError):
    def __init__(self, message: str) -> None:
        super().__init__("INVALID_REQUEST", message, status_code=422)


class MissingProviderKey(ProviderError):
    def __init__(self, provider: str) -> None:
        super().__init__(
            "PROVIDER_NOT_CONFIGURED",
            f"{provider} integration is not configured.",
            status_code=503,
        )


class ProviderAuthenticationError(ProviderError):
    def __init__(self, provider: str) -> None:
        super().__init__(
            "UPSTREAM_AUTHENTICATION_FAILED",
            f"{provider} authentication failed.",
        )


class ProviderRateLimitError(ProviderError):
    def __init__(self, provider: str) -> None:
        super().__init__(
            "UPSTREAM_RATE_LIMITED",
            f"{provider} is temporarily rate limited.",
            status_code=503,
        )


class ProviderTimeoutError(ProviderError):
    def __init__(self, provider: str) -> None:
        super().__init__(
            "UPSTREAM_TIMEOUT",
            f"{provider} did not respond in time.",
            status_code=504,
        )


class ProviderUnavailableError(ProviderError):
    def __init__(self, provider: str) -> None:
        super().__init__(
            "UPSTREAM_UNAVAILABLE",
            f"{provider} is temporarily unavailable.",
        )


class MalformedProviderResponse(ProviderError):
    def __init__(self, provider: str) -> None:
        super().__init__(
            "UPSTREAM_INVALID_RESPONSE",
            f"{provider} returned an invalid response.",
        )
