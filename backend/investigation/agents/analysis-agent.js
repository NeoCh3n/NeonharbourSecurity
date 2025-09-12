/**
 * Analysis Agent - Analyzes collected evidence to determine investigation conclusions
 * 
 * This agent implements the analysis phase of the investigation workflow, using AI models
 * and threat intelligence to analyze evidence and generate verdicts with confidence scores.
 */

const { BaseAgent } = require('./base-agent');
const { callModel } = require('../../ai');
const { withRetry, classifyError, parallelMap } = require('../../utils/execution');
const axios = require('axios');

class AnalysisAgent extends BaseAgent {
  constructor(name, config = {}) {
    super(name, {
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 60000,
      confidenceThreshold: 0.7,
      threatIntelEnabled: true,
      mitreMapping: true,
      maxIndicators: 10,
      ...config
    });
  }

  /**
   * Validate analysis input
   * @param {Object} input - Input containing evidence and context
   * @returns {Object} Validation result
   */
  validate(input) {
    const errors = [];

    if (!input.evidence) {
      errors.push('Evidence is required for analysis');
    }

    if (!input.alert && !input.investigation) {
      errors.push('Either alert or investigation context is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute evidence analysis
   * @param {Object} context - Investigation context
   * @param {Object} input - Analysis input
   * @returns {Promise<Object>} Analysis result
   */
  async execute(context, input) {
    const startTime = Date.now();
    
    try {
      // Extract evidence and context
      const { evidence, alert, investigation } = input;
      const analysisContext = {
        investigationId: context.investigationId,
        tenantId: context.tenantId,
        alert: alert || investigation?.alert,
        evidence: evidence || [],
        timeline: input.timeline || []
      };

      // Perform core analysis
      const coreAnalysis = await this._performCoreAnalysis(analysisContext);
      
      // Enrich with threat intelligence if enabled
      let threatIntel = null;
      if (this.config.threatIntelEnabled) {
        threatIntel = await this._enrichWithThreatIntel(analysisContext);
      }

      // Generate MITRE ATT&CK mapping if enabled
      let mitreMapping = null;
      if (this.config.mitreMapping) {
        mitreMapping = await this._generateMitreMapping(analysisContext);
      }

      // Generate final verdict
      const verdict = await this._generateVerdict(coreAnalysis, threatIntel, mitreMapping);

      // Calculate confidence score
      const confidence = this._calculateConfidence(coreAnalysis, threatIntel, mitreMapping);

      // Generate reasoning explanation
      const reasoning = await this._generateReasoning(verdict, coreAnalysis, threatIntel, mitreMapping);

      const result = {
        verdict: {
          classification: verdict.classification,
          confidence: confidence,
          riskScore: verdict.riskScore,
          reasoning: reasoning,
          supportingEvidence: this._extractSupportingEvidence(coreAnalysis, threatIntel)
        },
        analysis: {
          core: coreAnalysis,
          threatIntel: threatIntel,
          mitreMapping: mitreMapping,
          indicators: this._extractIndicators(analysisContext),
          timeline: this._enhanceTimeline(analysisContext.timeline, coreAnalysis)
        },
        metadata: {
          analysisTime: Date.now() - startTime,
          agentVersion: '1.0.0',
          confidenceFactors: this._getConfidenceFactors(coreAnalysis, threatIntel, mitreMapping)
        }
      };

      return result;

    } catch (error) {
      console.error(`Analysis Agent ${this.name} execution failed:`, error.message);
      throw error;
    }
  }

  /**
   * Perform core AI-based analysis of the evidence
   * @param {Object} context - Analysis context
   * @returns {Promise<Object>} Core analysis result
   */
  async _performCoreAnalysis(context) {
    try {
      const prompt = this._buildAnalysisPrompt(context);
      
      const aiResponse = await callModel([
        {
          role: 'system',
          content: 'You are an expert security analyst. Analyze the provided evidence and respond with valid JSON containing: summary, severity, patterns, anomalies, and preliminary_verdict. Ensure valid JSON format.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        maxTokens: 2000,
        timeoutMs: this.config.timeoutMs
      });

      return this._parseAnalysisResponse(aiResponse);

    } catch (error) {
      console.error('Core analysis failed:', error.message);
      return {
        summary: `Analysis failed: ${error.message}`,
        severity: 'unknown',
        patterns: [],
        anomalies: [],
        preliminary_verdict: 'requires_review'
      };
    }
  }

  /**
   * Enrich analysis with threat intelligence
   * @param {Object} context - Analysis context
   * @returns {Promise<Object>} Threat intelligence results
   */
  async _enrichWithThreatIntel(context) {
    try {
      const indicators = this._extractIndicators(context);
      const limitedIndicators = indicators.slice(0, this.config.maxIndicators);

      if (limitedIndicators.length === 0) {
        return { indicators: [], results: [] };
      }

      const results = await parallelMap(
        limitedIndicators,
        (indicator) => this._queryThreatIntel(indicator),
        { concurrency: 3 }
      );

      const validResults = results.filter(r => r !== null);
      return {
        indicators: limitedIndicators,
        results: validResults,
        summary: this._summarizeThreatIntel(validResults)
      };

    } catch (error) {
      console.error('Threat intelligence enrichment failed:', error.message);
      return { indicators: [], results: [], summary: 'No threat intelligence available' };
    }
  }

  /**
   * Generate MITRE ATT&CK mapping
   * @param {Object} context - Analysis context
   * @returns {Promise<Object>} MITRE mapping result
   */
  async _generateMitreMapping(context) {
    try {
      const prompt = this._buildMitrePrompt(context);
      
      const aiResponse = await callModel([
        {
          role: 'system',
          content: 'You are a MITRE ATT&CK expert. Map the alert to tactics and techniques. Return only strict JSON with keys: tactics (array of {id,name,confidence}), techniques (array of {id,name,confidence}), confidence (0-1), rationale (string).'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        maxTokens: 1000,
        timeoutMs: this.config.timeoutMs
      });

      return this._parseMitreResponse(aiResponse);

    } catch (error) {
      console.error('MITRE mapping failed:', error.message);
      return {
        tactics: [],
        techniques: [],
        confidence: 0,
        rationale: 'MITRE mapping unavailable'
      };
    }
  }

  /**
   * Generate final verdict based on all analysis components
   * @param {Object} coreAnalysis - Core analysis results
   * @param {Object} threatIntel - Threat intelligence results
   * @param {Object} mitreMapping - MITRE mapping results
   * @returns {Object} Final verdict
   */
  async _generateVerdict(coreAnalysis, threatIntel, mitreMapping) {
    // Determine classification based on multiple factors
    let classification = 'requires_review';
    let riskScore = 0;

    // Factor in core analysis
    if (coreAnalysis.preliminary_verdict === 'true_positive') {
      classification = 'true_positive';
      riskScore += 40;
    } else if (coreAnalysis.preliminary_verdict === 'false_positive') {
      classification = 'false_positive';
      riskScore += 10;
    } else {
      // Default to requires_review for ambiguous cases
      classification = 'requires_review';
      riskScore += 25;
    }

    // Factor in threat intelligence
    if (threatIntel && threatIntel.results) {
      const maliciousCount = threatIntel.results.filter(r => r && r.malicious > 0).length;
      if (maliciousCount > 0) {
        classification = 'true_positive';
        riskScore += maliciousCount * 20;
      }
    }

    // Factor in MITRE mapping confidence
    if (mitreMapping && mitreMapping.confidence > 0.7) {
      riskScore += 20;
    }

    // Factor in severity
    const severityMultiplier = {
      'critical': 1.5,
      'high': 1.3,
      'medium': 1.0,
      'low': 0.7,
      'unknown': 0.8
    };
    riskScore *= (severityMultiplier[coreAnalysis.severity] || 1.0);

    // Cap risk score at 100
    riskScore = Math.min(100, Math.round(riskScore));

    // Adjust classification based on risk score and preliminary verdict
    if (riskScore >= 70 && coreAnalysis.preliminary_verdict !== 'false_positive') {
      classification = 'true_positive';
    } else if (riskScore <= 20 && coreAnalysis.preliminary_verdict === 'false_positive') {
      classification = 'false_positive';
    } else if (coreAnalysis.preliminary_verdict === 'requires_review') {
      classification = 'requires_review';
    }

    return {
      classification,
      riskScore
    };
  }

  /**
   * Calculate overall confidence score
   * @param {Object} coreAnalysis - Core analysis results
   * @param {Object} threatIntel - Threat intelligence results
   * @param {Object} mitreMapping - MITRE mapping results
   * @returns {number} Confidence score (0-1)
   */
  _calculateConfidence(coreAnalysis, threatIntel, mitreMapping) {
    let confidence = 0.5; // Base confidence

    // Reduce confidence for ambiguous cases
    if (coreAnalysis.preliminary_verdict === 'requires_review') {
      confidence = 0.4;
    }

    // Factor in evidence quality
    if (coreAnalysis.patterns && coreAnalysis.patterns.length > 0) {
      confidence += 0.2;
    }

    // Factor in threat intelligence
    if (threatIntel && threatIntel.results && threatIntel.results.length > 0) {
      confidence += 0.2;
    }

    // Factor in MITRE mapping
    if (mitreMapping && mitreMapping.confidence > 0) {
      confidence += mitreMapping.confidence * 0.3;
    }

    // Factor in anomaly detection
    if (coreAnalysis.anomalies && coreAnalysis.anomalies.length > 0) {
      confidence += 0.1;
    }

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Generate human-readable reasoning explanation
   * @param {Object} verdict - Final verdict
   * @param {Object} coreAnalysis - Core analysis results
   * @param {Object} threatIntel - Threat intelligence results
   * @param {Object} mitreMapping - MITRE mapping results
   * @returns {Promise<string>} Reasoning explanation
   */
  async _generateReasoning(verdict, coreAnalysis, threatIntel, mitreMapping) {
    try {
      const reasoningPrompt = this._buildReasoningPrompt(verdict, coreAnalysis, threatIntel, mitreMapping);
      
      const aiResponse = await callModel([
        {
          role: 'system',
          content: 'You are a security analyst explaining your analysis. Provide a clear, concise explanation of why you reached this verdict. Focus on key evidence and reasoning. Keep it under 200 words.'
        },
        {
          role: 'user',
          content: reasoningPrompt
        }
      ], {
        maxTokens: 300,
        timeoutMs: this.config.timeoutMs
      });

      return aiResponse || 'Analysis completed based on available evidence.';

    } catch (error) {
      console.error('Reasoning generation failed:', error.message);
      return `Analysis classified as ${verdict.classification} with risk score ${verdict.riskScore} based on available evidence.`;
    }
  }

  // Helper methods for building prompts and parsing responses

  _buildAnalysisPrompt(context) {
    const parts = [
      'Analyze this security investigation:',
      '',
      'Alert:',
      JSON.stringify(context.alert, null, 2),
      '',
      'Evidence:',
      JSON.stringify(context.evidence, null, 2),
      '',
      'Timeline:',
      JSON.stringify(context.timeline, null, 2)
    ];

    return parts.join('\n');
  }

  _buildMitrePrompt(context) {
    return `Map the following security alert to MITRE ATT&CK tactics and techniques:\n\n${JSON.stringify(context.alert, null, 2)}`;
  }

  _buildReasoningPrompt(verdict, coreAnalysis, threatIntel, mitreMapping) {
    const parts = [
      `Verdict: ${verdict.classification} (Risk Score: ${verdict.riskScore})`,
      '',
      'Core Analysis:',
      JSON.stringify(coreAnalysis, null, 2)
    ];

    if (threatIntel && threatIntel.results.length > 0) {
      parts.push('', 'Threat Intelligence:', JSON.stringify(threatIntel.summary, null, 2));
    }

    if (mitreMapping && mitreMapping.tactics.length > 0) {
      parts.push('', 'MITRE ATT&CK:', JSON.stringify(mitreMapping, null, 2));
    }

    return parts.join('\n');
  }

  _parseAnalysisResponse(aiResponse) {
    try {
      const cleanedResponse = aiResponse.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(cleanedResponse);
      
      return {
        summary: parsed.summary || 'Analysis completed',
        severity: parsed.severity || 'medium',
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
        anomalies: Array.isArray(parsed.anomalies) ? parsed.anomalies : [],
        preliminary_verdict: parsed.preliminary_verdict || 'requires_review'
      };
    } catch (error) {
      console.warn('Failed to parse analysis response:', error.message);
      return {
        summary: 'Analysis completed with limited parsing',
        severity: 'medium',
        patterns: [],
        anomalies: [],
        preliminary_verdict: 'requires_review'
      };
    }
  }

  _parseMitreResponse(aiResponse) {
    try {
      if (!aiResponse) {
        return {
          tactics: [],
          techniques: [],
          confidence: 0,
          rationale: 'No MITRE response received'
        };
      }
      
      const cleanedResponse = aiResponse.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(cleanedResponse);
      
      return {
        tactics: Array.isArray(parsed.tactics) ? parsed.tactics : [],
        techniques: Array.isArray(parsed.techniques) ? parsed.techniques : [],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
        rationale: parsed.rationale || 'MITRE mapping completed'
      };
    } catch (error) {
      console.warn('Failed to parse MITRE response:', error.message);
      return {
        tactics: [],
        techniques: [],
        confidence: 0,
        rationale: 'MITRE mapping failed to parse'
      };
    }
  }

  _extractIndicators(context) {
    const indicators = new Set();
    
    // Extract from alert
    if (context.alert) {
      const alertText = JSON.stringify(context.alert);
      
      // IP addresses
      const ips = alertText.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];
      ips.forEach(ip => indicators.add(ip));
      
      // File hashes
      const hashes = alertText.match(/\b[a-fA-F0-9]{32,64}\b/g) || [];
      hashes.forEach(hash => indicators.add(hash));
      
      // Domains (basic pattern)
      const domains = alertText.match(/\b[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}\b/g) || [];
      domains.forEach(domain => indicators.add(domain));
    }
    
    // Extract from evidence
    if (context.evidence) {
      context.evidence.forEach(evidence => {
        if (evidence.indicators) {
          evidence.indicators.forEach(indicator => indicators.add(indicator));
        }
      });
    }
    
    return Array.from(indicators);
  }

  async _queryThreatIntel(indicator) {
    const apiKey = process.env.VIRUSTOTAL_API_KEY;
    if (!apiKey) {
      return null;
    }
    
    try {
      const isIP = /^\d+\.\d+\.\d+\.\d+$/.test(indicator);
      const url = isIP
        ? `https://www.virustotal.com/api/v3/ip_addresses/${indicator}`
        : `https://www.virustotal.com/api/v3/files/${indicator}`;
      
      const response = await withRetry(async () => {
        const resp = await axios.get(url, {
          headers: { 'x-apikey': apiKey },
          timeout: 10000
        });
        return resp.data;
      }, {
        retries: 2,
        base: 300,
        factor: 2,
        shouldRetry: (err, info) => ['timeout', 'network', 'rate_limit', 'server_error'].includes(info.class)
      });

      const stats = response.data?.attributes?.last_analysis_stats || {};
      return {
        indicator,
        malicious: stats.malicious || 0,
        suspicious: stats.suspicious || 0,
        clean: stats.harmless || 0,
        undetected: stats.undetected || 0,
        data: response.data
      };

    } catch (error) {
      console.warn(`Threat intel query failed for ${indicator}:`, error.message);
      return null;
    }
  }

  _summarizeThreatIntel(results) {
    const validResults = results.filter(r => r !== null);
    if (validResults.length === 0) {
      return 'No threat intelligence available';
    }

    const maliciousCount = validResults.filter(r => r.malicious > 0).length;
    const suspiciousCount = validResults.filter(r => r.suspicious > 0).length;
    
    if (maliciousCount > 0) {
      return `${maliciousCount} indicators flagged as malicious by threat intelligence`;
    } else if (suspiciousCount > 0) {
      return `${suspiciousCount} indicators flagged as suspicious by threat intelligence`;
    } else {
      return 'No malicious indicators found in threat intelligence';
    }
  }

  _extractSupportingEvidence(coreAnalysis, threatIntel) {
    const evidence = [];
    
    if (coreAnalysis.patterns && coreAnalysis.patterns.length > 0) {
      evidence.push(`Detected patterns: ${coreAnalysis.patterns.join(', ')}`);
    }
    
    if (coreAnalysis.anomalies && coreAnalysis.anomalies.length > 0) {
      evidence.push(`Anomalies found: ${coreAnalysis.anomalies.join(', ')}`);
    }
    
    if (threatIntel && threatIntel.summary) {
      evidence.push(threatIntel.summary);
    }
    
    return evidence;
  }

  _enhanceTimeline(timeline, coreAnalysis) {
    const enhanced = [...(timeline || [])];
    
    enhanced.push({
      step: 'Evidence analysis',
      time: new Date().toISOString(),
      action: 'AI analysis completed',
      evidence: coreAnalysis.summary
    });
    
    return enhanced;
  }

  _getConfidenceFactors(coreAnalysis, threatIntel, mitreMapping) {
    return {
      evidenceQuality: coreAnalysis.patterns ? coreAnalysis.patterns.length : 0,
      threatIntelCoverage: threatIntel ? threatIntel.results.length : 0,
      mitreConfidence: mitreMapping ? mitreMapping.confidence : 0,
      anomalyCount: coreAnalysis.anomalies ? coreAnalysis.anomalies.length : 0
    };
  }
}

module.exports = { AnalysisAgent };