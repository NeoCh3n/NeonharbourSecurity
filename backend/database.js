const { PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient } = require('./aws/clients');

const investigationsTable = process.env.DDB_INVESTIGATIONS_TABLE || 'AsiaAgenticSocInvestigations-dev';
const metricsTable = process.env.DDB_METRICS_TABLE || 'AsiaAgenticSocMetrics-dev';

function buildInvestigationPk(tenantId) {
  return `TENANT#${tenantId || 'default'}`;
}

function buildInvestigationSk(investigationId) {
  return `INVESTIGATION#${investigationId}`;
}

async function upsertInvestigation({ tenantId = 'default', investigationId, stage, payload, meta = {} }) {
  if (!investigationId) {
    throw new Error('investigationId is required');
  }
  const now = new Date().toISOString();
  const item = {
    pk: buildInvestigationPk(tenantId),
    sk: buildInvestigationSk(investigationId),
    investigationId,
    tenantId,
    stage,
    payload,
    updatedAt: now,
    createdAt: meta.createdAt || now,
    status: meta.status || 'in_progress',
    severity: meta.severity,
    riskLevel: meta.riskLevel,
    metricsSnapshot: meta.metricsSnapshot,
  };
  await docClient.send(new PutCommand({
    TableName: investigationsTable,
    Item: item,
  }));
  return item;
}

async function appendInvestigationTimeline({ tenantId = 'default', investigationId, timelineEvent }) {
  if (!investigationId || !timelineEvent) {
    throw new Error('investigationId and timelineEvent are required');
  }
  const now = new Date().toISOString();
  await docClient.send(new UpdateCommand({
    TableName: investigationsTable,
    Key: {
      pk: buildInvestigationPk(tenantId),
      sk: buildInvestigationSk(investigationId),
    },
    UpdateExpression: 'SET timeline = list_append(if_not_exists(timeline, :emptyList), :entry), updatedAt = :now',
    ExpressionAttributeValues: {
      ':emptyList': [],
      ':entry': [timelineEvent],
      ':now': now,
    },
  }));
}

async function getInvestigation(tenantId = 'default', investigationId) {
  if (!investigationId) {
    throw new Error('investigationId is required');
  }
  const result = await docClient.send(new GetCommand({
    TableName: investigationsTable,
    Key: {
      pk: buildInvestigationPk(tenantId),
      sk: buildInvestigationSk(investigationId),
    },
  }));
  return result.Item || null;
}

async function listInvestigations(tenantId = 'default', limit = 20) {
  const result = await docClient.send(new QueryCommand({
    TableName: investigationsTable,
    KeyConditionExpression: 'pk = :pkPrefix',
    ExpressionAttributeValues: {
      ':pkPrefix': buildInvestigationPk(tenantId),
    },
    Limit: limit,
    ScanIndexForward: false,
  }));
  return result.Items || [];
}

async function upsertMetric({ metricDate, metricName, value, metadata }) {
  if (!metricDate || !metricName) {
    throw new Error('metricDate and metricName are required');
  }
  await docClient.send(new PutCommand({
    TableName: metricsTable,
    Item: {
      metric_date: metricDate,
      metric_name: metricName,
      value,
      metadata,
      updatedAt: new Date().toISOString(),
    },
  }));
}

async function getMetric(metricDate, metricName) {
  const resp = await docClient.send(new GetCommand({
    TableName: metricsTable,
    Key: {
      metric_date: metricDate,
      metric_name: metricName,
    },
  }));
  return resp.Item || null;
}

async function getBaselineMetrics(snapshotDate) {
  const date = snapshotDate || 'baseline';
  const names = ['MTTA', 'MTTI', 'MTTR', 'FPR'];
  const results = await Promise.all(names.map((metricName) => getMetric(date, metricName)));
  return names.reduce((acc, name, idx) => {
    acc[name] = results[idx]?.value ?? null;
    return acc;
  }, {});
}

module.exports = {
  upsertInvestigation,
  appendInvestigationTimeline,
  getInvestigation,
  listInvestigations,
  upsertMetric,
  getMetric,
  getBaselineMetrics,
  tables: {
    investigationsTable,
    metricsTable,
  },
};

// NOTE: DynamoDB and S3 resources are encrypted end-to-end using the KMS CMK declared in infra/sam-template.yaml.
// IAM policies are scoped per function via SAM (e.g., DynamoDBCrudPolicy on specific tables, S3WritePolicy on audit bucket)
// to satisfy HKMA least-privilege requirements.
