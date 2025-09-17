"""Abstractions and implementations for agentic analyst LLM providers."""
from __future__ import annotations

import json
import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional

import boto3
from botocore.config import Config


_ALLOWED_ACTIONS = {
    "ISOLATE_EC2",
    "BLOCK_IP_WAF",
    "DISABLE_KEYS",
    "TICKET_UPSERT",
}


class AnalystLLM(ABC):
    """Provider-agnostic interface for investigation summarisation."""

    @property
    @abstractmethod
    def provider(self) -> str:
        """Return canonical provider identifier."""

    @abstractmethod
    def summarize_investigation(self, investigation: Dict[str, Any]) -> Dict[str, Any]:
        """Produce a structured summary for an investigation input."""

    @abstractmethod
    def embed_texts(self, texts: Iterable[str]) -> List[List[float]]:
        """Return vector embeddings for downstream RAG."""

    def record_feedback(
        self,
        *,
        investigation_id: str,
        tenant_id: str,
        feedback: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Persist post-investigation feedback; default is a no-op."""
        return None


@dataclass
class BedrockConfig:
    region: str
    text_model_id: str
    embed_model_id: str
    max_tokens: int = 2048
    temperature: float = 0.1


class BedrockAnalyst(AnalystLLM):
    """Runnable Bedrock-backed analyst implementation."""

    def __init__(self, config: Optional[BedrockConfig] = None) -> None:
        region = os.getenv("BEDROCK_REGION") or os.getenv("AWS_REGION") or "ap-southeast-1"
        text_model = os.getenv("BEDROCK_TEXT_MODEL", "anthropic.claude-3-haiku-20240307-v1:0")
        embed_model = os.getenv("BEDROCK_EMBED_MODEL", "amazon.titan-embed-text-v2")
        cfg = config or BedrockConfig(
            region=region,
            text_model_id=text_model,
            embed_model_id=embed_model,
            max_tokens=int(os.getenv("BEDROCK_MAX_TOKENS", "2048")),
            temperature=float(os.getenv("BEDROCK_TEMPERATURE", "0.1")),
        )
        self._config = cfg
        runtime_cfg = Config(retries={"max_attempts": 3, "mode": "standard"})
        self._runtime = boto3.client("bedrock-runtime", region_name=cfg.region, config=runtime_cfg)

    @property
    def provider(self) -> str:
        return "bedrock"

    def summarize_investigation(self, investigation: Dict[str, Any]) -> Dict[str, Any]:
        prompt = self._build_prompt(investigation)
        body = {
            "messages": [
                {"role": "system", "content": self._system_prompt()},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": self._config.max_tokens,
            "temperature": self._config.temperature,
        }
        start = time.time()
        response = self._runtime.invoke_model(
            modelId=self._config.text_model_id,
            body=json.dumps(body).encode("utf-8"),
            accept="application/json",
            contentType="application/json",
        )
        duration_ms = int((time.time() - start) * 1000)
        payload = json.loads(response["body"].read().decode("utf-8"))
        content = _extract_text(payload)
        summary = _safe_json_parse(content)
        if not summary:
            summary = {
                "summary": content,
                "risk_level": "unknown",
                "confidence": 0.4,
                "recommended_actions": [],
                "timeline": [],
            }
        summary["model"] = self._config.text_model_id
        summary["provider"] = self.provider
        summary["latency_ms"] = duration_ms
        summary["guardrails"] = self._allowed_actions(summary)
        return summary

    def embed_texts(self, texts: Iterable[str]) -> List[List[float]]:
        embeddings: List[List[float]] = []
        for text in texts:
            if not text:
                embeddings.append([])
                continue
            body = {
                "inputText": text,
                "dimensions": 1536,
            }
            response = self._runtime.invoke_model(
                modelId=self._config.embed_model_id,
                body=json.dumps(body).encode("utf-8"),
                accept="application/json",
                contentType="application/json",
            )
            payload = json.loads(response["body"].read().decode("utf-8"))
            vector = payload.get("embedding", [])
            embeddings.append(vector)
        return embeddings

    def _system_prompt(self) -> str:
        return (
            "You are an HKMA-aware SOC analyst. Always return JSON with keys: "
            "summary, risk_level (low|medium|high), confidence (0-1 float), timeline (array of steps), "
            "recommended_actions (array of {action_id, description, rationale}). "
            "Only use approved action_id values."
        )

    def _build_prompt(self, investigation: Dict[str, Any]) -> str:
        context = json.dumps(investigation, indent=2)
        return (
            "Investigate the following security alert for a Hong Kong financial institution. "
            "Tie controls back to HKMA SA-2 and TM-G-1 where relevant. Provide citations if the "
            "knowledge base includes matching documents.\n\n"
            f"Alert context:\n{context}"
        )

    def _allowed_actions(self, summary: Dict[str, Any]) -> List[Dict[str, str]]:
        allowed = []
        for action in summary.get("recommended_actions", []):
            action_id = action.get("action_id") or action.get("id")
            if action_id in _ALLOWED_ACTIONS:
                allowed.append({
                    "action_id": action_id,
                    "description": action.get("description", ""),
                    "rationale": action.get("rationale", ""),
                })
        return allowed

    def record_feedback(
        self,
        *,
        investigation_id: str,
        tenant_id: str,
        feedback: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        # Bedrock demo stores lightweight metadata for future adaptation hooks.
        return {
            "provider": self.provider,
            "model": self._config.text_model_id,
            "investigationId": investigation_id,
            "tenantId": tenant_id,
            "actions_considered": len(feedback.get("recommended_actions", [])),
            "risk_level": feedback.get("risk", {}).get("level"),
        }


class KiroAnalyst(AnalystLLM):
    """Placeholder for the Amazon Kiro security specialist agent."""

    @property
    def provider(self) -> str:
        return "kiro"

    def summarize_investigation(self, investigation: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError(
            "KiroAnalyst TODO: POST https://kiro.aws/api/v1/analyst with payload "
            "{'tenantId': str, 'alert': {...}, 'context': {...}, 'locale': 'hk'} -> "
            "{'summary': str, 'risk_level': 'high', 'recommended_actions': [...]}"
        )

    def embed_texts(self, texts: Iterable[str]) -> List[List[float]]:
        raise NotImplementedError(
            "KiroAnalyst embedding support is pending SDK GA. Provide vector results aligned with Titan dimensions."
        )

    def record_feedback(
        self,
        *,
        investigation_id: str,
        tenant_id: str,
        feedback: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        raise NotImplementedError(
            "KiroAnalyst feedback TODO: POST /feedback with payload "
            "{'investigationId': str, 'tenantId': str, 'score': float, 'notes': str}."
        )


class AmazonQAnalyst(AnalystLLM):
    """Placeholder for Amazon Q Developer assisted investigations."""

    @property
    def provider(self) -> str:
        return "amazonq"

    def summarize_investigation(self, investigation: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError(
            "AmazonQAnalyst should orchestrate Amazon Q Investigate API once available. "
            "Expect to send chat inputs with the investigation context and stream reasoning traces."
        )

    def embed_texts(self, texts: Iterable[str]) -> List[List[float]]:
        raise NotImplementedError("AmazonQAnalyst embedding path not yet defined; use Bedrock fallback.")

    def record_feedback(
        self,
        *,
        investigation_id: str,
        tenant_id: str,
        feedback: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        raise NotImplementedError(
            "AmazonQAnalyst feedback TODO: call Amazon Q Insights endpoint with payload "
            "{'conversationId': str, 'feedback': {...}} to improve answer alignment."
        )


def _extract_text(model_payload: Dict[str, Any]) -> str:
    if isinstance(model_payload, dict):
        if "output" in model_payload and isinstance(model_payload["output"], dict):
            return model_payload["output"].get("text", "")
        if "generation" in model_payload:
            return model_payload["generation"]
        if "result" in model_payload and isinstance(model_payload["result"], dict):
            return model_payload["result"].get("outputText", "")
    return json.dumps(model_payload)


def _safe_json_parse(payload: str) -> Optional[Dict[str, Any]]:
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None
