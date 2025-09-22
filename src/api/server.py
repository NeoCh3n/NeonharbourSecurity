"""Minimal HTTP server for the Asia Agentic SOC demo API."""
from __future__ import annotations

import argparse
import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List
from urllib.parse import urlparse

from .data import PIPELINE_STAGES, InvestigationRepository
from ..agents.automation_metrics import automation_tracker

_REPOSITORY = InvestigationRepository()


class SocRequestHandler(BaseHTTPRequestHandler):
    server_version = "AsiaAgenticSOC/0.1"

    def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
        parsed = urlparse(self.path)
        segments = [segment for segment in parsed.path.split("/") if segment]
        try:
            if not segments:
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Not found"})
                return

            head = segments[0].lower()
            if head == "health":
                self._send_json(HTTPStatus.OK, {"status": "ok"})
            elif head == "pipeline" and len(segments) == 2 and segments[1] == "stages":
                self._send_json(HTTPStatus.OK, {"items": PIPELINE_STAGES})
            elif head == "investigations":
                self._handle_investigation_route(segments[1:])
            elif head == "automation":
                self._handle_automation_route(segments[1:])
            else:
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Unknown endpoint"})
        except Exception as exc:  # pragma: no cover - defensive programming
            body = {"detail": "Internal server error", "error": str(exc)}
            self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, body)

    # ------------------------------------------------------------------
    def _handle_investigation_route(self, segments: List[str]) -> None:
        if not segments:
            items = _REPOSITORY.list_investigations()
            self._send_json(HTTPStatus.OK, {"items": items, "count": len(items)})
            return

        investigation_id = segments[0]
        if len(segments) == 1:
            record = _REPOSITORY.get_investigation(investigation_id)
            if not record:
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Investigation not found"})
                return
            self._send_json(HTTPStatus.OK, record)
            return

        subroute = segments[1].lower()
        if subroute == "timeline":
            timeline = _REPOSITORY.get_timeline(investigation_id)
            if not timeline:
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Timeline not available"})
                return
            self._send_json(HTTPStatus.OK, {"items": timeline, "count": len(timeline)})
            return

        if subroute == "stages" and len(segments) == 3:
            stage = segments[2].lower()
            stage_meta = next(
                (meta for meta in PIPELINE_STAGES if meta["stage"] == stage), None
            )
            if not stage_meta:
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Unknown stage"})
                return
            payload = _REPOSITORY.get_stage_payload(investigation_id, stage)
            if payload is None:
                self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Investigation not found"})
                return
            timeline = _REPOSITORY.get_timeline(investigation_id)
            entry = next((row for row in timeline if row.get("stage") == stage), None)
            status = (entry or {}).get("status") or ("Completed" if payload else "Pending")
            body: Dict[str, Any] = {
                "stage": stage,
                "label": stage_meta["label"],
                "agent": stage_meta["agent"],
                "status": status,
                "payload": payload,
                "completedAt": (entry or {}).get("completedAt"),
                "durationSeconds": (entry or {}).get("durationSeconds"),
            }
            self._send_json(HTTPStatus.OK, body)
            return

        self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Unknown endpoint"})

    def _handle_automation_route(self, segments: List[str]) -> None:
        """Handle automation metrics endpoints."""
        if not segments:
            self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Automation endpoint requires subpath"})
            return
            
        subroute = segments[0].lower()
        
        if subroute == "metrics":
            # Parse query parameters (simplified for this implementation)
            days = 7  # Default to 7 days
            
            # Get automation rate metrics
            automation_rate = automation_tracker.get_automation_rate(days)
            
            # Get confidence distribution
            confidence_dist = automation_tracker.get_confidence_distribution(days)
            
            # Get false positive accuracy
            fp_accuracy = automation_tracker.get_false_positive_accuracy(days)
            
            response = {
                "automation_metrics": {
                    "automation_rate": automation_rate,
                    "confidence_distribution": confidence_dist,
                    "false_positive_accuracy": fp_accuracy,
                    "period_days": days,
                    "target_automation_rate": 0.8,
                    "target_met": automation_rate.get("target_met", False)
                }
            }
            self._send_json(HTTPStatus.OK, response)
            return
            
        elif subroute == "realtime":
            # Get today's metrics
            today_metrics = automation_tracker.get_automation_rate(days=1)
            
            # Get recent confidence distribution
            recent_confidence = automation_tracker.get_confidence_distribution(days=1)
            
            response = {
                "realtime_stats": {
                    "today_automation_rate": today_metrics.get("automation_rate", 0.0),
                    "today_investigations": today_metrics.get("total_investigations", 0),
                    "auto_closed_today": int(today_metrics.get("total_investigations", 0) * today_metrics.get("auto_close_rate", 0.0)),
                    "escalated_today": int(today_metrics.get("total_investigations", 0) * today_metrics.get("escalation_rate", 0.0)),
                    "avg_confidence": recent_confidence.get("avg_confidence", 0.0),
                    "avg_fp_probability": recent_confidence.get("avg_fp_probability", 0.0),
                    "target_met": today_metrics.get("target_met", False),
                    "efficiency_improvement": max(0, (today_metrics.get("automation_rate", 0.0) - 0.2) * 100)  # Improvement over 20% baseline
                }
            }
            self._send_json(HTTPStatus.OK, response)
            return
            
        else:
            self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Unknown automation endpoint"})

    # ------------------------------------------------------------------
    def _send_json(self, status: HTTPStatus, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003 - inherited name
        return


def create_server(host: str = "127.0.0.1", port: int = 4000) -> ThreadingHTTPServer:
    return ThreadingHTTPServer((host, port), SocRequestHandler)


def serve(host: str = "127.0.0.1", port: int = 4000) -> None:
    with create_server(host, port) as httpd:
        print(f"Serving Asia Agentic SOC API on http://{host}:{port}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:  # pragma: no cover - manual shutdown
            print("\nShutting down API server…")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Asia Agentic SOC API server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    serve(host=args.host, port=args.port)


if __name__ == "__main__":
    main()
