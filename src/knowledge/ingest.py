"""RAG ingestion pipeline for HK-local SOPs and playbooks."""
from __future__ import annotations

import argparse
import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable, List

from ..ai import AnalystLLM, BedrockAnalyst


@dataclass
class KnowledgeChunk:
    doc_id: str
    chunk_id: str
    content: str
    tags: List[str]
    source_path: str


def load_markdown_chunks(paths: Iterable[Path], max_chars: int = 1500) -> List[KnowledgeChunk]:
    chunks: List[KnowledgeChunk] = []
    for path in paths:
        text = path.read_text(encoding="utf-8")
        tags = infer_tags(path)
        base_id = path.stem.replace(" ", "_")
        offset = 0
        chunk_index = 0
        while offset < len(text):
            chunk_text = text[offset : offset + max_chars]
            chunk = KnowledgeChunk(
                doc_id=base_id,
                chunk_id=f"{base_id}-{chunk_index}",
                content=chunk_text,
                tags=tags,
                source_path=str(path),
            )
            chunks.append(chunk)
            offset += max_chars
            chunk_index += 1
    return chunks


def infer_tags(path: Path) -> List[str]:
    tags = [path.parent.name]
    name = path.stem.lower()
    if "hkma" in name:
        tags.append("HKMA")
    if "tm" in name:
        tags.append("TM-G-1")
    if "sa" in name:
        tags.append("SA-2")
    if "ransomware" in name:
        tags.append("ransomware")
    if "phish" in name:
        tags.append("phishing")
    if "privileged" in name:
        tags.append("privileged_access")
    return tags


def embed_chunks(chunks: List[KnowledgeChunk], analyst: AnalystLLM) -> List[dict]:
    embeddings = analyst.embed_texts((chunk.content for chunk in chunks))
    records: List[dict] = []
    for chunk, vector in zip(chunks, embeddings):
        records.append({
            **asdict(chunk),
            "embedding": vector,
        })
    return records


def ingest(output_path: Path, analyst: AnalystLLM | None = None) -> Path:
    analyst = analyst or BedrockAnalyst()
    knowledge_dir = Path("knowledge")
    playbook_dir = Path("playbooks")
    paths = list(knowledge_dir.glob("*.md")) + list(playbook_dir.glob("*.md"))
    chunks = load_markdown_chunks(paths)
    records = embed_chunks(chunks, analyst)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build the local RAG knowledge store")
    parser.add_argument("--output", default=os.getenv("KNOWLEDGE_STORE", "out/knowledge_store.json"))
    args = parser.parse_args()
    path = Path(args.output)
    ingest(path)
    print(f"Knowledge store written to {path}")


if __name__ == "__main__":
    main()
