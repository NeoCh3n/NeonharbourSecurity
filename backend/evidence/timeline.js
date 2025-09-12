/**
 * Evidence Timeline Generator
 * 
 * Creates timeline visualizations and chronological analysis of evidence
 * to help investigators understand the sequence of events.
 */

class EvidenceTimeline {
  constructor(database) {
    this.db = database;
  }

  /**
   * Generate timeline visualization data for an investigation
   */
  async generate(investigationId, options = {}) {
    const client = await this.db.connect();
    
    try {
      // Get all evidence for the investigation
      const evidence = await this._getTimelineEvidence(client, investigationId, options);
      
      if (evidence.length === 0) {
        return {
          timeline: [],
          summary: {
            totalEvents: 0,
            timespan: null,
            phases: []
          },
          visualization: {
            events: [],
            phases: [],
            correlations: []
          }
        };
      }

      // Sort evidence chronologically
      const sortedEvidence = evidence.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      // Generate timeline events
      const timelineEvents = this._generateTimelineEvents(sortedEvidence);
      
      // Identify investigation phases
      const phases = this._identifyInvestigationPhases(sortedEvidence);
      
      // Generate visualization data
      const visualization = this._generateVisualizationData(sortedEvidence, phases, options);
      
      // Create summary statistics
      const summary = this._generateTimelineSummary(sortedEvidence, phases);
      
      return {
        timeline: timelineEvents,
        summary,
        visualization,
        metadata: {
          generatedAt: new Date().toISOString(),
          evidenceCount: sortedEvidence.length,
          options
        }
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get evidence with timeline-specific filtering
   */
  async _getTimelineEvidence(client, investigationId, options) {
    let query = `
      SELECT e.*, 
             array_agg(DISTINCT et.tag) FILTER (WHERE et.tag IS NOT NULL) as tags,
             ec.correlation_type,
             ec.strength as correlation_strength
      FROM investigation_evidence e
      LEFT JOIN evidence_tags et ON e.id = et.evidence_id
      LEFT JOIN evidence_correlations ec ON e.id = ANY(ec.evidence_ids)
      WHERE e.investigation_id = $1
        AND e.tenant_id = COALESCE(NULLIF(current_setting('app.tenant_id', true), '')::int, 1)
    `;
    
    const params = [investigationId];
    let paramIndex = 2;

    // Apply time range filter
    if (options.timeRange) {
      if (options.timeRange.start) {
        query += ` AND e.timestamp >= $${paramIndex}`;
        params.push(options.timeRange.start);
        paramIndex++;
      }
      if (options.timeRange.end) {
        query += ` AND e.timestamp <= $${paramIndex}`;
        params.push(options.timeRange.end);
        paramIndex++;
      }
    }

    // Apply evidence type filter
    if (options.types && options.types.length > 0) {
      query += ` AND e.type = ANY($${paramIndex})`;
      params.push(options.types);
      paramIndex++;
    }

    // Apply source filter
    if (options.sources && options.sources.length > 0) {
      query += ` AND e.source = ANY($${paramIndex})`;
      params.push(options.sources);
      paramIndex++;
    }

    // Apply minimum confidence filter
    if (options.minConfidence) {
      query += ` AND e.confidence >= $${paramIndex}`;
      params.push(options.minConfidence);
      paramIndex++;
    }

    query += ` GROUP BY e.id, ec.correlation_type, ec.strength ORDER BY e.timestamp`;

    const result = await client.query(query, params);
    return result.rows;
  }

  /**
   * Generate timeline events with enhanced metadata
   */
  _generateTimelineEvents(evidence) {
    return evidence.map((ev, index) => {
      const timestamp = new Date(ev.timestamp);
      
      return {
        id: ev.id,
        timestamp: timestamp.toISOString(),
        title: this._generateEventTitle(ev),
        description: this._generateEventDescription(ev),
        type: ev.type,
        source: ev.source,
        confidence: ev.confidence,
        qualityScore: ev.quality_score,
        entities: ev.entities || {},
        tags: ev.tags || [],
        correlationStrength: ev.correlation_strength || 0,
        data: ev.data,
        metadata: {
          ...ev.metadata,
          sequenceNumber: index + 1,
          relativeTime: index === 0 ? 0 : timestamp - new Date(evidence[0].timestamp)
        },
        visualization: {
          color: this._getEventColor(ev),
          icon: this._getEventIcon(ev),
          size: this._getEventSize(ev),
          priority: this._getEventPriority(ev)
        }
      };
    });
  }

  /**
   * Identify distinct phases in the investigation timeline
   */
  _identifyInvestigationPhases(evidence) {
    if (evidence.length === 0) return [];

    const phases = [];
    let currentPhase = null;
    const phaseThreshold = 30 * 60 * 1000; // 30 minutes gap to start new phase

    for (let i = 0; i < evidence.length; i++) {
      const ev = evidence[i];
      const timestamp = new Date(ev.timestamp);
      
      // Start new phase if this is the first event or there's a significant time gap
      if (!currentPhase || (timestamp - new Date(currentPhase.endTime) > phaseThreshold)) {
        if (currentPhase) {
          phases.push(currentPhase);
        }
        
        currentPhase = {
          id: `phase_${phases.length + 1}`,
          startTime: timestamp.toISOString(),
          endTime: timestamp.toISOString(),
          events: [ev.id],
          types: new Set([ev.type]),
          sources: new Set([ev.source]),
          entities: new Set(),
          description: '',
          characteristics: []
        };
      } else {
        // Add to current phase
        currentPhase.endTime = timestamp.toISOString();
        currentPhase.events.push(ev.id);
        currentPhase.types.add(ev.type);
        currentPhase.sources.add(ev.source);
      }

      // Collect entities for this phase
      if (ev.entities) {
        Object.values(ev.entities).forEach(entityList => {
          if (Array.isArray(entityList)) {
            entityList.forEach(entity => currentPhase.entities.add(entity));
          }
        });
      }
    }

    // Add the last phase
    if (currentPhase) {
      phases.push(currentPhase);
    }

    // Enhance phases with descriptions and characteristics
    return phases.map(phase => ({
      ...phase,
      types: Array.from(phase.types),
      sources: Array.from(phase.sources),
      entities: Array.from(phase.entities),
      duration: new Date(phase.endTime) - new Date(phase.startTime),
      eventCount: phase.events.length,
      description: this._generatePhaseDescription(phase),
      characteristics: this._identifyPhaseCharacteristics(phase, evidence)
    }));
  }

  /**
   * Generate visualization data for timeline rendering
   */
  _generateVisualizationData(evidence, phases, options) {
    const events = evidence.map(ev => ({
      id: ev.id,
      x: new Date(ev.timestamp).getTime(),
      y: this._getEventTrack(ev),
      title: this._generateEventTitle(ev),
      type: ev.type,
      source: ev.source,
      confidence: ev.confidence,
      color: this._getEventColor(ev),
      size: this._getEventSize(ev),
      shape: this._getEventShape(ev)
    }));

    const phaseBlocks = phases.map(phase => ({
      id: phase.id,
      startX: new Date(phase.startTime).getTime(),
      endX: new Date(phase.endTime).getTime(),
      y: 0,
      height: this._getMaxTrack() + 1,
      color: this._getPhaseColor(phase),
      opacity: 0.1,
      label: phase.description
    }));

    // Generate correlation lines
    const correlations = this._generateCorrelationLines(evidence);

    return {
      events,
      phases: phaseBlocks,
      correlations,
      axes: {
        x: {
          type: 'time',
          min: Math.min(...events.map(e => e.x)),
          max: Math.max(...events.map(e => e.x)),
          label: 'Time'
        },
        y: {
          type: 'categorical',
          categories: this._getTrackLabels(),
          label: 'Evidence Type'
        }
      },
      legend: this._generateLegend(evidence)
    };
  }

  /**
   * Generate timeline summary statistics
   */
  _generateTimelineSummary(evidence, phases) {
    if (evidence.length === 0) {
      return {
        totalEvents: 0,
        timespan: null,
        phases: []
      };
    }

    const startTime = new Date(evidence[0].timestamp);
    const endTime = new Date(evidence[evidence.length - 1].timestamp);
    const duration = endTime - startTime;

    // Calculate event distribution
    const typeDistribution = {};
    const sourceDistribution = {};
    const hourlyDistribution = new Array(24).fill(0);

    evidence.forEach(ev => {
      // Type distribution
      typeDistribution[ev.type] = (typeDistribution[ev.type] || 0) + 1;
      
      // Source distribution
      sourceDistribution[ev.source] = (sourceDistribution[ev.source] || 0) + 1;
      
      // Hourly distribution
      const hour = new Date(ev.timestamp).getHours();
      hourlyDistribution[hour]++;
    });

    // Identify peak activity periods
    const peakHours = hourlyDistribution
      .map((count, hour) => ({ hour, count }))
      .filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      totalEvents: evidence.length,
      timespan: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        duration: duration,
        durationHuman: this._formatDuration(duration)
      },
      phases: phases.map(phase => ({
        id: phase.id,
        description: phase.description,
        eventCount: phase.eventCount,
        duration: phase.duration,
        durationHuman: this._formatDuration(phase.duration),
        characteristics: phase.characteristics
      })),
      distribution: {
        byType: typeDistribution,
        bySource: sourceDistribution,
        byHour: hourlyDistribution,
        peakHours: peakHours
      },
      statistics: {
        averageConfidence: evidence.reduce((sum, ev) => sum + ev.confidence, 0) / evidence.length,
        averageQuality: evidence.reduce((sum, ev) => sum + ev.quality_score, 0) / evidence.length,
        uniqueSources: Object.keys(sourceDistribution).length,
        uniqueTypes: Object.keys(typeDistribution).length
      }
    };
  }

  /**
   * Generate event title for display
   */
  _generateEventTitle(evidence) {
    const type = evidence.type || 'Unknown';
    const source = evidence.source || 'Unknown';
    
    // Try to extract meaningful information from data
    const data = evidence.data || {};
    
    if (data.action) {
      return `${type}: ${data.action}`;
    } else if (data.event_type) {
      return `${type}: ${data.event_type}`;
    } else if (data.command) {
      return `${type}: ${data.command.substring(0, 50)}...`;
    } else if (data.filename) {
      return `${type}: ${data.filename}`;
    } else if (data.destination) {
      return `${type}: → ${data.destination}`;
    } else {
      return `${type} (${source})`;
    }
  }

  /**
   * Generate event description
   */
  _generateEventDescription(evidence) {
    const parts = [];
    
    parts.push(`Source: ${evidence.source}`);
    parts.push(`Confidence: ${(evidence.confidence * 100).toFixed(1)}%`);
    
    if (evidence.entities) {
      const entityCounts = Object.entries(evidence.entities)
        .filter(([_, entities]) => Array.isArray(entities) && entities.length > 0)
        .map(([type, entities]) => `${entities.length} ${type}`);
      
      if (entityCounts.length > 0) {
        parts.push(`Entities: ${entityCounts.join(', ')}`);
      }
    }
    
    return parts.join(' | ');
  }

  /**
   * Get event color based on type and confidence
   */
  _getEventColor(evidence) {
    const typeColors = {
      'network': '#3498db',
      'process': '#e74c3c',
      'file': '#f39c12',
      'authentication': '#9b59b6',
      'alert': '#e67e22',
      'log': '#95a5a6',
      'threat_intel': '#c0392b',
      'indicator': '#d35400'
    };
    
    let baseColor = typeColors[evidence.type] || '#7f8c8d';
    
    // Adjust opacity based on confidence
    const opacity = Math.max(0.3, evidence.confidence);
    
    return `${baseColor}${Math.round(opacity * 255).toString(16).padStart(2, '0')}`;
  }

  /**
   * Get event icon based on type
   */
  _getEventIcon(evidence) {
    const typeIcons = {
      'network': 'network',
      'process': 'cpu',
      'file': 'file',
      'authentication': 'key',
      'alert': 'warning',
      'log': 'list',
      'threat_intel': 'shield',
      'indicator': 'flag'
    };
    
    return typeIcons[evidence.type] || 'circle';
  }

  /**
   * Get event size based on quality and confidence
   */
  _getEventSize(evidence) {
    const baseSize = 8;
    const qualityMultiplier = evidence.quality_score || 0.5;
    const confidenceMultiplier = evidence.confidence || 0.5;
    
    return baseSize + (qualityMultiplier * confidenceMultiplier * 12);
  }

  /**
   * Get event priority for layering
   */
  _getEventPriority(evidence) {
    // Higher confidence and quality events should be rendered on top
    return (evidence.confidence || 0.5) * (evidence.quality_score || 0.5);
  }

  /**
   * Get event track (Y position) based on type
   */
  _getEventTrack(evidence) {
    const trackMap = {
      'network': 0,
      'process': 1,
      'file': 2,
      'authentication': 3,
      'alert': 4,
      'log': 5,
      'threat_intel': 6,
      'indicator': 7
    };
    
    return trackMap[evidence.type] || 8;
  }

  /**
   * Get maximum track number
   */
  _getMaxTrack() {
    return 8;
  }

  /**
   * Get track labels for Y axis
   */
  _getTrackLabels() {
    return [
      'Network',
      'Process',
      'File',
      'Authentication',
      'Alert',
      'Log',
      'Threat Intel',
      'Indicator',
      'Other'
    ];
  }

  /**
   * Get event shape based on source
   */
  _getEventShape(evidence) {
    const sourceShapes = {
      'siem': 'circle',
      'edr': 'square',
      'firewall': 'triangle',
      'ids': 'diamond',
      'threat_intel': 'star'
    };
    
    return sourceShapes[evidence.source] || 'circle';
  }

  /**
   * Generate phase description
   */
  _generatePhaseDescription(phase) {
    const duration = this._formatDuration(phase.duration);
    const eventCount = phase.eventCount;
    const primaryType = phase.types[0];
    
    if (eventCount === 1) {
      return `Single ${primaryType} event`;
    } else if (phase.types.length === 1) {
      return `${eventCount} ${primaryType} events over ${duration}`;
    } else {
      return `${eventCount} mixed events over ${duration}`;
    }
  }

  /**
   * Identify phase characteristics
   */
  _identifyPhaseCharacteristics(phase, allEvidence) {
    const characteristics = [];
    
    // High activity phase
    if (phase.eventCount >= 10) {
      characteristics.push('High Activity');
    }
    
    // Multi-source phase
    if (phase.sources.length >= 3) {
      characteristics.push('Multi-Source');
    }
    
    // Diverse event types
    if (phase.types.length >= 4) {
      characteristics.push('Diverse Events');
    }
    
    // Short duration, many events (burst)
    if (phase.duration < 5 * 60 * 1000 && phase.eventCount >= 5) {
      characteristics.push('Burst Activity');
    }
    
    // Long duration (extended activity)
    if (phase.duration > 60 * 60 * 1000) {
      characteristics.push('Extended Activity');
    }
    
    return characteristics;
  }

  /**
   * Get phase color based on characteristics
   */
  _getPhaseColor(phase) {
    if (phase.characteristics.includes('High Activity')) {
      return '#e74c3c';
    } else if (phase.characteristics.includes('Burst Activity')) {
      return '#f39c12';
    } else if (phase.characteristics.includes('Extended Activity')) {
      return '#3498db';
    } else {
      return '#95a5a6';
    }
  }

  /**
   * Generate correlation lines for visualization
   */
  _generateCorrelationLines(evidence) {
    const lines = [];
    
    // This would typically query the correlations table
    // For now, we'll generate simple temporal correlations
    for (let i = 0; i < evidence.length - 1; i++) {
      const ev1 = evidence[i];
      const ev2 = evidence[i + 1];
      
      const timeDiff = new Date(ev2.timestamp) - new Date(ev1.timestamp);
      
      // Draw correlation line if events are close in time
      if (timeDiff < 5 * 60 * 1000) { // 5 minutes
        lines.push({
          id: `corr_${ev1.id}_${ev2.id}`,
          source: {
            x: new Date(ev1.timestamp).getTime(),
            y: this._getEventTrack(ev1)
          },
          target: {
            x: new Date(ev2.timestamp).getTime(),
            y: this._getEventTrack(ev2)
          },
          strength: Math.max(0.1, 1 - timeDiff / (5 * 60 * 1000)),
          type: 'temporal'
        });
      }
    }
    
    return lines;
  }

  /**
   * Generate legend for visualization
   */
  _generateLegend(evidence) {
    const types = [...new Set(evidence.map(ev => ev.type))];
    const sources = [...new Set(evidence.map(ev => ev.source))];
    
    return {
      types: types.map(type => ({
        label: type,
        color: this._getEventColor({ type, confidence: 1 }),
        icon: this._getEventIcon({ type })
      })),
      sources: sources.map(source => ({
        label: source,
        shape: this._getEventShape({ source })
      })),
      confidence: [
        { label: 'High Confidence (80-100%)', opacity: 1.0 },
        { label: 'Medium Confidence (50-80%)', opacity: 0.7 },
        { label: 'Low Confidence (0-50%)', opacity: 0.4 }
      ]
    };
  }

  /**
   * Format duration in human-readable format
   */
  _formatDuration(milliseconds) {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    }
    
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) {
      return `${seconds}s`;
    }
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (hours < 24) {
      return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
    }
    
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
}

module.exports = EvidenceTimeline;