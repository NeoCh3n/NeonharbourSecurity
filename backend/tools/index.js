// Stub tool implementations for remediation actions and notifications.
// Replace with real integrations (e.g., MS Defender, CrowdStrike, Okta, O365, Slack, ServiceNow).

async function disableAccount({ userId }) {
  // TODO: integrate with IdP (e.g., Entra ID / Okta). Here we simulate.
  if (!userId) throw new Error('Missing userId');
  return { status: 'disabled', userId };
}

async function isolateEndpoint({ hostId }) {
  if (!hostId) throw new Error('Missing hostId');
  return { status: 'isolated', hostId };
}

async function emailRecall({ messageId }) {
  if (!messageId) throw new Error('Missing messageId');
  return { status: 'recalled', messageId };
}

async function notifySlack({ channel, text }) {
  if (!channel || !text) throw new Error('Missing channel/text');
  return { delivered: true, channel };
}

async function createTicket({ system = 'servicenow', title, description }) {
  if (!title) throw new Error('Missing title');
  return { system, ticketId: `TKT-${Math.random().toString(36).slice(2, 8)}`, title, description };
}

const REGISTRY = {
  disable_account: disableAccount,
  isolate_endpoint: isolateEndpoint,
  email_recall: emailRecall,
  notify_slack: notifySlack,
  create_ticket: createTicket,
};

function getTool(name) {
  return REGISTRY[name];
}

module.exports = { getTool };

