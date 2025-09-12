# Learning and Adaptation System

The Learning and Adaptation System is a core component of the AI Investigation Engine that enables continuous improvement through analyst feedback and pattern recognition. It implements Requirements 5.1-5.6 from the AI Investigation Engine specification.

## Overview

The system consists of four main components:

1. **FeedbackProcessor** - Collects and processes analyst feedback
2. **PatternRecognition** - Identifies patterns in investigation outcomes
3. **PerformanceMetrics** - Tracks system performance over time
4. **StrategyAdapter** - Adapts investigation strategies based on learning

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Analyst         │    │ Investigation    │    │ Learning        │
│ Feedback        │───▶│ Feedback         │───▶│ Patterns        │
│                 │    │ Processor        │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │                        │
                                ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Performance     │    │ Strategy         │    │ Pattern         │
│ Metrics         │◀───│ Adapter          │◀───│ Recognition     │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Components

### FeedbackProcessor

Collects and processes different types of analyst feedback:

- **Verdict Corrections**: When analysts correct AI verdicts
- **Investigation Quality**: Feedback on investigation effectiveness
- **Response Effectiveness**: Feedback on recommended actions
- **False Positive Reports**: Identification of false positive patterns
- **Strategy Suggestions**: Analyst recommendations for improvement

```javascript
const { FeedbackProcessor } = require('./learning');

const processor = new FeedbackProcessor();

// Collect verdict correction feedback
await processor.collectFeedback(
  'investigation-123',
  userId,
  'verdict_correction',
  {
    originalVerdict: 'true_positive',
    correctVerdict: 'false_positive',
    reasoning: 'Legitimate admin action',
    confidence: 0.9
  },
  tenantId
);
```

### PatternRecognition

Analyzes feedback to identify patterns and trends:

- Groups similar feedback by context (alert type, severity, etc.)
- Calculates pattern confidence and impact scores
- Identifies trends (improving, declining, stable)
- Generates insights and recommendations

```javascript
const { PatternRecognition } = require('./learning');

const recognition = new PatternRecognition();

// Analyze patterns for a tenant
const patterns = await recognition.analyzePatterns(tenantId, {
  timeWindow: 30, // days
  minOccurrences: 3,
  confidenceThreshold: 0.6
});
```

### PerformanceMetrics

Tracks key performance indicators:

- **Accuracy**: Verdict accuracy rate
- **MTTI**: Mean Time To Investigation
- **MTTR**: Mean Time To Response  
- **False Positive Rate**: Rate of false positive alerts
- **Investigation Quality**: Average quality scores
- **Response Effectiveness**: Average effectiveness scores

```javascript
const { PerformanceMetrics } = require('./learning');

const metrics = new PerformanceMetrics();

// Calculate metrics for date range
const performance = await metrics.calculateMetrics(
  tenantId,
  startDate,
  endDate
);
```

### StrategyAdapter

Adapts investigation strategies based on patterns:

- **Verdict Thresholds**: Adjusts confidence thresholds
- **Investigation Strategies**: Optimizes investigation steps
- **Detection Tuning**: Reduces false positive patterns
- **Response Strategies**: Improves response recommendations
- **Priority Adjustments**: Optimizes alert prioritization

```javascript
const { StrategyAdapter } = require('./learning');

const adapter = new StrategyAdapter();

// Generate and apply adaptations
const result = await adapter.adaptStrategies(tenantId, {
  analysisWindow: 30,
  minPatternConfidence: 0.6,
  dryRun: false
});
```

## Main Learning System

The `LearningSystem` class coordinates all components:

```javascript
const { LearningSystem } = require('./learning');

const learning = new LearningSystem();

// Process feedback and trigger learning
await learning.processFeedback(
  investigationId,
  userId,
  feedbackType,
  content,
  tenantId
);

// Run complete learning pipeline
const result = await learning.runLearningPipeline(tenantId);

// Get learning status
const status = await learning.getLearningStatus(tenantId);
```

## Database Schema

The system uses several database tables:

### investigation_feedback
Stores analyst feedback on investigations.

### learning_patterns
Stores identified patterns from feedback analysis.

### performance_metrics
Stores calculated performance metrics by date.

### strategy_adaptations
Stores history of strategy adaptations.

### tenant_settings
Stores tenant-specific configuration and thresholds.

## Tenant Isolation

All learning data is strictly isolated by tenant:

- Feedback is only processed within tenant boundaries
- Patterns are analyzed per-tenant
- Adaptations are applied per-tenant
- No cross-tenant data sharing

## Integration

### With Investigation Orchestrator

```javascript
const { InvestigationWithLearning } = require('./learning/example-usage');

const investigator = new InvestigationWithLearning();

// Complete investigation with automatic learning
const result = await investigator.completeInvestigation(
  investigationId,
  verdict,
  evidence,
  tenantId
);

// Process analyst feedback
await investigator.processAnalystFeedback(
  investigationId,
  userId,
  'verdict_correction',
  feedbackContent,
  tenantId
);
```

### Scheduled Learning

The system can run scheduled learning for all active tenants:

```javascript
// Run scheduled learning (e.g., daily cron job)
const results = await learning.runScheduledLearning();
```

## API Endpoints

The learning system can be exposed via REST API:

```javascript
// POST /api/investigations/{id}/feedback
app.post('/api/investigations/:id/feedback', async (req, res) => {
  const { feedbackType, content } = req.body;
  const { tenantId, userId } = req.user;
  
  const feedback = await learning.processFeedback(
    req.params.id,
    userId,
    feedbackType,
    content,
    tenantId
  );
  
  res.json(feedback);
});

// GET /api/learning/status
app.get('/api/learning/status', async (req, res) => {
  const { tenantId } = req.user;
  const status = await learning.getLearningStatus(tenantId);
  res.json(status);
});

// GET /api/learning/insights
app.get('/api/learning/insights', async (req, res) => {
  const { tenantId } = req.user;
  const { days = 30 } = req.query;
  
  const insights = await learning.getLearningInsights(tenantId, days);
  res.json(insights);
});
```

## Testing

Comprehensive unit tests are provided in `test/learning-system.test.js`:

```bash
npm test -- --testPathPatterns=learning-system.test.js
```

The tests cover:
- Feedback collection and processing
- Pattern recognition algorithms
- Performance metrics calculation
- Strategy adaptation logic
- Tenant isolation
- Error handling
- Integration scenarios

## Configuration

The system can be configured via environment variables:

```bash
# Learning system settings
LEARNING_ENABLED=true
LEARNING_ANALYSIS_WINDOW=30
LEARNING_MIN_CONFIDENCE=0.6
LEARNING_SCHEDULE="0 2 * * *"  # Daily at 2 AM
```

## Monitoring

Key metrics to monitor:

- Feedback collection rate
- Pattern identification rate
- Adaptation success rate
- Performance improvement trends
- System accuracy over time

## Security Considerations

- All feedback is validated and sanitized
- Tenant isolation is strictly enforced
- Sensitive data is not logged
- Access controls are applied to learning endpoints
- Audit trails are maintained for all adaptations

## Performance Considerations

- Learning pipeline runs asynchronously
- Database queries are optimized with proper indexing
- Large datasets are processed in batches
- Caching is used for frequently accessed patterns
- Resource limits prevent runaway learning processes

## Future Enhancements

- Machine learning model integration
- Advanced pattern recognition algorithms
- Real-time adaptation capabilities
- Cross-tenant anonymized learning (with consent)
- Integration with external threat intelligence