#!/usr/bin/env python3
"""Test script for demo data generation infrastructure."""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.demo.generator import DemoDataGenerator
from src.demo.scenarios import get_scenario_templates
from src.demo.variations import AlertVariationEngine


def test_scenario_templates():
    """Test scenario template loading."""
    print("Testing scenario templates...")
    templates = get_scenario_templates()
    print(f"Loaded {len(templates)} scenario templates:")
    
    for template in templates:
        print(f"  - {template.scenario_type}: {template.attack_vector}")
    
    return templates


def test_variation_engine():
    """Test alert variation engine."""
    print("\nTesting variation engine...")
    engine = AlertVariationEngine()
    templates = get_scenario_templates()
    
    # Test variations on first template
    template = templates[0]
    print(f"Original template: {template.scenario_type}")
    print(f"  Title: {template.title_template}")
    print(f"  Source: {template.source}")
    print(f"  Severity: {template.severity}")
    
    # Apply variations for false positive
    fp_variant = engine.apply_variations(template, is_false_positive=True)
    print(f"\nFalse positive variant:")
    print(f"  Title: {fp_variant.title_template}")
    print(f"  Source: {fp_variant.source}")
    print(f"  Severity: {fp_variant.severity}")
    
    # Apply variations for genuine threat
    threat_variant = engine.apply_variations(template, is_false_positive=False)
    print(f"\nGenuine threat variant:")
    print(f"  Title: {threat_variant.title_template}")
    print(f"  Source: {threat_variant.source}")
    print(f"  Severity: {threat_variant.severity}")
    
    # Show variation stats
    stats = engine.get_variation_stats()
    print(f"\nVariation engine stats: {json.dumps(stats, indent=2)}")


def test_single_alert_generation():
    """Test single alert generation."""
    print("\nTesting single alert generation...")
    
    # Skip Bedrock test if no AWS credentials
    if not os.getenv("AWS_REGION") and not os.getenv("AWS_DEFAULT_REGION"):
        print("Skipping Bedrock integration (no AWS credentials)")
        return
    
    try:
        generator = DemoDataGenerator()
        
        # Generate a phishing alert
        alert = generator.generate_single_alert(
            scenario_type="phishing_email",
            risk_level="auto"
        )
        
        print(f"Generated alert:")
        print(f"  ID: {alert.alert_id}")
        print(f"  Title: {alert.title}")
        print(f"  Scenario: {alert.scenario_type}")
        print(f"  False Positive: {alert.is_false_positive}")
        print(f"  Confidence: {alert.confidence_score}")
        print(f"  Entities: {len(alert.entities)}")
        
        # Print full alert as JSON
        alert_dict = {
            "alert_id": alert.alert_id,
            "investigation_id": alert.investigation_id,
            "tenant_id": alert.tenant_id,
            "source": alert.source,
            "title": alert.title,
            "description": alert.description,
            "severity": alert.severity,
            "risk_level": alert.risk_level,
            "entities": alert.entities,
            "tactics": alert.tactics,
            "timestamp": alert.timestamp,
            "scenario_type": alert.scenario_type,
            "is_false_positive": alert.is_false_positive,
            "confidence_score": alert.confidence_score
        }
        
        print(f"\nFull alert JSON:")
        print(json.dumps(alert_dict, indent=2))
        
    except Exception as e:
        print(f"Alert generation failed: {e}")
        print("This is expected if AWS Bedrock is not configured")


def test_session_management():
    """Test demo session management (without actually starting generation)."""
    print("\nTesting session management...")
    
    try:
        generator = DemoDataGenerator()
        
        # Test session creation parameters
        scenario_types = ["phishing_email", "ransomware_encryption"]
        
        print(f"Would create session with scenarios: {scenario_types}")
        print("Session management functions available:")
        print("  - start_continuous_generation()")
        print("  - stop_generation()")
        print("  - pause_generation()")
        print("  - resume_generation()")
        print("  - get_session_status()")
        print("  - list_active_sessions()")
        
        # Show available scenario types
        templates = get_scenario_templates()
        available_types = [t.scenario_type for t in templates]
        print(f"\nAvailable scenario types: {available_types}")
        
    except Exception as e:
        print(f"Session management test failed: {e}")


def main():
    """Run all tests."""
    print("Demo Data Generation Infrastructure Test")
    print("=" * 50)
    
    try:
        # Test components
        test_scenario_templates()
        test_variation_engine()
        test_single_alert_generation()
        test_session_management()
        
        print("\n" + "=" * 50)
        print("Demo infrastructure test completed!")
        print("\nTo use the demo system:")
        print("1. Ensure AWS credentials are configured")
        print("2. Set BEDROCK_REGION environment variable")
        print("3. Import DemoDataGenerator in your application")
        print("4. Call start_continuous_generation() with desired scenarios")
        
    except Exception as e:
        print(f"Test failed with error: {e}")
        return 1
    
    return 0


if __name__ == "__main__":
    sys.exit(main())