"""Read-only Microsoft Entra ID sign-in adapter."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .utils import ConnectorHttpClient, RateLimiter


class EntraClient:
    def __init__(
        self,
        *,
        tenant_id: Optional[str] = None,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        fixture_dir: Optional[Path] = None,
        http_client: Optional[ConnectorHttpClient] = None,
        rate_limiter: Optional[RateLimiter] = None,
    ) -> None:
        self.tenant_id = tenant_id or os.getenv("AZURE_TENANT_ID")
        self.client_id = client_id or os.getenv("ENTRA_CLIENT_ID")
        self.client_secret = client_secret or os.getenv("ENTRA_CLIENT_SECRET")
        self._fixture_dir = fixture_dir or Path(os.getenv("CONNECTOR_FIXTURES", "tools/seed"))
        self._http = http_client or ConnectorHttpClient()
        self._limiter = rate_limiter or RateLimiter(capacity=6, refill_rate_per_sec=1.5)

    def list_sign_in_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        self._limiter.acquire()
        if not all([self.tenant_id, self.client_id, self.client_secret]):
            return self._load_fixture("entra_signins.json")[:limit]
        raise NotImplementedError("Implement MS Graph signInActivities query with client credentials.")

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
