/**
 * Evidence Management System
 * 
 * This module provides comprehensive evidence management capabilities for the AI Investigation Engine.
 * It handles evidence storage, correlation, quality scoring, timeline generation, and search functionality.
 */

const EvidenceStore = require('./store');
const EvidenceCorrelator = require('./correlator');
const EvidenceScorer = require('./scorer');
const EvidenceTimeline = require('./timeline');
const EvidenceSearch = require('./search');

class EvidenceManager {
  constructor(database) {
    this.db = database;
    this.store = new EvidenceStore(database);
    this.correlator = new EvidenceCorrelator(database);
    this.scorer = new EvidenceScorer();
    this.timeline = new EvidenceTimeline(database);
    this.search = new EvidenceSearch(database);
  }

  /**
   * Store evidence with automatic quality scoring and correlation
   */
  async storeEvidence(investigationId, evidence, options = {}) {
    // Score evidence quality
    const qualityScore = await this.scorer.scoreEvidence(evidence);
    
    // Store evidence with quality score
    const storedEvidence = await this.store.store(investigationId, {
      ...evidence,
      qualityScore,
      confidence: evidence.confidence || qualityScore.overall
    }, options);

    // Trigger correlation analysis if enabled
    if (options.correlate !== false) {
      await this.correlator.analyzeCorrelations(investigationId, storedEvidence.id);
    }

    return storedEvidence;
  }

  /**
   * Retrieve evidence with optional filtering and correlation data
   */
  async getEvidence(investigationId, filters = {}) {
    return await this.store.getEvidence(investigationId, filters);
  }

  /**
   * Get evidence correlations for an investigation
   */
  async getCorrelations(investigationId, options = {}) {
    return await this.correlator.getCorrelations(investigationId, options);
  }

  /**
   * Generate timeline visualization data
   */
  async generateTimeline(investigationId, options = {}) {
    return await this.timeline.generate(investigationId, options);
  }

  /**
   * Search evidence across investigations
   */
  async searchEvidence(tenantId, query, options = {}) {
    return await this.search.search(tenantId, query, options);
  }

  /**
   * Get evidence statistics for an investigation
   */
  async getEvidenceStats(investigationId) {
    return await this.store.getStats(investigationId);
  }

  /**
   * Update evidence quality scores based on feedback
   */
  async updateEvidenceQuality(evidenceId, feedback) {
    return await this.scorer.updateFromFeedback(evidenceId, feedback);
  }
}

module.exports = {
  EvidenceManager,
  EvidenceStore,
  EvidenceCorrelator,
  EvidenceScorer,
  EvidenceTimeline,
  EvidenceSearch
};