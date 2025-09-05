// Default policies focused on guardrails for remediation actions.
// effect: allow | deny | require_approval

const DEFAULT_POLICIES = [
  {
    name: 'Low-risk operations allowed',
    description: 'Allow low-risk operations like notify/comment without approval',
    effect: 'allow',
    action_pattern: 'notify_*',
    resource_pattern: '*',
    conditions: { max_severity: 'high' },
    risk: 'low',
  },
  {
    name: 'Create ticket allowed',
    description: 'Allow creating a ticket in ITSM',
    effect: 'allow',
    action_pattern: 'create_ticket',
    resource_pattern: '*',
    conditions: {},
    risk: 'low',
  },
  {
    name: 'High-risk remediation requires approval',
    description: 'Endpoint isolation, account disable, email recall require human approval',
    effect: 'require_approval',
    action_pattern: 'isolate_*', // e.g., isolate_endpoint
    resource_pattern: '*',
    conditions: {},
    risk: 'high',
  },
  {
    name: 'Disable account requires approval',
    description: 'Disabling accounts requires an approver',
    effect: 'require_approval',
    action_pattern: 'disable_account',
    resource_pattern: 'user:*',
    conditions: {},
    risk: 'high',
  },
  {
    name: 'Email recall requires approval',
    description: 'Email message recall requires human-in-the-loop',
    effect: 'require_approval',
    action_pattern: 'email_recall',
    resource_pattern: 'message:*',
    conditions: {},
    risk: 'medium',
  },
  {
    name: 'Privileged principals stricter control',
    description: 'If principal is privileged, require approval even for medium risk',
    effect: 'require_approval',
    action_pattern: '*',
    resource_pattern: '*',
    conditions: { principal_privileged: true },
    risk: 'high',
  },
];

module.exports = { DEFAULT_POLICIES };

