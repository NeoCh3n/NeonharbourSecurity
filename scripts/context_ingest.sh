#!/usr/bin/env bash
set -euo pipefail

# Split markdown and PDF documents in context/ into 1500-character chunks
# and store them as JSON Lines in out/global_context.jsonl

CONTEXT_DIR="context"
OUT_DIR="out"
OUT_FILE="$OUT_DIR/global_context.jsonl"
CHUNK_SIZE=1500

mkdir -p "$OUT_DIR"

python <<'PY'
import json
import os
from pathlib import Path
import sys

context_dir = Path("context")
out_file = Path("out/global_context.jsonl")
chunk_size = 1500

# Determine if any PDF files exist before importing PyPDF2
pdf_files = list(context_dir.glob("*.pdf"))
if pdf_files:
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        print("PyPDF2 is required to process PDF files.", file=sys.stderr)
        sys.exit(1)
else:
    PdfReader = None

out_file.parent.mkdir(parents=True, exist_ok=True)
with out_file.open("w", encoding="utf-8") as outf:
    for path in sorted(context_dir.glob("*")):
        if path.suffix.lower() == ".md":
            text = path.read_text(encoding="utf-8")
        elif path.suffix.lower() == ".pdf" and PdfReader:
            reader = PdfReader(str(path))
            text = "".join(page.extract_text() or "" for page in reader.pages)
        else:
            continue

        for i in range(0, len(text), chunk_size):
            chunk = text[i:i+chunk_size]
            obj = {"source": path.name, "chunk_index": i // chunk_size, "text": chunk}
            outf.write(json.dumps(obj, ensure_ascii=False) + "\n")
PY
