# Response Agent Usage Guide

The Response Agent generates actionable response recommendations based on investigation findings. It implements the response phase of the investigation workflow.

## Basic Usage

```javascript
const { agentRegistry } = require('./investigation/agents');

// Create a Response Agent instance
const responseAgent = agentRegistry.createAgent('response', 'response-agent-1');

// Prepare input data
const input = {
  verdict: {
    classification: 'true_positive',
    confidence: 0.85,
    riskScore: 75,
    reasoning: 'Malicious activity detected with high confidence'
  },
  alert: {
    id: 'alert-123',
    src: { ip: '192.168.1.100' },
    principal: { user: 'john.doe' },
    asset: { host: 'workstation-01' },
    severity: 'high'
  },
  evidence: [
    {
      type: 'network',
      source: 'firewall',
      data: { blocked_connections: 5 }
    }
  ],
  policies: [] // Organizational policies (optional)
};

// Investigation context
const context = {
  investigationId: 'inv-123',
  tenantId: 'tenant-1',
  businessContext: {
    businessHours: '9-17',
    criticalSystems: ['email', 'database']
  }
};

// Execute the Response Agent
const result = await responseAgent.execute(context, input);
```

## Response Structure

The Response Agent returns a comprehensive response object:

```javascript
{
  recommendations: [
    {
      id: 'block_source_ip',
      action: 'block_ip',
      description: 'Block source IP 192.168.1.100',
      priority: 'high',
      risk: 'low',
      rationale: 'Prevent further attacks from identified source',
      affectedSystems: ['firewall', 'network'],
      estimatedImpact: 'Low - blocks single IP address',
      verificationSteps: ['Verify IP is blocked in firewall', 'Monitor for continued activity'],
      requiresApproval: false,
      autoExecutable: true,
      rollbackProcedure: {
        steps: ['Remove IP from block list', 'Verify IP connectivity restored'],
        requirements: ['Firewall admin access'],
        risks: ['May allow malicious traffic if threat still active']
      },
      rollbackRisk: 'low',
      rollbackDuration: '3-8 minutes'
    }
  ],
  impactAnalysis: {
    affectedSystems: ['firewall', 'network'],
    affectedUsers: [],
    dataFlowImpacts: [],
    totalBusinessImpact: 'low',
    estimatedDowntime: '0 minutes',
    recoveryTime: '0 minutes'
  },
  executionPlan: {
    immediate: {
      actions: [/* auto-executable actions */],
      estimatedDuration: '5 minutes'
    },
    pendingApproval: {
      actions: [/* actions requiring approval */],
      estimatedDuration: '15 minutes'
    },
    sequence: ['block_ip', 'reset_password'],
    parallelizable: [
      {
        group: 'network_actions',
        actions: ['block_ip', 'block_domain']
      }
    ]
  },
  approvalRequests: [
    {
      action: 'isolate_endpoint',
      description: 'Isolate compromised endpoint',
      rationale: 'Prevent lateral movement',
      risk: 'high',
      priority: 'critical',
      approvalLevel: 'security_manager',
      estimatedImpact: 'High - system offline',
      rollbackProcedure: { /* rollback details */ },
      parameters: {
        investigationId: 'inv-123',
        alertId: 'alert-123',
        affectedSystems: ['endpoint', 'network'],
        verificationSteps: ['Check isolation status']
      }
    }
  ],
  metadata: {
    responseTime: 1250,
    agentVersion: '1.0.0',
    totalRecommendations: 3,
    autoExecutableCount: 1,
    approvalRequiredCount: 2
  }
}
```

## Configuration Options

The Response Agent can be configured with various options:

```javascript
const responseAgent = agentRegistry.createAgent('response', 'response-agent-1', {
  maxRecommendations: 10,        // Maximum number of recommendations
  autoExecuteThreshold: 0.8,     // Confidence threshold for auto-execution
  requireApprovalThreshold: 0.5, // Confidence threshold requiring approval
  maxRetries: 3,                 // Maximum retry attempts
  timeoutMs: 45000              // Execution timeout
});
```

## Supported Actions

The Response Agent can recommend various types of actions:

### Network Actions
- `block_ip` - Block IP addresses
- `block_domain` - Block domains
- `network_segmentation` - Implement network segmentation

### Account Actions
- `disable_account` - Disable user accounts
- `reset_password` - Force password reset
- `revoke_certificates` - Revoke user certificates

### Endpoint Actions
- `isolate_endpoint` - Isolate compromised endpoints
- `quarantine_file` - Quarantine malicious files
- `shutdown_system` - Emergency system shutdown

### Email Actions
- `email_recall` - Recall phishing emails

## Approval Requirements

Actions are categorized by risk level and approval requirements:

- **Low Risk**: Can be auto-executed with high confidence
  - `block_ip`, `block_domain`, `quarantine_file`
  
- **Medium Risk**: Requires team lead approval
  - `disable_account`, `reset_password`
  
- **High Risk**: Requires security manager approval
  - `isolate_endpoint`, `revoke_certificates`
  
- **Critical Risk**: Requires senior management approval
  - `shutdown_system`, `network_segmentation`

## Integration with Approval System

The Response Agent generates approval requests that integrate with the existing approval workflow:

```javascript
// The approval requests can be inserted into the approval_requests table
for (const request of result.approvalRequests) {
  await pool.query(`
    INSERT INTO approval_requests (
      user_id, alert_id, action, parameters, status, trace_id, tenant_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    userId,
    request.parameters.alertId,
    request.action,
    JSON.stringify(request.parameters),
    'pending',
    context.investigationId,
    context.tenantId
  ]);
}
```

## Error Handling

The Response Agent includes comprehensive error handling:

```javascript
try {
  const result = await responseAgent.execute(context, input);
  // Handle successful response
} catch (error) {
  console.error('Response Agent failed:', error.message);
  // The agent will fall back to rule-based recommendations
  // Check result.recommendations for fallback actions
}
```

## Threat Scenario Examples

### Malware Infection
```javascript
const malwareInput = {
  verdict: { classification: 'true_positive', confidence: 0.9, riskScore: 85 },
  alert: { category: 'malware', asset: { host: 'workstation-01' } }
};
// Generates: isolate_endpoint, quarantine_file recommendations
```

### Credential Compromise
```javascript
const credInput = {
  verdict: { classification: 'true_positive', confidence: 0.8, riskScore: 70 },
  alert: { category: 'authentication', principal: { user: 'admin.user' } }
};
// Generates: reset_password, disable_account recommendations
```

### Network Intrusion
```javascript
const networkInput = {
  verdict: { classification: 'true_positive', confidence: 0.95, riskScore: 90 },
  alert: { category: 'network', src: { ip: '203.0.113.1' } }
};
// Generates: block_ip, network_segmentation recommendations
```

### Phishing Email
```javascript
const phishingInput = {
  verdict: { classification: 'true_positive', confidence: 0.85, riskScore: 65 },
  alert: { 
    category: 'email', 
    entities: [
      { type: 'url', value: 'http://evil.example.com' },
      { type: 'email', value: 'victim@company.com' }
    ]
  }
};
// Generates: email_recall, block_domain recommendations
```