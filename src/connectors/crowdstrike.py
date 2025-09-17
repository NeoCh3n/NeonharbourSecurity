"""Read-only CrowdStrike Falcon adapter."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .utils import ConnectorHttpClient, RateLimiter


class CrowdStrikeClient:
    def __init__(
        self,
        *,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        base_url: str = "https://api.crowdstrike.com",
        fixture_dir: Optional[Path] = None,
        http_client: Optional[ConnectorHttpClient] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.client_id = client_id or os.getenv("CROWDSTRIKE_CLIENT_ID")
        self.client_secret = client_secret or os.getenv("CROWDSTRIKE_CLIENT_SECRET")
        self.base_url = base_url
        self._fixture_dir = fixture_dir or Path(os.getenv("CONNECTOR_FIXTURES", "tools/seed"))
        self._http = http_client or ConnectorHttpClient()
        self._limiter = rate_limiter or RateLimiter(capacity=6, refill_rate_per_sec=1)

    def list_detections(self, limit: int = 20) -> List[Dict[str, Any]]:
        self._limiter.acquire()
        if not all([self.client_id, self.client_secret]):
            return self._load_fixture("crowdstrike_detections.json")[:limit]
        raise NotImplementedError("CrowdStrike OAuth2 and detections query pending implementation.")

    def _load_fixture(self, filename: str) -> List[Dict[str, Any]]:
        path = self._fixture_dir / filename
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and "resources" in data:
            return data["resources"]
        if isinstance(data, list):
            return data
        return [data]

    def close(self) -> None:
        self._http.close()
