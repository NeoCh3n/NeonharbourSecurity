"""Read-only Splunk Search adapter."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .utils import ConnectorHttpClient, RateLimiter


class SplunkClient:
    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        fixture_dir: Optional[Path] = None,
        http_client: Optional[ConnectorHttpClient] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.base_url = base_url or os.getenv("SPLUNK_BASE_URL")
        self.username = username or os.getenv("SPLUNK_USERNAME")
        self.password = password or os.getenv("SPLUNK_PASSWORD")
        self._fixture_dir = fixture_dir or Path(os.getenv("CONNECTOR_FIXTURES", "tools/seed"))
        self._http = http_client or ConnectorHttpClient()
        self._limiter = rate_limiter or RateLimiter(capacity=4, refill_rate_per_sec=1)

    def search(self, query: str, earliest: str = "-24h", latest: str = "now", limit: int = 50) -> List[Dict[str, Any]]:
        self._limiter.acquire()
        if not all([self.base_url, self.username, self.password]):
            return self._load_fixture("splunk_events.json")[:limit]
        raise NotImplementedError("Splunk search API flow pending token/session key implementation.")

    def _load_fixture(self, filename: str) -> List[Dict[str, Any]]:
        path = self._fixture_dir / filename
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and "results" in data:
            return data["results"]
        if isinstance(data, list):
            return data
        return [data]

    def close(self) -> None:
        self._http.close()
