"""Shared utilities for connector adapters (rate limiting and retries)."""
from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Dict, Optional

import httpx


@dataclass
class RateLimiter:
    capacity: int
    refill_rate_per_sec: float

    def __post_init__(self) -> None:
        self._tokens = float(self.capacity)
        self._last_refill = time.monotonic()
        self._lock = threading.Lock()

    def acquire(self) -> None:
        with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            refill = elapsed * self.refill_rate_per_sec
            if refill > 0:
                self._tokens = min(self.capacity, self._tokens + refill)
                self._last_refill = now
            if self._tokens >= 1:
                self._tokens -= 1
                return
        time.sleep(1.0 / max(self.refill_rate_per_sec, 1))
        self.acquire()


class ConnectorHttpClient:
    """Thin wrapper with retry + telemetry hooks for REST APIs."""

    def __init__(self, timeout: float = 15.0, user_agent: Optional[str] = None) -> None:
        headers: Dict[str, str] = {
            "User-Agent": user_agent or "AsiaAgenticSOC/1.0",
        }
        self._client = httpx.Client(timeout=timeout, headers=headers)

    def request(self, method: str, url: str, *, headers: Optional[Dict[str, str]] = None, params=None, json=None) -> httpx.Response:
        attempts = 0
        backoff = 1.0
        last_error: Optional[httpx.HTTPError] = None
        while attempts < 5:
            attempts += 1
            try:
                response = self._client.request(method, url, headers=headers, params=params, json=json)
                if response.status_code in {429, 500, 502, 503, 504}:
                    time.sleep(backoff)
                    backoff = min(backoff * 2, 16)
                    continue
                response.raise_for_status()
                return response
            except httpx.HTTPError as exc:
                last_error = exc
                time.sleep(backoff)
                backoff = min(backoff * 2, 16)
        if last_error is not None:
            raise last_error
        raise RuntimeError("HTTP request failed without exception context")

    def close(self) -> None:
        self._client.close()
