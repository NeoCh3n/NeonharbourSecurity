PYTHON ?= python3
PIP ?= pip3
SAM ?= sam
STREAMLIT ?= streamlit

.DEFAULT_GOAL := help

help:
	@echo "Available targets: bootstrap deploy demo teardown fmt test lint compliance"
	@echo "Additional: api metrics-demo"

bootstrap:
	$(PIP) install -r requirements.txt
	$(PYTHON) src/knowledge/ingest.py --output out/knowledge_store.json

deploy:
	$(SAM) build
	$(SAM) deploy --guided

teardown:
	$(SAM) delete --no-prompts

demo:
	$(PYTHON) tools/seed/trigger_pipeline.py || true
	$(PYTHON) tools/metrics/recompute.py
	$(STREAMLIT) run ui/app.py

fmt:
	$(PYTHON) -m black src tests ui/app.py

lint:
	$(PYTHON) -m ruff check src tests ui/app.py

test:
	$(PYTHON) -m pytest tests

compliance:
	$(PYTHON) -m src.compliance.generate_pack --output out

api:
	$(PYTHON) -m src.api.server --host 0.0.0.0 --port 4000

metrics-demo:
	$(PYTHON) tools/metrics/demo_metrics_collection.py
