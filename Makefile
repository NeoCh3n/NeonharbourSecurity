PYTHON ?= python3
PIP ?= pip3
SAM ?= sam
STREAMLIT ?= $(PYTHON) -m streamlit

.DEFAULT_GOAL := help

help:
	@echo "Available targets: bootstrap deploy demo teardown fmt test lint compliance"
	@echo "Additional: api metrics-demo health diagnostics health-export"
	@echo "Deployment: deploy-dev deploy-staging deploy-prod rollback status validate-config"

bootstrap:
	$(PIP) install -r requirements.txt
	$(PYTHON) -m src.knowledge.ingest --output out/knowledge_store.json

deploy:
	$(SAM) build
	$(SAM) deploy --guided

teardown:
	$(SAM) delete --no-prompts

demo:
	$(PYTHON) tools/seed/trigger_pipeline.py || true
	$(PYTHON) tools/metrics/recompute.py
	@if $(PYTHON) -c "import streamlit" >/dev/null 2>&1; then \
		$(STREAMLIT) run ui/app.py; \
	else \
		echo "Streamlit not installed. Run 'make bootstrap' to install demo dependencies."; \
	fi

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

health:
	@echo "Running system health check..."
	$(PYTHON) tools/health_check.py health

diagnostics:
	@echo "Running system diagnostics..."
	$(PYTHON) tools/health_check.py diagnostics

health-export:
	@echo "Running health check and exporting results..."
	$(PYTHON) tools/health_check.py both --export health_report_$(shell date +%Y%m%d_%H%M%S)

# Deployment automation targets
deploy-dev:
	@echo "Deploying to development environment..."
	./scripts/deploy.sh dev

deploy-staging:
	@echo "Deploying to staging environment..."
	./scripts/deploy.sh staging

deploy-prod:
	@echo "Deploying to production environment..."
	./scripts/deploy.sh prod

rollback:
	@echo "Usage: make rollback ENV=<env> TARGET=<version>"
	@echo "Example: make rollback ENV=staging TARGET=v1.2.3"
	@if [ -n "$(ENV)" ] && [ -n "$(TARGET)" ]; then \
		./scripts/rollback.sh $(ENV) --target $(TARGET); \
	fi

status:
	@echo "Checking deployment status..."
	$(PYTHON) scripts/deployment/status.py

validate-config:
	@echo "Usage: make validate-config ENV=<env>"
	@echo "Example: make validate-config ENV=dev"
	@if [ -n "$(ENV)" ]; then \
		$(PYTHON) scripts/deployment/validate_config.py $(ENV); \
	fi
