"""Read-only Microsoft Sentinel adapter."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .utils import ConnectorHttpClient, RateLimiter


class SentinelClient:
    def __init__(
        self,
        *,
        workspace_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        api_version: str = "2023-09-01-preview",
        fixture_dir: Optional[Path] = None,
        http_client: Optional[ConnectorHttpClient] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.workspace_id = workspace_id or os.getenv("SENTINEL_WORKSPACE_ID")
        self.tenant_id = tenant_id or os.getenv("AZURE_TENANT_ID")
        self.client_id = client_id or os.getenv("SENTINEL_CLIENT_ID")
        self.client_secret = client_secret or os.getenv("SENTINEL_CLIENT_SECRET")
        self.api_version = api_version
        self._fixture_dir = fixture_dir or Path(os.getenv("CONNECTOR_FIXTURES", "tools/seed"))
        self._http = http_client or ConnectorHttpClient()
        self._limiter = rate_limiter or RateLimiter(capacity=5, refill_rate_per_sec=1)

    def fetch_recent_alerts(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Return Sentinel incidents using live API when configured, else fixtures."""
        self._limiter.acquire()
        if not all([self.workspace_id, self.tenant_id, self.client_id, self.client_secret]):
            return self._load_fixture("sentinel_alerts.json")[:limit]
        raise NotImplementedError(
            "Azure Sentinel live integration pending: implement client credential flow and Log Analytics query."
        )

    def _load_fixture(self, filename: str) -> List[Dict[str, Any]]:
        path = self._fixture_dir / filename
        if not path.exists():
            return []
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and "value" in data:
            return data["value"]
        if isinstance(data, list):
            return data
        return [data]

    def close(self) -> None:
        self._http.close()
