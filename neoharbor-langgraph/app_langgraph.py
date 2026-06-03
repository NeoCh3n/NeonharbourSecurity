import json
import os
from typing import List, TypedDict

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph


load_dotenv()

llm = ChatOpenAI(
    model=os.getenv("OPENAI_MODEL", "gpt-5.5"),
    base_url=os.getenv("OPENAI_BASE_URL"),
    temperature=0,
    timeout=30,
    max_retries=1,
)


class SOCState(TypedDict):
    alert: dict
    parsed: dict
    evidence: List[str]
    triage: str
    risk_score: int
    summary: str
    recommendation: str


def parse_alert(state: SOCState) -> SOCState:
    alert = state["alert"]
    state["parsed"] = {
        "host": alert.get("host"),
        "user": alert.get("user"),
        "command": alert.get("command"),
        "severity": alert.get("severity"),
        "event": alert.get("event"),
    }
    return state


def retrieve_evidence(state: SOCState) -> SOCState:
    state["evidence"] = [
        "PowerShell with -nop often indicates bypassing profile loading.",
        "Hidden window execution is commonly seen in malware or post-exploitation.",
        "EncodedCommand can hide payload content from casual inspection.",
        "Finance endpoint has elevated business impact.",
    ]
    return state


def triage_alert(state: SOCState) -> SOCState:
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
    state["triage"] = llm.invoke(prompt).content
    return state


def score_risk(state: SOCState) -> SOCState:
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
    return state


def generate_summary(state: SOCState) -> SOCState:
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
    state["summary"] = llm.invoke(prompt).content
    return state


def recommend_action(state: SOCState) -> SOCState:
    prompt = f"""
Based on this SOC case, recommend next actions.
Summary:
{state["summary"]}
Return concise actions for a Tier 1 SOC analyst.
"""
    state["recommendation"] = llm.invoke(prompt).content
    return state


graph = StateGraph(SOCState)
graph.add_node("parse_alert", parse_alert)
graph.add_node("retrieve_evidence", retrieve_evidence)
graph.add_node("triage_alert", triage_alert)
graph.add_node("score_risk", score_risk)
graph.add_node("generate_summary", generate_summary)
graph.add_node("recommend_action", recommend_action)

graph.set_entry_point("parse_alert")
graph.add_edge("parse_alert", "retrieve_evidence")
graph.add_edge("retrieve_evidence", "triage_alert")
graph.add_edge("triage_alert", "score_risk")
graph.add_edge("score_risk", "generate_summary")
graph.add_edge("generate_summary", "recommend_action")
graph.add_edge("recommend_action", END)

app = graph.compile()


if __name__ == "__main__":
    with open("data/alert.json", "r", encoding="utf-8") as f:
        alert = json.load(f)

    result = app.invoke(
        {
            "alert": alert,
            "parsed": {},
            "evidence": [],
            "triage": "",
            "risk_score": 0,
            "summary": "",
            "recommendation": "",
        }
    )

    print("\n=== SUMMARY ===")
    print(result["summary"])
    print("\n=== RECOMMENDATION ===")
    print(result["recommendation"])
