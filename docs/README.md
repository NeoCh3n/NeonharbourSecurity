# NeoHarbour Security - Documentation Index

## Overview

This directory contains comprehensive documentation for the NeoHarbour Security Interactive Demo System. The documentation is organized to serve different user roles and use cases, from system administration to technical implementation.

## Documentation Structure

### User Guides
- **[Admin User Guide](admin_user_guide.md)** - Complete guide for system administrators covering setup, configuration, user management, and troubleshooting
- **[Demo Operator Guide](demo_operator_guide.md)** - Comprehensive guide for conducting effective demonstrations of the platform capabilities

### Technical Documentation
- **[Technical Documentation](technical_documentation.md)** - Detailed technical reference covering system architecture, API specifications, and integration points
- **[Architecture Overview](../ARCHITECTURE.md)** - High-level system architecture and design principles
- **[Deployment Guide](../DEPLOYMENT.md)** - Infrastructure deployment and environment management

### Specialized Guides
- **[AWS Service Integration](aws_service_integration.md)** - AWS service configuration and integration details
- **[AWS Configuration Management](aws_configuration_management.md)** - AWS setup and credential management
- **[AWS Data Source Connectors](aws_data_source_connectors.md)** - Customer AWS data source integration
- **[Security Hub Integration](security_hub_integration.md)** - AWS Security Hub connector implementation
- **[Splunk Integration](splunk_integration.md)** - Splunk SIEM integration guide
- **[Demo System](demo_system.md)** - Interactive demo system architecture and usage
- **[Progress Tracking Implementation](progress_tracking_implementation.md)** - Real-time investigation progress tracking
- **[Deployment Automation](deployment_automation.md)** - CI/CD pipeline and automated deployment
- **[Long Horizon Memory](long_horizon_memory.md)** - System memory and learning capabilities
- **[Policy Approval](policy_approval.md)** - Human-in-the-loop approval workflows

### Compliance Documentation
- **[HKMA Templates](hkma/)** - Hong Kong Monetary Authority compliance templates and mappings
  - **[SA-2 Template](hkma/templates/sa2_template.md)** - Supervisory Approach 2 compliance template
  - **[TM-G-1 Template](hkma/templates/tm_g1_template.md)** - Technology Management G-1 compliance template
  - **[Encryption Policy](hkma/templates/encryption_policy.md)** - Data encryption policy template
  - **[Retention Policy](hkma/templates/retention_policy.md)** - Data retention policy template

### Development Resources
- **[Prompts](prompts/)** - AI prompt templates and examples
  - **[Design PC Prompt](prompts/design_pc_prompt.md)** - Design phase prompt templates
  - **[Frontend PC Prompt](prompts/frontend_pc_prompt.md)** - Frontend development prompts
  - **[Copy IA PC Prompt](prompts/copy_ia_pc_prompt.md)** - Information architecture prompts

## Quick Start Guide

### For System Administrators
1. Start with the **[Admin User Guide](admin_user_guide.md)**
2. Follow the AWS configuration steps
3. Set up user accounts and permissions
4. Configure demo system parameters
5. Perform system health checks

### For Demo Operators
1. Review the **[Demo Operator Guide](demo_operator_guide.md)**
2. Complete pre-demo preparation checklist
3. Practice with different demo scenarios
4. Understand audience-specific strategies
5. Prepare troubleshooting materials

### For Developers
1. Read the **[Technical Documentation](technical_documentation.md)**
2. Review the system architecture overview
3. Understand the multi-agent pipeline
4. Study API specifications and integration points
5. Follow development guidelines and coding standards

### For Compliance Officers
1. Review **[HKMA Templates](hkma/templates/)**
2. Understand compliance mapping and reporting
3. Review audit trail capabilities
4. Examine data retention and encryption policies

## Documentation Maintenance

### Update Procedures
- Documentation should be updated with each system release
- All API changes must be reflected in technical documentation
- User guides should be tested with actual system usage
- Compliance documentation must be reviewed quarterly

### Version Control
- All documentation is version controlled with the codebase
- Changes should be reviewed and approved before merging
- Breaking changes require documentation updates before release

### Feedback and Improvements
- User feedback should be incorporated into documentation updates
- Regular documentation reviews should be conducted
- Outdated information should be promptly corrected

## Support and Contact

### Documentation Issues
- Report documentation errors or omissions via GitHub issues
- Suggest improvements through pull requests
- Contact the documentation team at docs@neoharbour.security

### Technical Support
- System administration support: admin@neoharbour.security
- Demo operation support: demo@neoharbour.security
- Developer support: dev@neoharbour.security
- Emergency support: +852-XXXX-XXXX

## Document Status

| Document | Last Updated | Version | Status |
|----------|-------------|---------|--------|
| Admin User Guide | 2024-01-15 | 1.0 | Complete |
| Demo Operator Guide | 2024-01-15 | 1.0 | Complete |
| Technical Documentation | 2024-01-15 | 1.0 | Complete |
| AWS Service Integration | 2024-01-10 | 0.9 | In Progress |
| Compliance Templates | 2024-01-12 | 1.0 | Complete |

---

*This documentation index is maintained by the NeoHarbour Security documentation team. For questions or suggestions, please contact docs@neoharbour.security.*