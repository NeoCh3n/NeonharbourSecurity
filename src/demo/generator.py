"""Core demo data generator with LLM integration for realistic alert content."""
from __future__ import annotations

import json
import os
import random
import time
import uuid
from datetime import datetime, timezone, timedelta
from dataclasses import dataclass, asdict
from typing import Any, Dict, List, Optional, Iterator
from threading import Thread, Event
import logging

import boto3
from botocore.exceptions import ClientError

from src.ai.analyst import BedrockAnalyst, BedrockConfig
from src.demo.scenarios import ScenarioTemplate, get_scenario_templates
from src.demo.variations import AlertVariationEngine

logger = logging.getLogger(__name__)


@dataclass
class DemoAlert:
    """Structured demo alert with metadata."""
    alert_id: str
    investigation_id: str
    tenant_id: str
    source: str
    title: str
    description: str
    severity: str
    risk_level: str
    entities: List[Dict[str, Any]]
    tactics: List[str]
    timestamp: str
    scenario_type: str
    is_false_positive: bool
    confidence_score: float
    raw_data: Dict[str, Any]


@dataclass
class GenerationSession:
    """Demo generation session tracking."""
    session_id: str
    created_at: datetime
    scenario_types: List[str]
    interval_seconds: float
    false_positive_rate: float
    status: str  # "active" | "paused" | "stopped"
    alerts_generated: int = 0
    last_generation: Optional[datetime] = None


class DemoDataGenerator:
    """Core engine for creating synthetic security alerts with LLM-powered content."""
    
    def __init__(self, bedrock_config: Optional[BedrockConfig] = None):
        self.analyst = BedrockAnalyst(bedrock_config)
        self.variation_engine = AlertVariationEngine()
        self.scenario_templates = get_scenario_templates()
        self.event_client = boto3.client("events")
        self.event_bus_name = os.getenv("EVENT_BUS_NAME", "AsiaAgenticSocBus")
        self.default_tenant_id = os.getenv("DEFAULT_TENANT_ID", "hk-demo")
        
        # Session management
        self._active_sessions: Dict[str, GenerationSession] = {}
        self._generation_threads: Dict[str, Thread] = {}
        self._stop_events: Dict[str, Event] = {}
        
    def start_continuous_generation(
        self,
        scenario_types: List[str],
        interval_seconds: float = 30.0,
        false_positive_rate: float = 0.8,
        duration_minutes: Optional[int] = None
    ) -> str:
        """Start continuous demo alert generation."""
        session_id = f"demo-{uuid.uuid4().hex[:8]}"
        
        # Validate scenario types
        available_scenarios = [t.scenario_type for t in self.scenario_templates]
        invalid_scenarios = [s for s in scenario_types if s not in available_scenarios]
        if invalid_scenarios:
            raise ValueError(f"Invalid scenario types: {invalid_scenarios}. Available: {available_scenarios}")
        
        session = GenerationSession(
            session_id=session_id,
            created_at=datetime.now(timezone.utc),
            scenario_types=scenario_types,
            interval_seconds=interval_seconds,
            false_positive_rate=false_positive_rate,
            status="active"
        )
        
        self._active_sessions[session_id] = session
        self._stop_events[session_id] = Event()
        
        # Start generation thread
        thread = Thread(
            target=self._generation_loop,
            args=(session_id, duration_minutes),
            daemon=True
        )
        self._generation_threads[session_id] = thread
        thread.start()
        
        logger.info(f"Started demo generation session {session_id}")
        return session_id
    
    def stop_generation(self, session_id: str) -> None:
        """Stop continuous generation for a session."""
        if session_id not in self._active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        # Signal stop
        if session_id in self._stop_events:
            self._stop_events[session_id].set()
        
        # Update session status
        self._active_sessions[session_id].status = "stopped"
        
        # Wait for thread to finish
        if session_id in self._generation_threads:
            self._generation_threads[session_id].join(timeout=5.0)
            del self._generation_threads[session_id]
        
        # Cleanup
        if session_id in self._stop_events:
            del self._stop_events[session_id]
        
        logger.info(f"Stopped demo generation session {session_id}")
    
    def pause_generation(self, session_id: str) -> None:
        """Pause generation for a session."""
        if session_id not in self._active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        self._active_sessions[session_id].status = "paused"
        logger.info(f"Paused demo generation session {session_id}")
    
    def resume_generation(self, session_id: str) -> None:
        """Resume generation for a paused session."""
        if session_id not in self._active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self._active_sessions[session_id]
        if session.status == "paused":
            session.status = "active"
            logger.info(f"Resumed demo generation session {session_id}")
    
    def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """Get current status of a generation session."""
        if session_id not in self._active_sessions:
            raise ValueError(f"Session {session_id} not found")
        
        session = self._active_sessions[session_id]
        return {
            "session_id": session_id,
            "status": session.status,
            "created_at": session.created_at.isoformat(),
            "scenario_types": session.scenario_types,
            "interval_seconds": session.interval_seconds,
            "false_positive_rate": session.false_positive_rate,
            "alerts_generated": session.alerts_generated,
            "last_generation": session.last_generation.isoformat() if session.last_generation else None
        }
    
    def list_active_sessions(self) -> List[Dict[str, Any]]:
        """List all active generation sessions."""
        return [
            self.get_session_status(session_id)
            for session_id in self._active_sessions
            if self._active_sessions[session_id].status in ["active", "paused"]
        ]
    
    def generate_single_alert(
        self,
        scenario_type: str,
        risk_level: str = "auto",
        tenant_id: Optional[str] = None
    ) -> DemoAlert:
        """Generate a single demo alert for immediate use."""
        # Find scenario template
        template = next(
            (t for t in self.scenario_templates if t.scenario_type == scenario_type),
            None
        )
        if not template:
            raise ValueError(f"Unknown scenario type: {scenario_type}")
        
        # Determine if this should be a false positive
        is_false_positive = risk_level == "low" or (
            risk_level == "auto" and random.random() < 0.8
        )
        
        # Generate alert using LLM
        alert = self._generate_alert_with_llm(
            template=template,
            is_false_positive=is_false_positive,
            tenant_id=tenant_id or self.default_tenant_id
        )
        
        return alert
    
    def send_alert_to_pipeline(self, alert: DemoAlert) -> None:
        """Send generated alert to the investigation pipeline via EventBridge."""
        detail = {
            "investigationId": alert.investigation_id,
            "tenantId": alert.tenant_id,
            "alert": {
                "source": alert.source,
                "title": alert.title,
                "description": alert.description,
                "severity": alert.severity,
                "entities": alert.entities,
                "tactics": alert.tactics,
                "alertId": alert.alert_id,
                "scenarioType": alert.scenario_type,
                "isDemo": True,
                "isFalsePositive": alert.is_false_positive,
                "confidenceScore": alert.confidence_score,
                "rawData": alert.raw_data
            },
            "receivedAt": alert.timestamp,
            "demoMetadata": {
                "scenarioType": alert.scenario_type,
                "isFalsePositive": alert.is_false_positive,
                "riskLevel": alert.risk_level,
                "isDemo": True
            }
        }
        
        try:
            # Ensure demo alerts route through complete Step Functions workflow
            # by using the same EventBridge pattern as live alerts
            self.event_client.put_events(
                Entries=[
                    {
                        "EventBusName": self.event_bus_name,
                        "Source": "asia.agentic.soc.demo",
                        "DetailType": "AgenticAlert",  # Same as live alerts for consistent routing
                        "Detail": json.dumps(detail),
                    }
                ]
            )
            logger.info(f"Sent demo alert {alert.alert_id} to complete Step Functions pipeline")
            
            # Validate that alert will route through complete workflow
            try:
                from .workflow_validator import workflow_validator
                routing_validation = workflow_validator.ensure_demo_workflow_routing(detail)
                if not routing_validation["alert_valid"]:
                    logger.warning(f"Demo alert routing issues: {routing_validation['routing_issues']}")
            except ImportError:
                pass  # Workflow validator not available
                
        except ClientError as e:
            logger.error(f"Failed to send alert to EventBridge: {e}")
            raise
    
    def _generation_loop(self, session_id: str, duration_minutes: Optional[int]) -> None:
        """Main generation loop for continuous alert creation."""
        session = self._active_sessions[session_id]
        stop_event = self._stop_events[session_id]
        
        start_time = datetime.now(timezone.utc)
        end_time = start_time + timedelta(minutes=duration_minutes) if duration_minutes else None
        
        while not stop_event.is_set():
            current_time = datetime.now(timezone.utc)
            
            # Check duration limit
            if end_time and current_time >= end_time:
                logger.info(f"Demo session {session_id} reached duration limit")
                break
            
            # Check if paused
            if session.status == "paused":
                time.sleep(1.0)
                continue
            
            try:
                # Select random scenario type
                scenario_type = random.choice(session.scenario_types)
                
                # Generate and send alert
                alert = self.generate_single_alert(
                    scenario_type=scenario_type,
                    tenant_id=session.session_id  # Use session ID as tenant for demo isolation
                )
                
                self.send_alert_to_pipeline(alert)
                
                # Update session stats
                session.alerts_generated += 1
                session.last_generation = current_time
                
                logger.info(
                    f"Generated demo alert {alert.alert_id} "
                    f"(session: {session_id}, type: {scenario_type}, "
                    f"fp: {alert.is_false_positive})"
                )
                
            except Exception as e:
                logger.error(f"Error generating demo alert for session {session_id}: {e}")
            
            # Wait for next generation
            stop_event.wait(timeout=session.interval_seconds)
        
        # Mark session as stopped
        session.status = "stopped"
        logger.info(f"Demo generation loop ended for session {session_id}")
    
    def _generate_alert_with_llm(
        self,
        template: ScenarioTemplate,
        is_false_positive: bool,
        tenant_id: str
    ) -> DemoAlert:
        """Generate realistic alert content using LLM."""
        # Create base alert structure
        alert_id = f"demo-{uuid.uuid4().hex[:8]}"
        investigation_id = f"INV-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{alert_id[-4:]}"
        
        # Apply variations to the template
        varied_template = self.variation_engine.apply_variations(template, is_false_positive)
        
        # Build LLM prompt for realistic content generation
        prompt = self._build_content_generation_prompt(varied_template, is_false_positive)
        
        try:
            # Use the analyst LLM to generate realistic content
            llm_input = {
                "scenario": varied_template.scenario_type,
                "template": asdict(varied_template),
                "is_false_positive": is_false_positive,
                "prompt": prompt
            }
            
            # Generate content using Bedrock
            response = self.analyst.summarize_investigation(llm_input)
            
            # Extract generated content
            generated_content = self._extract_generated_content(response, varied_template)
            
        except Exception as e:
            logger.warning(f"LLM generation failed, using template defaults: {e}")
            generated_content = self._fallback_content(varied_template, is_false_positive)
        
        # Build final alert
        alert = DemoAlert(
            alert_id=alert_id,
            investigation_id=investigation_id,
            tenant_id=tenant_id,
            source=varied_template.source,
            title=generated_content["title"],
            description=generated_content["description"],
            severity=varied_template.severity,
            risk_level="low" if is_false_positive else "high",
            entities=generated_content["entities"],
            tactics=varied_template.tactics,
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_type=varied_template.scenario_type,
            is_false_positive=is_false_positive,
            confidence_score=0.3 if is_false_positive else 0.8,
            raw_data=generated_content.get("raw_data", {})
        )
        
        return alert
    
    def _build_content_generation_prompt(
        self,
        template: ScenarioTemplate,
        is_false_positive: bool
    ) -> str:
        """Build prompt for LLM content generation."""
        fp_instruction = (
            "This should be a FALSE POSITIVE - make it look suspicious at first glance "
            "but have innocent explanations when investigated deeper."
            if is_false_positive else
            "This should be a GENUINE THREAT - make it clearly malicious with "
            "indicators of real attack activity."
        )
        
        return f"""
Generate realistic security alert content for a Hong Kong financial institution demo.

Scenario Type: {template.scenario_type}
Attack Vector: {template.attack_vector}
Source System: {template.source}
Severity: {template.severity}

{fp_instruction}

Generate a JSON response with:
- title: Specific, realistic alert title
- description: Detailed description with technical indicators
- entities: Array of relevant entities (users, IPs, files, etc.)
- raw_data: Simulated raw log data or detection details

Make it authentic for Hong Kong banking context with realistic:
- Employee names (use placeholder format like [employee_name])
- IP addresses (use Hong Kong ranges where appropriate)
- System names and applications common in financial institutions
- Timestamps and technical details

Ensure HKMA compliance considerations are reflected in the content.
"""
    
    def _extract_generated_content(
        self,
        llm_response: Dict[str, Any],
        template: ScenarioTemplate
    ) -> Dict[str, Any]:
        """Extract and validate generated content from LLM response."""
        try:
            # Try to parse structured content from LLM response
            if "summary" in llm_response and isinstance(llm_response["summary"], str):
                # Try to parse JSON from summary
                content = json.loads(llm_response["summary"])
            else:
                content = llm_response
            
            # Validate and provide defaults
            return {
                "title": content.get("title", template.title_template),
                "description": content.get("description", template.description_template),
                "entities": content.get("entities", template.default_entities),
                "raw_data": content.get("raw_data", {})
            }
            
        except (json.JSONDecodeError, KeyError, TypeError):
            # Fallback to template if LLM response is malformed
            return self._fallback_content(template, False)
    
    def _fallback_content(
        self,
        template: ScenarioTemplate,
        is_false_positive: bool
    ) -> Dict[str, Any]:
        """Provide fallback content when LLM generation fails."""
        return {
            "title": template.title_template,
            "description": template.description_template,
            "entities": template.default_entities,
            "raw_data": {
                "source": template.source,
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "fallback": True,
                "is_false_positive": is_false_positive
            }
        }