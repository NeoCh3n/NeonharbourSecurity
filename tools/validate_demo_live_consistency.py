#!/usr/bin/env python3
"""
Demo and Live Mode Consistency Validation Script

Validates that demo alerts route through complete Step Functions workflow
with all six agents and generate same compliance artifacts as live mode.
"""

import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any

import boto3
from botocore.exceptions import ClientError

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from demo.generator import DemoDataGenerator
from demo.integration import DemoLiveIntegration, IntegrationStatus
from demo.workflow_validator import DemoLiveWorkflowValidator
from demo.quality_validator import DemoLiveQualityValidator, ProcessingMode


class DemoLiveConsistencyValidator:
    """
    Comprehensive validator for demo and live mode consistency
    """
    
    def __init__(self):
        self.integration_manager = DemoLiveIntegration()
        self.workflow_validator = DemoLiveWorkflowValidator()
        self.quality_validator = DemoLiveQualityValidator()
        self.demo_generator = DemoDataGenerator()
        
        self.tenant_id = os.getenv('DEFAULT_TENANT_ID', 'hk-demo')
        self.event_bus_name = os.getenv('EVENT_BUS_NAME', 'AsiaAgenticSocBus')
        
        # Validation results
        self.results = {
            "validation_started": datetime.now(timezone.utc).isoformat(),
            "demo_alerts_generated": [],
            "live_alerts_processed": [],
            "workflow_validations": [],
            "quality_comparisons": [],
            "integration_consistency": {},
            "overall_status": "unknown",
            "validation_errors": [],
            "recommendations": []
        }
    
    def run_comprehensive_validation(self) -> Dict[str, Any]:
        """
        Run comprehensive validation of demo and live mode consistency
        """
        print("🚀 Starting Demo and Live Mode Consistency Validation")
        print("=" * 60)
        
        try:
            # Step 1: Generate demo alerts
            print("\n📊 Step 1: Generating demo alerts...")
            self._generate_demo_alerts()
            
            # Step 2: Process live alerts (if available)
            print("\n🔄 Step 2: Processing live alerts...")
            self._process_live_alerts()
            
            # Step 3: Validate workflow consistency
            print("\n🔍 Step 3: Validating workflow consistency...")
            self._validate_workflow_consistency()
            
            # Step 4: Compare quality metrics
            print("\n📈 Step 4: Comparing quality metrics...")
            self._compare_quality_metrics()
            
            # Step 5: Validate integration consistency
            print("\n🔗 Step 5: Validating integration consistency...")
            self._validate_integration_consistency()
            
            # Step 6: Generate final report
            print("\n📋 Step 6: Generating final report...")
            self._generate_final_report()
            
        except Exception as e:
            print(f"❌ Validation failed with error: {e}")
            self.results["validation_errors"].append(str(e))
            self.results["overall_status"] = "failed"
        
        return self.results
    
    def _generate_demo_alerts(self):
        """Generate demo alerts for validation"""
        demo_scenarios = ["phishing", "malware", "insider_threat"]
        
        for scenario in demo_scenarios:
            try:
                # Generate false positive alert
                fp_alert = self.demo_generator.generate_single_alert(
                    scenario_type=scenario,
                    risk_level="low",
                    tenant_id=self.tenant_id
                )
                
                # Send to pipeline
                self.demo_generator.send_alert_to_pipeline(fp_alert)
                
                self.results["demo_alerts_generated"].append({
                    "investigation_id": fp_alert.investigation_id,
                    "scenario_type": scenario,
                    "is_false_positive": True,
                    "alert_id": fp_alert.alert_id,
                    "generated_at": fp_alert.timestamp
                })
                
                print(f"  ✅ Generated demo {scenario} alert (FP): {fp_alert.investigation_id}")
                
                # Generate genuine threat alert
                threat_alert = self.demo_generator.generate_single_alert(
                    scenario_type=scenario,
                    risk_level="high",
                    tenant_id=self.tenant_id
                )
                
                # Send to pipeline
                self.demo_generator.send_alert_to_pipeline(threat_alert)
                
                self.results["demo_alerts_generated"].append({
                    "investigation_id": threat_alert.investigation_id,
                    "scenario_type": scenario,
                    "is_false_positive": False,
                    "alert_id": threat_alert.alert_id,
                    "generated_at": threat_alert.timestamp
                })
                
                print(f"  ✅ Generated demo {scenario} alert (Threat): {threat_alert.investigation_id}")
                
                # Wait between alerts to avoid overwhelming the system
                time.sleep(2)
                
            except Exception as e:
                print(f"  ❌ Failed to generate demo {scenario} alert: {e}")
                self.results["validation_errors"].append(f"Demo alert generation failed for {scenario}: {e}")
        
        print(f"  📊 Total demo alerts generated: {len(self.results['demo_alerts_generated'])}")
    
    def _process_live_alerts(self):
        """Process or simulate live alerts for comparison"""
        # For validation purposes, we'll create simulated live alerts
        # In a real environment, these would be actual live alerts from customer data sources
        
        live_scenarios = ["cloudtrail_anomaly", "guardduty_finding", "vpc_flow_suspicious"]
        
        for scenario in live_scenarios:
            try:
                # Create simulated live alert
                investigation_id = f"INV-LIVE-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:4]}"
                
                live_alert = {
                    "investigationId": investigation_id,
                    "tenantId": self.tenant_id,
                    "alert": {
                        "source": "aws_security_hub",
                        "title": f"Live {scenario} detected",
                        "description": f"Suspicious {scenario} activity detected in production environment",
                        "severity": "medium",
                        "entities": [
                            {"type": "account", "value": "123456789012"},
                            {"type": "region", "value": "ap-southeast-1"}
                        ],
                        "tactics": ["Discovery", "Collection"],
                        "isDemo": False
                    },
                    "receivedAt": datetime.now(timezone.utc).isoformat(),
                    "source": "asia.agentic.soc.ingestion"
                }
                
                # Send to pipeline using integration manager
                processing_result = self.integration_manager.ensure_seamless_processing(
                    live_alert, ProcessingMode.LIVE
                )
                
                self.results["live_alerts_processed"].append({
                    "investigation_id": investigation_id,
                    "scenario_type": scenario,
                    "processing_result": processing_result,
                    "generated_at": live_alert["receivedAt"]
                })
                
                if processing_result["success"]:
                    print(f"  ✅ Processed live {scenario} alert: {investigation_id}")
                else:
                    print(f"  ⚠️  Live {scenario} alert processing issues: {investigation_id}")
                
                time.sleep(2)
                
            except Exception as e:
                print(f"  ❌ Failed to process live {scenario} alert: {e}")
                self.results["validation_errors"].append(f"Live alert processing failed for {scenario}: {e}")
        
        print(f"  📊 Total live alerts processed: {len(self.results['live_alerts_processed'])}")
    
    def _validate_workflow_consistency(self):
        """Validate that all alerts went through complete Step Functions workflow"""
        print("  🔍 Validating Step Functions workflow completion...")
        
        # Wait for investigations to complete
        print("  ⏳ Waiting for investigations to complete (60 seconds)...")
        time.sleep(60)
        
        all_investigations = []
        
        # Collect demo investigation IDs
        demo_investigation_ids = [alert["investigation_id"] for alert in self.results["demo_alerts_generated"]]
        all_investigations.extend([(inv_id, ProcessingMode.DEMO) for inv_id in demo_investigation_ids])
        
        # Collect live investigation IDs
        live_investigation_ids = [alert["investigation_id"] for alert in self.results["live_alerts_processed"]]
        all_investigations.extend([(inv_id, ProcessingMode.LIVE) for inv_id in live_investigation_ids])
        
        # Validate each investigation
        for investigation_id, mode in all_investigations:
            try:
                validation_result = self.workflow_validator.validate_complete_workflow(
                    investigation_id, self.tenant_id, timeout_minutes=5
                )
                
                self.results["workflow_validations"].append({
                    "investigation_id": investigation_id,
                    "processing_mode": mode.value,
                    "workflow_complete": validation_result.workflow_complete,
                    "stages_executed": validation_result.stages_executed,
                    "missing_stages": validation_result.missing_stages,
                    "execution_time_seconds": validation_result.execution_time_seconds,
                    "quality_score": validation_result.quality_score,
                    "validation_errors": validation_result.validation_errors
                })
                
                if validation_result.workflow_complete:
                    print(f"    ✅ {investigation_id} ({mode.value}): Complete workflow")
                else:
                    print(f"    ❌ {investigation_id} ({mode.value}): Incomplete workflow")
                    print(f"       Missing stages: {validation_result.missing_stages}")
                
            except Exception as e:
                print(f"    ❌ {investigation_id} ({mode.value}): Validation error - {e}")
                self.results["validation_errors"].append(f"Workflow validation failed for {investigation_id}: {e}")
        
        # Calculate completion rates
        demo_validations = [v for v in self.results["workflow_validations"] if v["processing_mode"] == "demo"]
        live_validations = [v for v in self.results["workflow_validations"] if v["processing_mode"] == "live"]
        
        demo_completion_rate = sum(1 for v in demo_validations if v["workflow_complete"]) / len(demo_validations) if demo_validations else 0
        live_completion_rate = sum(1 for v in live_validations if v["workflow_complete"]) / len(live_validations) if live_validations else 0
        
        print(f"  📊 Demo workflow completion rate: {demo_completion_rate:.1%}")
        print(f"  📊 Live workflow completion rate: {live_completion_rate:.1%}")
    
    def _compare_quality_metrics(self):
        """Compare quality metrics between demo and live investigations"""
        print("  📈 Comparing investigation quality metrics...")
        
        demo_investigations = [alert["investigation_id"] for alert in self.results["demo_alerts_generated"]]
        live_investigations = [alert["investigation_id"] for alert in self.results["live_alerts_processed"]]
        
        if not demo_investigations and not live_investigations:
            print("    ⚠️  No investigations available for quality comparison")
            return
        
        try:
            # Use quality validator to compare demo and live investigations
            if demo_investigations and live_investigations:
                comparison_result = self.quality_validator.compare_demo_live_quality(
                    demo_investigations[0], live_investigations[0],
                    self.tenant_id, self.tenant_id
                )
                
                self.results["quality_comparisons"].append(comparison_result)
                
                print(f"    📊 Demo quality score: {comparison_result['demo_quality_score']:.2f}")
                print(f"    📊 Live quality score: {comparison_result['live_quality_score']:.2f}")
                print(f"    📊 Quality difference: {comparison_result['quality_difference']:.2f}")
                print(f"    {'✅' if comparison_result['quality_consistent'] else '❌'} Quality consistent: {comparison_result['quality_consistent']}")
            
            # Validate consistency across all investigations
            consistency_validation = self.quality_validator.validate_demo_live_consistency(
                demo_investigations, live_investigations, self.tenant_id
            )
            
            self.results["quality_comparisons"].append(consistency_validation)
            
            print(f"    📊 Overall quality consistent: {consistency_validation['overall_quality_consistent']}")
            
        except Exception as e:
            print(f"    ❌ Quality comparison failed: {e}")
            self.results["validation_errors"].append(f"Quality comparison failed: {e}")
    
    def _validate_integration_consistency(self):
        """Validate overall integration consistency"""
        print("  🔗 Validating integration consistency...")
        
        try:
            integration_result = self.integration_manager.validate_integration_consistency(
                self.tenant_id, sample_size=10
            )
            
            self.results["integration_consistency"] = {
                "status": integration_result.status.value,
                "demo_quality_score": integration_result.demo_quality_score,
                "live_quality_score": integration_result.live_quality_score,
                "workflow_consistency": integration_result.workflow_consistency,
                "compliance_artifacts_consistent": integration_result.compliance_artifacts_consistent,
                "processing_time_difference_seconds": integration_result.processing_time_difference_seconds,
                "validation_errors": integration_result.validation_errors,
                "recommendations": integration_result.recommendations
            }
            
            status_emoji = {
                "consistent": "✅",
                "degraded": "⚠️",
                "failed": "❌"
            }
            
            print(f"    {status_emoji.get(integration_result.status.value, '❓')} Integration status: {integration_result.status.value}")
            print(f"    📊 Demo quality: {integration_result.demo_quality_score:.2f}")
            print(f"    📊 Live quality: {integration_result.live_quality_score:.2f}")
            print(f"    🔄 Workflow consistency: {integration_result.workflow_consistency}")
            
            if integration_result.validation_errors:
                print("    ❌ Integration errors:")
                for error in integration_result.validation_errors:
                    print(f"       - {error}")
            
            if integration_result.recommendations:
                print("    💡 Recommendations:")
                for rec in integration_result.recommendations:
                    print(f"       - {rec}")
            
        except Exception as e:
            print(f"    ❌ Integration consistency validation failed: {e}")
            self.results["validation_errors"].append(f"Integration consistency validation failed: {e}")
    
    def _generate_final_report(self):
        """Generate final validation report"""
        print("  📋 Generating final validation report...")
        
        # Determine overall status
        if len(self.results["validation_errors"]) == 0:
            integration_status = self.results.get("integration_consistency", {}).get("status", "unknown")
            if integration_status == "consistent":
                self.results["overall_status"] = "passed"
            elif integration_status == "degraded":
                self.results["overall_status"] = "passed_with_warnings"
            else:
                self.results["overall_status"] = "failed"
        else:
            self.results["overall_status"] = "failed"
        
        # Generate recommendations
        if self.results["overall_status"] != "passed":
            self.results["recommendations"].extend([
                "Review validation errors and address identified issues",
                "Ensure demo and live modes use identical processing logic",
                "Validate that all Step Functions stages are executed",
                "Check compliance artifact generation consistency"
            ])
        
        # Add completion timestamp
        self.results["validation_completed"] = datetime.now(timezone.utc).isoformat()
        
        print(f"    📊 Overall validation status: {self.results['overall_status']}")
        print(f"    📊 Demo alerts generated: {len(self.results['demo_alerts_generated'])}")
        print(f"    📊 Live alerts processed: {len(self.results['live_alerts_processed'])}")
        print(f"    📊 Workflow validations: {len(self.results['workflow_validations'])}")
        print(f"    📊 Validation errors: {len(self.results['validation_errors'])}")


def main():
    """Main validation function"""
    print("Demo and Live Mode Consistency Validation")
    print("=========================================")
    
    # Check environment
    required_env_vars = [
        'DDB_INVESTIGATIONS_TABLE',
        'EVENT_BUS_NAME',
        'AUDIT_BUCKET',
        'DEFAULT_TENANT_ID'
    ]
    
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    if missing_vars:
        print(f"❌ Missing required environment variables: {missing_vars}")
        sys.exit(1)
    
    # Run validation
    validator = DemoLiveConsistencyValidator()
    results = validator.run_comprehensive_validation()
    
    # Save results to file
    results_file = f"demo_live_validation_results_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.json"
    with open(results_file, 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\n📄 Validation results saved to: {results_file}")
    
    # Print summary
    print("\n" + "=" * 60)
    print("VALIDATION SUMMARY")
    print("=" * 60)
    
    status_emoji = {
        "passed": "✅",
        "passed_with_warnings": "⚠️",
        "failed": "❌",
        "unknown": "❓"
    }
    
    overall_status = results["overall_status"]
    print(f"Overall Status: {status_emoji.get(overall_status, '❓')} {overall_status.upper()}")
    
    if results["validation_errors"]:
        print(f"\nValidation Errors ({len(results['validation_errors'])}):")
        for error in results["validation_errors"]:
            print(f"  ❌ {error}")
    
    if results["recommendations"]:
        print(f"\nRecommendations ({len(results['recommendations'])}):")
        for rec in results["recommendations"]:
            print(f"  💡 {rec}")
    
    # Exit with appropriate code
    if overall_status == "passed":
        sys.exit(0)
    elif overall_status == "passed_with_warnings":
        sys.exit(0)  # Warnings are acceptable
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()