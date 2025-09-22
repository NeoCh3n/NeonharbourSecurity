# Requirements Document

## Introduction

The Interactive Demo System is a comprehensive demonstration feature for NeoHarbour Security that showcases the platform's ability to automatically investigate, process, and close more than 80% of false positive alerts while escalating only suspicious cases to human judgment. The system allows judges and stakeholders to experience the full multi-agent investigation pipeline in real-time, demonstrating how AI-powered analysis reduces SOC workload and improves efficiency. The system provides both automated demo data generation and seamless integration with the existing multi-agent architecture, ensuring all demonstrations use real AWS services and Amazon Bedrock analysis.

## Requirements

### Requirement 1

**User Story:** As a product demonstrator, I want a one-click demo mode that continuously generates varied security alerts, so that I can showcase the platform's capabilities to judges without manual intervention.

#### Acceptance Criteria

1. WHEN the demo mode is activated THEN the system SHALL continuously generate diverse security alert types at configurable intervals
2. WHEN generating demo alerts THEN the system SHALL use LLM-powered content generation to ensure realistic and varied scenarios
3. WHEN demo mode is running THEN the system SHALL provide real-time visual feedback showing alert generation status
4. WHEN the stop button is clicked THEN the system SHALL immediately cease demo data generation
5. IF demo mode runs for extended periods THEN the system SHALL rotate through different attack scenarios to maintain variety

### Requirement 2

**User Story:** As a SOC analyst, I want the demo system to showcase automated false positive detection and closure, so that judges can see how the platform achieves 80%+ automation rates and reduces manual investigation workload.

#### Acceptance Criteria

1. WHEN demo alerts are generated THEN the system SHALL include a realistic mix of false positives (80%) and genuine threats (20%) to demonstrate automation capabilities
2. WHEN processing false positive alerts THEN the multi-agent system SHALL automatically classify, investigate, and close them without human intervention
3. WHEN encountering suspicious or high-risk alerts THEN the system SHALL escalate to human judgment with detailed analysis and recommendations
4. WHEN investigations complete THEN the system SHALL clearly indicate whether alerts were auto-closed or escalated, with confidence scores and reasoning
5. IF demonstration focuses on efficiency metrics THEN the system SHALL display real-time statistics showing automation rates and time savings

### Requirement 3

**User Story:** As a system administrator, I want both demo and live modes to use real AWS services and AI analysis, so that demonstrations accurately represent production capabilities and performance.

#### Acceptance Criteria

1. WHEN processing any alert type THEN the system SHALL store data in actual DynamoDB tables and S3 buckets
2. WHEN performing AI analysis THEN the system SHALL use Amazon Bedrock with Claude 3 Haiku and Titan embeddings
3. WHEN generating compliance reports THEN the system SHALL create real artifacts with S3 Object Lock and KMS encryption
4. WHEN demonstrating the system THEN EventBridge, Step Functions, and Lambda services SHALL process all workflows
5. IF AWS credentials are missing or invalid THEN the system SHALL provide clear configuration guidance

### Requirement 4

**User Story:** As a user accessing the system, I want secure authentication through Clerk and a professional AWS-style interface, so that I can access appropriate features based on my role and permissions.

#### Acceptance Criteria

1. WHEN accessing the application THEN the system SHALL authenticate users through Clerk's login service with secure session management
2. WHEN users log in successfully THEN the system SHALL display a cloud-native interface using AWS Cloudscape Design System components
3. WHEN different user roles access the system THEN the interface SHALL adapt to show appropriate features (analyst workbench vs admin controls)
4. WHEN using the interface THEN all components SHALL support both dark and light themes consistent with AWS Console styling
5. IF users lack proper permissions THEN the system SHALL gracefully restrict access to unauthorized features

### Requirement 5

**User Story:** As a product demonstrator, I want to control demo scenarios and pacing during presentations, so that I can tailor demonstrations to specific audiences and time constraints.

#### Acceptance Criteria

1. WHEN starting demo mode THEN the system SHALL allow selection of specific attack scenario types (phishing, ransomware, insider threat, etc.)
2. WHEN configuring demo parameters THEN the system SHALL accept custom alert generation intervals and investigation complexity levels
3. WHEN presenting to different audiences THEN the system SHALL provide preset demo configurations (technical deep-dive, executive overview, compliance focus)
4. WHEN pausing demo mode THEN the system SHALL complete in-flight investigations before stopping
5. IF demonstrations require specific compliance scenarios THEN the system SHALL generate HKMA SA-2 and TM-G-1 relevant alerts

### Requirement 6

**User Story:** As a judge or evaluator, I want to see real-time investigation progress and results, so that I can understand the system's analytical capabilities and decision-making process.

#### Acceptance Criteria

1. WHEN investigations are running THEN the system SHALL display live progress through each pipeline stage
2. WHEN agents are analyzing alerts THEN the system SHALL show which agent is active and their current task
3. WHEN AI analysis completes THEN the system SHALL display confidence scores, risk assessments, and reasoning
4. WHEN investigations conclude THEN the system SHALL present final reports, compliance mappings, and recommended actions
5. IF multiple investigations run simultaneously THEN the system SHALL provide clear visual separation and status tracking
### 
Requirement 7

**User Story:** As a SOC manager, I want to see efficiency metrics and automation statistics during demonstrations, so that I can understand the platform's impact on operational workload and resource allocation.

#### Acceptance Criteria

1. WHEN demo mode is active THEN the system SHALL display real-time metrics showing total alerts processed, auto-closed rate, and escalation rate
2. WHEN investigations complete THEN the system SHALL calculate and display time savings compared to manual investigation processes
3. WHEN presenting to management THEN the system SHALL show ROI metrics including analyst hours saved and mean time to resolution improvements
4. WHEN demonstrating over extended periods THEN the system SHALL maintain running totals and trend analysis of automation effectiveness
5. IF specific efficiency targets are set THEN the system SHALL highlight when 80%+ automation rates are achieved and maintained###
 Requirement 8

**User Story:** As a system administrator, I want a comprehensive admin interface to manage the platform and user permissions, so that I can control system access and monitor overall platform health.

#### Acceptance Criteria

1. WHEN accessing the admin interface THEN the system SHALL provide a Cloudscape-based dashboard with system overview, user management, and configuration panels
2. WHEN managing users THEN the admin SHALL be able to view, create, modify, and deactivate user accounts with role-based permissions
3. WHEN configuring the system THEN the admin SHALL access AWS service settings, demo parameters, and investigation pipeline configurations
4. WHEN monitoring system health THEN the admin SHALL view real-time metrics, error logs, and performance statistics through Cloudscape Table and Chart components
5. IF system issues occur THEN the admin interface SHALL provide diagnostic tools and remediation guidance with clear error messaging

### Requirement 9

**User Story:** As a system administrator, I want smooth AWS configuration management through the admin interface, so that I can quickly set up and maintain AWS integrations without technical barriers.

#### Acceptance Criteria

1. WHEN configuring AWS services THEN the admin interface SHALL provide guided setup wizards using Cloudscape Form components
2. WHEN AWS credentials are invalid THEN the system SHALL display specific error messages and remediation steps through Cloudscape Alert components
3. WHEN testing AWS connections THEN the admin SHALL be able to validate all required services (DynamoDB, S3, Bedrock, Step Functions) with real-time status indicators
4. WHEN switching AWS environments THEN the system SHALL provide environment management tools with clear configuration validation
5. IF AWS permissions are insufficient THEN the system SHALL generate specific IAM policy requirements and installation instructions### Requi
rement 10

**User Story:** As a customer deploying NeoHarbour Security, I want to configure the system to ingest from my actual AWS security data sources, so that the platform can analyze real alerts and findings from my production environment.

#### Acceptance Criteria

1. WHEN configuring data sources THEN the system SHALL allow customers to connect their AWS CloudTrail logs for account operation audit analysis
2. WHEN setting up network monitoring THEN the system SHALL ingest and process VPC Flow Logs to detect network traffic anomalies and threats
3. WHEN integrating threat detection THEN the system SHALL consume GuardDuty Findings and route them through the multi-agent investigation pipeline
4. WHEN aggregating security alerts THEN the system SHALL process Security Hub Findings from multiple AWS security services as unified investigation inputs
5. WHEN customers provide AWS configurations THEN the system SHALL validate cross-account access permissions and establish secure data ingestion pipelines
6. IF data source connections fail THEN the system SHALL provide specific troubleshooting guidance for IAM roles, resource policies, and network connectivity
7. When processing real customer data, the system judges the automation rate based on actual conditions to perform false positive detection and closure. Everything is based on safety