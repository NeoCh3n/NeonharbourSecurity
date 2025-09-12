/**
 * Connector API Endpoints
 * 
 * REST API endpoints for connector management, configuration, and testing
 */

const express = require('express');
const { ConnectorValidator } = require('./connector-validator');
const { connectorFramework } = require('./index');

const router = express.Router();

/**
 * Get all connectors for a tenant
 * GET /api/connectors
 */
router.get('/', async (req, res) => {
  try {
    const { tenantId } = req.query;
    
    if (!tenantId) {
      return res.status(400).json({
        error: 'tenantId query parameter is required'
      });
    }
    
    const registry = connectorFramework.getRegistry();
    const connectors = registry.getConnectorsByTenant(tenantId);
    
    const connectorList = connectors.map(connector => ({
      id: connector.id,
      name: connector.name,
      type: connector.type,
      status: connector.status,
      lastHealthCheck: connector.lastHealthCheck,
      capabilities: connector.getCapabilities(),
      dataTypes: connector.getDataTypes(),
      metrics: connector.metrics
    }));
    
    res.json({
      connectors: connectorList,
      totalCount: connectorList.length
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve connectors',
      details: error.message
    });
  }
});

/**
 * Get specific connector details
 * GET /api/connectors/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const registry = connectorFramework.getRegistry();
    const connector = registry.getConnector(id);
    
    if (!connector) {
      return res.status(404).json({
        error: `Connector ${id} not found`
      });
    }
    
    const status = connector.getStatus();
    
    res.json({
      connector: {
        ...status,
        capabilities: connector.getCapabilities(),
        dataTypes: connector.getDataTypes()
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to retrieve connector details',
      details: error.message
    });
  }
});

/**
 * Create a new connector
 * POST /api/connectors
 */
router.post('/', async (req, res) => {
  try {
    const config = req.body;
    
    // Validate configuration
    const validation = ConnectorValidator.validateConfig(config);
    
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid connector configuration',
        validationErrors: validation.errors,
        warnings: validation.warnings
      });
    }
    
    // Create the connector
    const connector = await connectorFramework.createConnector(config);
    
    res.status(201).json({
      message: 'Connector created successfully',
      connector: {
        id: connector.id,
        name: connector.name,
        type: connector.type,
        status: connector.status
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create connector',
      details: error.message
    });
  }
});

/**
 * Update connector configuration
 * PUT /api/connectors/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const newConfig = req.body;
    
    // Validate new configuration
    const validation = ConnectorValidator.validateConfig({ ...newConfig, id });
    
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid connector configuration',
        validationErrors: validation.errors,
        warnings: validation.warnings
      });
    }
    
    const registry = connectorFramework.getRegistry();
    const updatedConnector = await registry.updateConnector(id, newConfig);
    
    res.json({
      message: 'Connector updated successfully',
      connector: {
        id: updatedConnector.id,
        name: updatedConnector.name,
        type: updatedConnector.type,
        status: updatedConnector.status
      }
    });
    
  } catch (error) {
    if (error.message.includes('not found')) {
      res.status(404).json({
        error: `Connector ${req.params.id} not found`
      });
    } else {
      res.status(500).json({
        error: 'Failed to update connector',
        details: error.message
      });
    }
  }
});

/**
 * Delete a connector
 * DELETE /api/connectors/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const registry = connectorFramework.getRegistry();
    
    const removed = await registry.removeConnector(id);
    
    if (!removed) {
      return res.status(404).json({
        error: `Connector ${id} not found`
      });
    }
    
    res.json({
      message: 'Connector deleted successfully'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to delete connector',
      details: error.message
    });
  }
});

/**
 * Test connector configuration
 * POST /api/connectors/test
 */
router.post('/test', async (req, res) => {
  try {
    const config = req.body;
    
    const testResults = await ConnectorValidator.testConfig(config);
    
    const statusCode = testResults.overallResult === 'passed' ? 200 : 
                      testResults.overallResult === 'partial' ? 206 : 400;
    
    res.status(statusCode).json({
      testResults,
      message: `Configuration test ${testResults.overallResult}`
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to test connector configuration',
      details: error.message
    });
  }
});

/**
 * Validate connector configuration
 * POST /api/connectors/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const config = req.body;
    
    const validation = ConnectorValidator.validateConfig(config);
    
    const statusCode = validation.valid ? 200 : 400;
    
    res.status(statusCode).json({
      validation,
      message: validation.valid ? 'Configuration is valid' : 'Configuration has errors'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to validate connector configuration',
      details: error.message
    });
  }
});

/**
 * Perform health check on specific connector
 * POST /api/connectors/:id/health
 */
router.post('/:id/health', async (req, res) => {
  try {
    const { id } = req.params;
    const registry = connectorFramework.getRegistry();
    const connector = registry.getConnector(id);
    
    if (!connector) {
      return res.status(404).json({
        error: `Connector ${id} not found`
      });
    }
    
    const healthResult = await connector.performHealthCheck();
    
    const statusCode = healthResult.healthy ? 200 : 503;
    
    res.status(statusCode).json({
      health: healthResult,
      message: healthResult.healthy ? 'Connector is healthy' : 'Connector health check failed'
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to perform health check',
      details: error.message
    });
  }
});

/**
 * Perform health check on all connectors
 * POST /api/connectors/health/all
 */
router.post('/health/all', async (req, res) => {
  try {
    const { tenantId } = req.query;
    const registry = connectorFramework.getRegistry();
    
    let healthResults;
    if (tenantId) {
      // Health check for specific tenant
      const connectors = registry.getConnectorsByTenant(tenantId);
      healthResults = {};
      
      for (const connector of connectors) {
        try {
          healthResults[connector.id] = await connector.performHealthCheck();
        } catch (error) {
          healthResults[connector.id] = {
            healthy: false,
            error: error.message,
            timestamp: new Date().toISOString()
          };
        }
      }
    } else {
      // Health check for all connectors
      healthResults = await registry.performHealthChecks();
    }
    
    const healthySummary = Object.values(healthResults).filter(result => result.healthy).length;
    const totalConnectors = Object.keys(healthResults).length;
    
    res.json({
      healthResults,
      summary: {
        total: totalConnectors,
        healthy: healthySummary,
        unhealthy: totalConnectors - healthySummary,
        healthPercentage: totalConnectors > 0 ? (healthySummary / totalConnectors) * 100 : 0
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to perform health checks',
      details: error.message
    });
  }
});

/**
 * Query a connector
 * POST /api/connectors/:id/query
 */
router.post('/:id/query', async (req, res) => {
  try {
    const { id } = req.params;
    const { query, queryType = 'search' } = req.body;
    
    const registry = connectorFramework.getRegistry();
    const connector = registry.getConnector(id);
    
    if (!connector) {
      return res.status(404).json({
        error: `Connector ${id} not found`
      });
    }
    
    if (connector.status !== 'active') {
      return res.status(503).json({
        error: `Connector ${id} is not active (status: ${connector.status})`
      });
    }
    
    const startTime = Date.now();
    const result = await connector.query(query, queryType);
    const executionTime = Date.now() - startTime;
    
    res.json({
      result,
      metadata: {
        connectorId: id,
        queryType,
        executionTime,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Query execution failed',
      details: error.message,
      connectorId: req.params.id
    });
  }
});

/**
 * Query multiple connectors
 * POST /api/connectors/query/multiple
 */
router.post('/query/multiple', async (req, res) => {
  try {
    const { connectorIds, query, queryType = 'search' } = req.body;
    
    if (!Array.isArray(connectorIds) || connectorIds.length === 0) {
      return res.status(400).json({
        error: 'connectorIds must be a non-empty array'
      });
    }
    
    const registry = connectorFramework.getRegistry();
    const startTime = Date.now();
    
    const results = await registry.queryMultiple(connectorIds, query, queryType);
    const executionTime = Date.now() - startTime;
    
    // Separate successful and failed results
    const successful = {};
    const failed = {};
    
    for (const [connectorId, result] of Object.entries(results)) {
      if (result.error) {
        failed[connectorId] = result;
      } else {
        successful[connectorId] = result;
      }
    }
    
    res.json({
      results: {
        successful,
        failed
      },
      summary: {
        totalConnectors: connectorIds.length,
        successfulQueries: Object.keys(successful).length,
        failedQueries: Object.keys(failed).length,
        executionTime
      },
      metadata: {
        queryType,
        timestamp: new Date().toISOString()
      }
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Multiple query execution failed',
      details: error.message
    });
  }
});

/**
 * Get connector registry status
 * GET /api/connectors/registry/status
 */
router.get('/registry/status', async (req, res) => {
  try {
    const registry = connectorFramework.getRegistry();
    const status = registry.getStatus();
    
    res.json({
      registryStatus: status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get registry status',
      details: error.message
    });
  }
});

/**
 * Reset circuit breakers
 * POST /api/connectors/circuit-breakers/reset
 */
router.post('/circuit-breakers/reset', async (req, res) => {
  try {
    const { tenantId, connectorId } = req.body;
    const registry = connectorFramework.getRegistry();
    
    if (connectorId) {
      // Reset specific connector
      const connector = registry.getConnector(connectorId);
      if (!connector) {
        return res.status(404).json({
          error: `Connector ${connectorId} not found`
        });
      }
      
      connector.resetCircuitBreaker();
      
      res.json({
        message: `Circuit breaker reset for connector ${connectorId}`
      });
    } else {
      // Reset all circuit breakers for tenant or all
      registry.resetCircuitBreakers(tenantId);
      
      res.json({
        message: tenantId ? 
          `Circuit breakers reset for tenant ${tenantId}` : 
          'All circuit breakers reset'
      });
    }
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to reset circuit breakers',
      details: error.message
    });
  }
});

module.exports = router;