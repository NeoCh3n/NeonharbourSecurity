require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { randomUUID } = require('crypto');
const pino = require('pino');
const { PutEventsCommand } = require('@aws-sdk/client-eventbridge');
const { StartExecutionCommand, DescribeExecutionCommand } = require('@aws-sdk/client-sfn');
const { eventBridge, stepFunctions, region } = require('./aws/clients');
const {
  upsertInvestigation,
  appendInvestigationTimeline,
  getInvestigation,
  listInvestigations,
  getBaselineMetrics,
} = require('./database');
const {
  authenticateToken,
  requirePermission,
  requireRole,
  optionalAuth,
  USER_ROLES,
  PERMISSIONS
} = require('./middleware/auth');

// Import Clerk client for user management
let clerkClient;
try {
  const clerk = require('@clerk/clerk-sdk-node');
  clerkClient = clerk.clerkClient;
} catch (error) {
  console.warn('Clerk SDK not available for user management endpoints');
}

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

// User profile endpoint
app.get('/auth/profile', authenticateToken, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      permissions: req.user.permissions,
      isDemo: req.user.isDemo
    }
  });
});

// Protected investigations endpoints
app.get('/investigations', authenticateToken, requirePermission(PERMISSIONS.VIEW_INVESTIGATIONS), async (req, res) => {
  const tenantId = req.query.tenant || 'default';
  try {
    const items = await listInvestigations(tenantId, 50);
    res.json({ items });
  } catch (err) {
    logger.error({ err, tenantId }, 'failed to list investigations');
    res.status(500).json({ message: 'Failed to list investigations' });
  }
});

app.get('/investigations/:id', authenticateToken, requirePermission(PERMISSIONS.VIEW_INVESTIGATIONS), async (req, res) => {
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

app.post('/investigations', authenticateToken, requirePermission(PERMISSIONS.CREATE_INVESTIGATIONS), async (req, res) => {
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

app.post('/investigations/:id/step', authenticateToken, requirePermission(PERMISSIONS.MODIFY_INVESTIGATIONS), async (req, res) => {
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

app.get('/executions/:arn', authenticateToken, requirePermission(PERMISSIONS.VIEW_INVESTIGATIONS), async (req, res) => {
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

app.get('/metrics/baseline', authenticateToken, requirePermission(PERMISSIONS.VIEW_DEMO_METRICS), async (req, res) => {
  try {
    const baseline = await getBaselineMetrics(req.query.snapshotDate);
    res.json({ baseline });
  } catch (err) {
    logger.error({ err }, 'failed to load baseline metrics');
    res.status(500).json({ message: 'Failed to load metrics' });
  }
});

// Admin user management endpoints
app.get('/admin/users', authenticateToken, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    if (!clerkClient) {
      // Return mock users for demo
      const mockUsers = [
        {
          id: 'demo-user',
          email: 'demo@neoharbour.com',
          firstName: 'Demo',
          lastName: 'User',
          role: USER_ROLES.DEMO_USER,
          createdAt: new Date().toISOString(),
          lastSignInAt: new Date().toISOString(),
          banned: false
        },
        {
          id: 'admin-user',
          email: 'admin@neoharbour.com',
          firstName: 'Admin',
          lastName: 'User',
          role: USER_ROLES.ADMIN,
          createdAt: new Date().toISOString(),
          lastSignInAt: new Date().toISOString(),
          banned: false
        }
      ];
      
      return res.json({ 
        users: mockUsers,
        totalCount: mockUsers.length 
      });
    }

    const users = await clerkClient.users.getUserList({
      limit: req.query.limit || 50,
      offset: req.query.offset || 0
    });
    
    const formattedUsers = users.data.map(user => ({
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.publicMetadata?.role || USER_ROLES.VIEWER,
      createdAt: user.createdAt,
      lastSignInAt: user.lastSignInAt,
      banned: user.banned
    }));
    
    res.json({ 
      users: formattedUsers,
      totalCount: users.totalCount 
    });
  } catch (err) {
    logger.error({ err }, 'failed to list users');
    res.status(500).json({ message: 'Failed to list users' });
  }
});

app.patch('/admin/users/:userId/role', authenticateToken, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    const { role } = req.body;
    
    if (!Object.values(USER_ROLES).includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    if (!clerkClient) {
      // Mock success for demo
      return res.json({ success: true, role });
    }
    
    await clerkClient.users.updateUserMetadata(req.params.userId, {
      publicMetadata: { role }
    });
    
    res.json({ success: true, role });
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, 'failed to update user role');
    res.status(500).json({ message: 'Failed to update user role' });
  }
});

app.patch('/admin/users/:userId/ban', authenticateToken, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    if (!clerkClient) {
      // Mock success for demo
      return res.json({ success: true, banned: true });
    }
    
    await clerkClient.users.banUser(req.params.userId);
    
    res.json({ success: true, banned: true });
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, 'failed to ban user');
    res.status(500).json({ message: 'Failed to ban user' });
  }
});

app.patch('/admin/users/:userId/unban', authenticateToken, requirePermission(PERMISSIONS.MANAGE_USERS), async (req, res) => {
  try {
    if (!clerkClient) {
      // Mock success for demo
      return res.json({ success: true, banned: false });
    }
    
    await clerkClient.users.unbanUser(req.params.userId);
    
    res.json({ success: true, banned: false });
  } catch (err) {
    logger.error({ err, userId: req.params.userId }, 'failed to unban user');
    res.status(500).json({ message: 'Failed to unban user' });
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
