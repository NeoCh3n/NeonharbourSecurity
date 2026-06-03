import json
import os
import argparse
import urllib.error
import urllib.request
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, TypedDict


def load_env(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env()


class SOCState(TypedDict):
    alert: dict
    parsed: dict
    evidence: List[str]
    triage: str
    risk_score: int
    summary: str
    recommendation: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def post_json(url: str, payload: dict, headers: dict, method: str = "POST") -> dict:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={**headers, "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            response_body = response.read()
            if not response_body:
                return {}
            return json.loads(response_body.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with HTTP {exc.code}: {error_body}") from exc


class LangSmithTracer:
    def __init__(self) -> None:
        self.api_key = os.getenv("LANGSMITH_API_KEY")
        self.project = os.getenv("LANGSMITH_PROJECT", "neoharbor-security")
        self.enabled = (
            os.getenv("LANGSMITH_TRACING", "").lower() == "true" and bool(self.api_key)
        )
        self.api_url = os.getenv("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com")
        self.headers = {"x-api-key": self.api_key or ""}

    def create_run(
        self,
        name: str,
        run_type: str,
        inputs: dict,
        parent_run_id: Optional[str] = None,
    ) -> Optional[str]:
        if not self.enabled:
            return None
        run_id = str(uuid.uuid4())
        payload: Dict[str, Any] = {
            "id": run_id,
            "name": name,
            "run_type": run_type,
            "inputs": inputs,
            "start_time": utc_now(),
            "session_name": self.project,
        }
        if parent_run_id:
            payload["parent_run_id"] = parent_run_id
        post_json(f"{self.api_url}/runs", payload, self.headers)
        return run_id

    def patch_run(
        self,
        run_id: Optional[str],
        outputs: Optional[dict] = None,
        error: Optional[str] = None,
    ) -> None:
        if not self.enabled or not run_id:
            return
        payload: Dict[str, Any] = {"end_time": utc_now()}
        if outputs is not None:
            payload["outputs"] = outputs
        if error is not None:
            payload["error"] = error
        post_json(f"{self.api_url}/runs/{run_id}", payload, self.headers, method="PATCH")

    @contextmanager
    def run(
        self,
        name: str,
        run_type: str,
        inputs: dict,
        parent_run_id: Optional[str] = None,
    ):
        run_id = self.create_run(name, run_type, inputs, parent_run_id)
        try:
            yield run_id
        except Exception as exc:
            self.patch_run(run_id, error=str(exc))
            raise


tracer = LangSmithTracer()


def extract_response_text(response: dict) -> str:
    if response.get("output_text"):
        return response["output_text"]

    chunks: List[str] = []
    for item in response.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and content.get("text"):
                chunks.append(content["text"])
    return "\n".join(chunks).strip()


def llm_invoke(prompt: str, parent_run_id: Optional[str], name: str) -> str:
    model = os.getenv("OPENAI_MODEL", "gpt-5.5")
    base_url = os.getenv("OPENAI_BASE_URL", "https://api.llmhubapp.com/v1").rstrip("/")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")

    payload = {
        "model": model,
        "input": prompt,
        "max_output_tokens": 700,
    }
    with tracer.run(name, "llm", {"model": model, "prompt": prompt}, parent_run_id) as run_id:
        response = post_json(
            f"{base_url}/responses",
            payload,
            {"Authorization": f"Bearer {api_key}"},
        )
        text = extract_response_text(response)
        tracer.patch_run(
            run_id,
            {
                "text": text,
                "response_id": response.get("id"),
                "model": response.get("model", model),
            },
        )
        return text


def parse_alert(state: SOCState, parent_run_id: Optional[str] = None) -> SOCState:
    with tracer.run("parse_alert", "chain", {"alert": state["alert"]}, parent_run_id) as run_id:
        alert = state["alert"]
        state["parsed"] = {
            "host": alert.get("host"),
            "user": alert.get("user"),
            "command": alert.get("command"),
            "severity": alert.get("severity"),
            "event": alert.get("event"),
        }
        tracer.patch_run(run_id, {"parsed": state["parsed"]})
        return state


def retrieve_evidence(state: SOCState, parent_run_id: Optional[str] = None) -> SOCState:
    with tracer.run(
        "retrieve_evidence", "retriever", {"parsed": state["parsed"]}, parent_run_id
    ) as run_id:
        command = state["parsed"].get("command", "")
        event = state["parsed"].get("event", "")
        evidence = [
            "PowerShell with -nop often indicates bypassing profile loading.",
            "Hidden window execution is commonly seen in malware or post-exploitation.",
            "EncodedCommand can hide payload content from casual inspection.",
            "Finance endpoint has elevated business impact.",
        ]
        if "lsass" in command.lower() or "mimikatz" in event.lower():
            evidence.append("LSASS access is strongly associated with credential dumping.")
        if "schtasks" in command.lower():
            evidence.append("Scheduled task creation is a common persistence technique.")
        if "rundll32" in command.lower():
            evidence.append("Suspicious rundll32 usage can indicate proxy execution.")
        if "7z.exe" in command.lower() or "archive" in event.lower():
            evidence.append("Large archive creation can precede data exfiltration.")
        if "failed logons" in event.lower() or "4625" in command:
            evidence.append("Failed logon bursts followed by success can indicate password guessing.")
        state["evidence"] = evidence
        tracer.patch_run(run_id, {"evidence": evidence})
        return state


def triage_alert(state: SOCState, parent_run_id: Optional[str] = None) -> SOCState:
    with tracer.run(
        "triage_alert", "chain", {"parsed": state["parsed"], "evidence": state["evidence"]}, parent_run_id
    ) as run_id:
        prompt = f"""
You are a SOC analyst.
Analyze this alert.
Parsed alert:
{state["parsed"]}
Evidence:
{state["evidence"]}
Return:
1. likely cause
2. attack stage
3. confidence
"""
        state["triage"] = llm_invoke(prompt, run_id, "triage_alert_llm")
        tracer.patch_run(run_id, {"triage": state["triage"]})
        return state


def score_risk(state: SOCState, parent_run_id: Optional[str] = None) -> SOCState:
    with tracer.run("score_risk", "chain", {"parsed": state["parsed"]}, parent_run_id) as run_id:
        severity = state["parsed"]["severity"]
        command = state["parsed"]["command"]
        score = 50
        if severity == "high":
            score += 20
        if "-enc" in command or "EncodedCommand" in command:
            score += 15
        if "-w hidden" in command:
            score += 10
        state["risk_score"] = min(score, 100)
        tracer.patch_run(run_id, {"risk_score": state["risk_score"]})
        return state


def generate_summary(state: SOCState, parent_run_id: Optional[str] = None) -> SOCState:
    with tracer.run(
        "generate_summary",
        "chain",
        {
            "parsed": state["parsed"],
            "triage": state["triage"],
            "risk_score": state["risk_score"],
            "evidence": state["evidence"],
        },
        parent_run_id,
    ) as run_id:
        prompt = f"""
Generate an analyst-ready SOC summary.
Alert:
{state["parsed"]}
Triage:
{state["triage"]}
Risk score:
{state["risk_score"]}
Evidence:
{state["evidence"]}
"""
        state["summary"] = llm_invoke(prompt, run_id, "generate_summary_llm")
        tracer.patch_run(run_id, {"summary": state["summary"]})
        return state


def recommend_action(state: SOCState, parent_run_id: Optional[str] = None) -> SOCState:
    with tracer.run(
        "recommend_action", "chain", {"summary": state["summary"]}, parent_run_id
    ) as run_id:
        prompt = f"""
Based on this SOC case, recommend next actions.
Summary:
{state["summary"]}
Return concise actions for a Tier 1 SOC analyst.
"""
        state["recommendation"] = llm_invoke(prompt, run_id, "recommend_action_llm")
        tracer.patch_run(run_id, {"recommendation": state["recommendation"]})
        return state


def invoke_workflow(initial_state: SOCState) -> SOCState:
    alert_id = initial_state["alert"].get("alert_id", "unknown")
    with tracer.run(
        f"neoharbor_soc_workflow_{alert_id}",
        "chain",
        {"alert": initial_state["alert"]},
    ) as root_run_id:
        state = parse_alert(initial_state, root_run_id)
        state = retrieve_evidence(state, root_run_id)
        state = triage_alert(state, root_run_id)
        state = score_risk(state, root_run_id)
        state = generate_summary(state, root_run_id)
        state = recommend_action(state, root_run_id)
        tracer.patch_run(
            root_run_id,
            {
                "summary": state["summary"],
                "recommendation": state["recommendation"],
                "risk_score": state["risk_score"],
            },
        )
        return state


def load_alerts(batch: bool) -> List[dict]:
    path = "data/alerts.json" if batch else "data/alert.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data if isinstance(data, list) else [data]


def build_initial_state(alert: dict) -> SOCState:
    return {
        "alert": alert,
        "parsed": {},
        "evidence": [],
        "triage": "",
        "risk_score": 0,
        "summary": "",
        "recommendation": "",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run NeoHarbor SOC workflow traces.")
    parser.add_argument(
        "--batch",
        action="store_true",
        help="Run data/alerts.json instead of the single data/alert.json sample.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limit the number of alerts processed from the selected input file.",
    )
    args = parser.parse_args()

    alerts = load_alerts(args.batch)
    if args.limit is not None:
        alerts = alerts[: args.limit]

    print(f"Running {len(alerts)} alert workflow(s).")
    for index, alert in enumerate(alerts, start=1):
        result = invoke_workflow(build_initial_state(alert))
        print(
            f"[{index}/{len(alerts)}] {alert.get('alert_id')} "
            f"risk={result['risk_score']} event={alert.get('event')}"
        )
        if len(alerts) == 1:
            print("\n=== SUMMARY ===")
            print(result["summary"])
            print("\n=== RECOMMENDATION ===")
            print(result["recommendation"])
