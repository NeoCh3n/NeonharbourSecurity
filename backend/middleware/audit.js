const { pool } = require('../database');
const crypto = require('crypto');

async function auditLog(action, userId, details = {}, tenantId = null) {
  try {
    if (tenantId) {
      await pool.query(
        'INSERT INTO audit_logs (action, user_id, details, ip_address, tenant_id) VALUES ($1, $2, $3, $4, $5)',
        [action, userId, JSON.stringify(details), details.ipAddress || 'unknown', tenantId]
      );
    } else {
      await pool.query(
        'INSERT INTO audit_logs (action, user_id, details, ip_address) VALUES ($1, $2, $3, $4)',
        [action, userId, JSON.stringify(details), details.ipAddress || 'unknown']
      );
    }
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Enhanced audit logging for investigation actions
 */
async function auditInvestigationAction(investigationId, action, details, userId, tenantId) {
  try {
    const logEntry = {
      investigation_id: investigationId,
      action,
      user_id: userId,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      details: {
        ...details,
        ip_address: details.ipAddress || 'system',
        user_agent: details.userAgent || 'investigation-engine',
        session_id: details.sessionId,
        trace_id: details.traceId || generateTraceId()
      }
    };

    // Calculate integrity checksum
    const checksumData = JSON.stringify(logEntry);
    const checksum = crypto.createHash('sha256').update(checksumData).digest('hex');

    await pool.query(
      `INSERT INTO investigation_audit_logs 
       (investigation_id, action, user_id, tenant_id, timestamp, details, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        investigationId,
        action,
        userId,
        tenantId,
        logEntry.timestamp,
        JSON.stringify(logEntry.details),
        checksum
      ]
    );
  } catch (error) {
    console.error('Failed to write investigation audit log:', error);
  }
}

/**
 * Log API calls for audit trail
 */
async function auditApiCall(investigationId, apiCall, tenantId) {
  try {
    const logEntry = {
      investigation_id: investigationId,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      api_endpoint: apiCall.endpoint,
      method: apiCall.method,
      request_headers: apiCall.requestHeaders || {},
      request_body: apiCall.requestBody || {},
      response_status: apiCall.responseStatus,
      response_headers: apiCall.responseHeaders || {},
      response_body: apiCall.responseBody || {},
      duration_ms: apiCall.durationMs,
      error_message: apiCall.errorMessage,
      data_source: apiCall.dataSource,
      query_type: apiCall.queryType,
      records_returned: apiCall.recordsReturned || 0
    };

    const checksumData = JSON.stringify(logEntry);
    const checksum = crypto.createHash('sha256').update(checksumData).digest('hex');

    await pool.query(
      `INSERT INTO api_call_logs 
       (investigation_id, tenant_id, timestamp, api_endpoint, method, 
        request_headers, request_body, response_status, response_headers, 
        response_body, duration_ms, error_message, data_source, query_type, 
        records_returned, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        investigationId,
        tenantId,
        logEntry.timestamp,
        logEntry.api_endpoint,
        logEntry.method,
        JSON.stringify(logEntry.request_headers),
        JSON.stringify(logEntry.request_body),
        logEntry.response_status,
        JSON.stringify(logEntry.response_headers),
        JSON.stringify(logEntry.response_body),
        logEntry.duration_ms,
        logEntry.error_message,
        logEntry.data_source,
        logEntry.query_type,
        logEntry.records_returned,
        checksum
      ]
    );
  } catch (error) {
    console.error('Failed to log API call:', error);
  }
}

/**
 * Log AI decision-making process
 */
async function auditAiDecision(investigationId, decision, tenantId) {
  try {
    const logEntry = {
      investigation_id: investigationId,
      tenant_id: tenantId,
      timestamp: new Date().toISOString(),
      decision_type: decision.type,
      agent_type: decision.agentType,
      input_data: decision.inputData || {},
      reasoning_process: decision.reasoningProcess || '',
      evidence_considered: decision.evidenceConsidered || [],
      confidence_score: decision.confidenceScore,
      output_data: decision.outputData || {},
      model_version: decision.modelVersion,
      prompt_template: decision.promptTemplate,
      execution_time_ms: decision.executionTimeMs
    };

    const checksumData = JSON.stringify(logEntry);
    const checksum = crypto.createHash('sha256').update(checksumData).digest('hex');

    await pool.query(
      `INSERT INTO ai_decision_logs 
       (investigation_id, tenant_id, timestamp, decision_type, agent_type,
        input_data, reasoning_process, evidence_considered, confidence_score,
        output_data, model_version, prompt_template, execution_time_ms, checksum)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        investigationId,
        tenantId,
        logEntry.timestamp,
        logEntry.decision_type,
        logEntry.agent_type,
        JSON.stringify(logEntry.input_data),
        logEntry.reasoning_process,
        JSON.stringify(logEntry.evidence_considered),
        logEntry.confidence_score,
        JSON.stringify(logEntry.output_data),
        logEntry.model_version,
        logEntry.prompt_template,
        logEntry.execution_time_ms,
        checksum
      ]
    );
  } catch (error) {
    console.error('Failed to log AI decision:', error);
  }
}

function generateTraceId() {
  return crypto.randomBytes(16).toString('hex');
}

function auditMiddleware(action) {
  return async (req, res, next) => {
    const originalJson = res.json;
    
    res.json = function(data) {
      // Log after response is sent
      setTimeout(async () => {
        try {
          await auditLog(action, req.user?.id, {
            endpoint: req.originalUrl,
            method: req.method,
            statusCode: res.statusCode,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent'),
            response: res.statusCode < 400 ? 'success' : 'error'
          });
        } catch (error) {
          console.error('Audit logging error:', error);
        }
      }, 0);
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

module.exports = { 
  auditLog, 
  auditMiddleware, 
  auditInvestigationAction, 
  auditApiCall, 
  auditAiDecision,
  generateTraceId 
};
