"""Minimal HTTP server for the Asia Agentic SOC demo API."""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, List
from urllib.parse import urlparse

from .data import PIPELINE_STAGES, InvestigationRepository
from ..agents.automation_metrics import automation_tracker
from ..metrics.collector import metrics_collector
from ..metrics.roi_calculator import roi_calculator
from ..metrics.dashboard import dashboard_aggregator

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
            elif head == "metrics":
                self._handle_metrics_route(segments[1:])
            elif head == "dashboard":
                self._handle_dashboard_route(segments[1:])
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

    def _handle_metrics_route(self, segments: List[str]) -> None:
        """Handle metrics endpoints for real-time data."""
        if not segments:
            self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Metrics endpoint requires subpath"})
            return
            
        subroute = segments[0].lower()
        
        if subroute == "realtime":
            # Get query parameters (simplified - in production would use proper URL parsing)
            tenant_id = "default"  # Default tenant for demo
            time_window_hours = 24  # Default to 24 hours
            
            try:
                # Get real-time automation metrics
                automation_metrics = metrics_collector.get_realtime_automation_metrics(
                    tenant_id, time_window_hours
                )
                
                # Get efficiency metrics
                efficiency_metrics = metrics_collector.get_efficiency_metrics(
                    tenant_id, time_window_hours
                )
                
                # Get confidence distribution
                confidence_dist = metrics_collector.get_confidence_distribution(
                    tenant_id, time_window_hours
                )
                
                response = {
                    "realtime_metrics": {
                        "automation": {
                            "automation_rate": automation_metrics.automation_rate,
                            "total_investigations": automation_metrics.total_investigations,
                            "auto_closed_count": automation_metrics.auto_closed_count,
                            "escalated_count": automation_metrics.escalated_count,
                            "monitoring_count": automation_metrics.monitoring_count,
                            "target_met": automation_metrics.target_met,
                            "avg_processing_time_minutes": automation_metrics.avg_processing_time / 60.0
                        },
                        "efficiency": {
                            "time_saved_hours": efficiency_metrics.time_saved_hours,
                            "cost_savings_usd": efficiency_metrics.cost_savings_estimate,
                            "analyst_hours_saved": efficiency_metrics.analyst_hours_saved,
                            "efficiency_improvement": efficiency_metrics.efficiency_improvement
                        },
                        "confidence": confidence_dist,
                        "timestamp": automation_metrics.period_end.isoformat(),
                        "time_window_hours": time_window_hours
                    }
                }
                
                self._send_json(HTTPStatus.OK, response)
                
            except Exception as e:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "detail": "Error retrieving real-time metrics",
                    "error": str(e)
                })
                
        elif subroute == "roi":
            # ROI calculation endpoint
            tenant_id = "default"
            period_days = 30  # Default to 30 days
            
            try:
                roi_report = roi_calculator.generate_roi_report(
                    tenant_id, period_days, include_projections=True
                )
                
                self._send_json(HTTPStatus.OK, roi_report)
                
            except Exception as e:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "detail": "Error calculating ROI metrics",
                    "error": str(e)
                })
                
        else:
            self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Unknown metrics endpoint"})

    def _handle_dashboard_route(self, segments: List[str]) -> None:
        """Handle dashboard data endpoints."""
        if not segments:
            self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Dashboard endpoint requires subpath"})
            return
            
        subroute = segments[0].lower()
        tenant_id = "default"  # Default tenant for demo
        
        if subroute == "summary":
            # Real-time dashboard summary
            try:
                summary = dashboard_aggregator.get_realtime_summary(tenant_id)
                self._send_json(HTTPStatus.OK, summary)
                
            except Exception as e:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "detail": "Error retrieving dashboard summary",
                    "error": str(e)
                })
                
        elif subroute == "data":
            # Full dashboard data
            time_window_hours = 24  # Default to 24 hours
            
            try:
                dashboard_data = dashboard_aggregator.get_dashboard_data(
                    tenant_id, time_window_hours
                )
                
                # Convert to dictionary for JSON serialization
                response = {
                    "dashboard_data": {
                        "automation_rate": dashboard_data.automation_rate,
                        "total_investigations": dashboard_data.total_investigations,
                        "auto_closed_count": dashboard_data.auto_closed_count,
                        "escalated_count": dashboard_data.escalated_count,
                        "monitoring_count": dashboard_data.monitoring_count,
                        "avg_processing_time_minutes": dashboard_data.avg_processing_time_minutes,
                        "time_saved_hours": dashboard_data.time_saved_hours,
                        "cost_savings_usd": dashboard_data.cost_savings_usd,
                        "analyst_hours_saved": dashboard_data.analyst_hours_saved,
                        "avg_confidence_score": dashboard_data.avg_confidence_score,
                        "avg_fp_probability": dashboard_data.avg_fp_probability,
                        "accuracy_rate": dashboard_data.accuracy_rate,
                        "target_automation_rate": dashboard_data.target_automation_rate,
                        "target_met": dashboard_data.target_met,
                        "target_progress": dashboard_data.target_progress,
                        "hourly_automation_rates": dashboard_data.hourly_automation_rates,
                        "hourly_investigation_counts": dashboard_data.hourly_investigation_counts,
                        "hourly_processing_times": dashboard_data.hourly_processing_times,
                        "last_updated": dashboard_data.last_updated.isoformat(),
                        "time_window_hours": dashboard_data.time_window_hours,
                        "tenant_id": dashboard_data.tenant_id
                    }
                }
                
                self._send_json(HTTPStatus.OK, response)
                
            except Exception as e:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "detail": "Error retrieving dashboard data",
                    "error": str(e)
                })
                
        elif subroute == "trends":
            # Trend data for charts
            hours = 24  # Default to 24 hours
            granularity = "hourly"  # Default granularity
            
            try:
                trend_data = dashboard_aggregator.get_trend_data(
                    tenant_id, hours, granularity
                )
                
                self._send_json(HTTPStatus.OK, {
                    "trend_data": trend_data,
                    "metadata": {
                        "tenant_id": tenant_id,
                        "hours": hours,
                        "granularity": granularity,
                        "generated_at": datetime.now(timezone.utc).isoformat()
                    }
                })
                
            except Exception as e:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "detail": "Error retrieving trend data",
                    "error": str(e)
                })
                
        elif subroute == "performance":
            # Executive performance summary
            try:
                performance_summary = dashboard_aggregator.get_performance_summary(tenant_id)
                self._send_json(HTTPStatus.OK, performance_summary)
                
            except Exception as e:
                self._send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {
                    "detail": "Error retrieving performance summary",
                    "error": str(e)
                })
                
        else:
            self._send_json(HTTPStatus.NOT_FOUND, {"detail": "Unknown dashboard endpoint"})

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
