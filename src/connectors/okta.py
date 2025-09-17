"""Read-only Okta System Log adapter."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .utils import ConnectorHttpClient, RateLimiter


class OktaClient:
    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        api_token: Optional[str] = None,
        fixture_dir: Optional[Path] = None,
        http_client: Optional[ConnectorHttpClient] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.base_url = (base_url or os.getenv("OKTA_BASE_URL", "https://example.okta.com")).rstrip("/")
        self.api_token = api_token or os.getenv("OKTA_API_TOKEN")
        self._fixture_dir = fixture_dir or Path(os.getenv("CONNECTOR_FIXTURES", "tools/seed"))
        headers = {"Authorization": f"SSWS {self.api_token}"} if self.api_token else None
        self._http = http_client or ConnectorHttpClient()
        self._headers = headers
        self._limiter = rate_limiter or RateLimiter(capacity=8, refill_rate_per_sec=2)

    def list_security_events(self, limit: int = 50) -> List[Dict[str, Any]]:
        self._limiter.acquire()
        if not self.api_token:
            return self._load_fixture("okta_security_events.json")[:limit]
        raise NotImplementedError("Okta system log pagination pending implementation.")

    def _load_fixture(self, filename: str) -> List[Dict[str, Any]]:
        path = self._fixture_dir / filename
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and "events" in data:
            return data["events"]
        if isinstance(data, list):
            return data
        return [data]

    def close(self) -> None:
        self._http.close()
