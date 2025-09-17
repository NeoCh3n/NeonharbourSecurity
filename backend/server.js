require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { randomUUID } = require('crypto');
const pino = require('pino');
const { PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { StartExecutionCommand, DescribeExecutionCommand } = require('@aws-sdk/client-step-functions');
const { eventBridge, stepFunctions, region } = require('./aws/clients');
const {
  upsertInvestigation,
  appendInvestigationTimeline,
  getInvestigation,
  listInvestigations,
  getBaselineMetrics,
} = require('./database');

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME || process.env.ASIA_AGENTIC_SOC_BUS || 'AsiaAgenticSocBus';
const STATE_MACHINE_ARN = process.env.STATE_MACHINE_ARN || process.env.ASIA_AGENTIC_SOC_STATE_MACHINE_ARN;

function ensureConfigured() {
  if (!STATE_MACHINE_ARN) {
    throw new Error('STATE_MACHINE_ARN environment variable is required to start investigations.');
  }
}

app.get('/healthz', (_req, res) => {
  res.json({ status: 'ok', region, timestamp: new Date().toISOString() });
});

app.get('/investigations', async (req, res) => {
  const tenantId = req.query.tenant || 'default';
  try {
    const items = await listInvestigations(tenantId, 50);
    res.json({ items });
  } catch (err) {
    logger.error({ err, tenantId }, 'failed to list investigations');
    res.status(500).json({ message: 'Failed to list investigations' });
  }
});

app.get('/investigations/:id', async (req, res) => {
  const tenantId = req.query.tenant || 'default';
  try {
    const item = await getInvestigation(tenantId, req.params.id);
    if (!item) {
      return res.status(404).json({ message: 'Investigation not found' });
    }
    res.json(item);
  } catch (err) {
    logger.error({ err, tenantId }, 'failed to fetch investigation');
    res.status(500).json({ message: 'Failed to fetch investigation' });
  }
});

app.post('/investigations', async (req, res) => {
  ensureConfigured();
  const tenantId = req.body.tenantId || 'default';
  const alert = req.body.alert;
  if (!alert) {
    return res.status(400).json({ message: 'alert payload is required' });
  }
  const investigationId = req.body.investigationId || randomUUID();
  const receivedAt = new Date().toISOString();

  try {
    await upsertInvestigation({
      tenantId,
      investigationId,
      stage: 'received',
      payload: { alert, receivedAt },
      meta: { status: 'received', createdAt: receivedAt },
    });

    const detail = {
      investigationId,
      tenantId,
      alert,
      receivedAt,
      source: 'api',
    };

    await eventBridge.send(new PutEventsCommand({
      Entries: [
        {
          EventBusName: EVENT_BUS_NAME,
          Source: 'asia.agentic.soc.ingestion',
          DetailType: 'AgenticAlert',
          Detail: JSON.stringify(detail),
        },
      ],
    }));

    res.status(202).json({ investigationId, state: 'queued' });
  } catch (err) {
    logger.error({ err, tenantId, investigationId }, 'failed to enqueue investigation');
    res.status(500).json({ message: 'Failed to enqueue investigation' });
  }
});

app.post('/investigations/:id/step', async (req, res) => {
  ensureConfigured();
  const investigationId = req.params.id;
  const tenantId = req.body.tenantId || 'default';
  const stage = req.body.stage || 'manual';
  try {
    const executionInput = {
      investigationId,
      tenantId,
      manualStage: stage,
      actor: req.body.actor || 'manual-trigger',
    };
    const command = new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      input: JSON.stringify(executionInput),
    });
    const result = await stepFunctions.send(command);
    await appendInvestigationTimeline({
      tenantId,
      investigationId,
      timelineEvent: {
        type: 'manual_trigger',
        stage,
        actor: executionInput.actor,
        triggeredAt: new Date().toISOString(),
        executionArn: result.executionArn,
      },
    });
    res.status(202).json({ executionArn: result.executionArn });
  } catch (err) {
    logger.error({ err, tenantId, investigationId }, 'failed to start manual stage');
    res.status(500).json({ message: 'Failed to start manual stage' });
  }
});

app.get('/executions/:arn', async (req, res) => {
  ensureConfigured();
  try {
    const command = new DescribeExecutionCommand({ executionArn: req.params.arn });
    const result = await stepFunctions.send(command);
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'failed to describe execution');
    res.status(500).json({ message: 'Failed to describe execution' });
  }
});

app.get('/metrics/baseline', async (req, res) => {
  try {
    const baseline = await getBaselineMetrics(req.query.snapshotDate);
    res.json({ baseline });
  } catch (err) {
    logger.error({ err }, 'failed to load baseline metrics');
    res.status(500).json({ message: 'Failed to load metrics' });
  }
});

app.use((err, _req, res, _next) => {
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ message: 'Unhandled error' });
});

const port = process.env.PORT || 4000;

if (require.main === module) {
  app.listen(port, () => {
    logger.info({ port }, 'asia agentic soc backend ready');
  });
}

module.exports = app;
