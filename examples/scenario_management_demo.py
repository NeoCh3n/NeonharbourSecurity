#!/usr/bin/env python3
"""
Scenario Management System Demo

This script demonstrates how to use the scenario management system to:
1. Browse available scenarios and presets
2. Create custom demo configurations
3. Optimize configurations for different audiences
4. Generate tailored demonstrations
"""

import json
import sys
import os

# Add the project root to the Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.demo import (
    scenario_manager,
    custom_configurator,
    CustomConfigurationRequest,
    AudienceType,
    ScenarioCategory
)


def demo_browse_scenarios():
    """Demonstrate browsing available scenarios"""
    print("=== Available Scenarios ===")
    
    # Get all scenarios
    scenarios = scenario_manager.get_available_scenarios()
    print(f"Total scenarios available: {len(scenarios)}")
    
    # Show first few scenarios
    for i, scenario in enumerate(scenarios[:3]):
        print(f"\n{i+1}. {scenario['scenario_type']}")
        print(f"   Attack Vector: {scenario['attack_vector']}")
        print(f"   Source: {scenario['source']}")
        print(f"   Severity: {scenario['severity']}")
        print(f"   HKMA Relevance: {scenario['hkma_relevance']}")
    
    # Get scenarios by category
    print(f"\n=== Phishing Scenarios ===")
    phishing_scenarios = scenario_manager.get_scenarios_by_category("phishing")
    for scenario in phishing_scenarios:
        print(f"- {scenario['scenario_type']}: {scenario['attack_vector']}")


def demo_browse_presets():
    """Demonstrate browsing demo presets"""
    print("\n=== Demo Presets ===")
    
    # Get all presets
    presets = scenario_manager.get_demo_presets()
    print(f"Total presets available: {len(presets)}")
    
    for preset in presets:
        print(f"\n- {preset['name']} ({preset['preset_id']})")
        print(f"  Target Audience: {preset['target_audience']}")
        print(f"  Duration: {preset['duration_minutes']} minutes" if preset['duration_minutes'] else "  Duration: Continuous")
        print(f"  Scenarios: {preset['scenario_count']}")
        print(f"  Categories: {', '.join(preset['scenario_categories'])}")
    
    # Get detailed preset information
    print(f"\n=== Technical Deep Dive Details ===")
    details = scenario_manager.get_preset_details("technical_deep_dive")
    if details:
        print(f"Description: {details['description']}")
        print(f"Total Weight: {details['total_weight']:.1f}")
        print(f"Avg False Positive Rate: {details['average_false_positive_rate']:.2f}")
        print(f"Scenarios:")
        for scenario in details['scenarios'][:3]:  # Show first 3
            config = scenario['configuration']
            print(f"  - {config['scenario_id']}: weight={config['weight']}, fp_rate={config['false_positive_probability']}")


def demo_preset_recommendations():
    """Demonstrate preset recommendations"""
    print("\n=== Preset Recommendations ===")
    
    # Get recommendations for executive audience
    recommendations = scenario_manager.get_preset_recommendations(
        audience="executive",
        duration_minutes=20,
        compliance_requirements=["hkma_sa2"]
    )
    
    print("Recommendations for Executive Audience (20 min, HKMA SA-2 focus):")
    for i, rec in enumerate(recommendations[:3]):
        print(f"\n{i+1}. {rec['name']} (Score: {rec['match_score']})")
        print(f"   Reasons: {', '.join(rec['match_reasons'])}")
        print(f"   Duration: {rec['duration_minutes']} minutes" if rec['duration_minutes'] else "   Duration: Continuous")
        print(f"   Scenarios: {rec['scenario_count']}")


def demo_custom_configuration():
    """Demonstrate creating custom configurations"""
    print("\n=== Custom Configuration ===")
    
    # Create a custom configuration request
    request = CustomConfigurationRequest(
        name="Financial Sector Security Demo",
        description="Tailored demo for Hong Kong financial institutions focusing on regulatory compliance and insider threats",
        target_audience="compliance",
        duration_minutes=30,
        primary_objectives=["regulatory_compliance", "insider_threat_detection", "audit_trails"],
        scenario_preferences={
            "data_privacy_violation": 2.5,
            "insider_data_exfiltration": 2.0,
            "phishing_email": 1.5,
            "insider_privilege_abuse": 1.8
        },
        compliance_requirements=["hkma_sa2", "hkma_tmg1", "pdpo"],
        complexity_level="intermediate",
        false_positive_target=0.75,
        custom_parameters={
            "sector_focus": "financial_services",
            "regulatory_emphasis": True,
            "show_audit_trail": True
        }
    )
    
    # Generate the configuration
    result = custom_configurator.generate_custom_configuration(request)
    
    if result["success"]:
        config = result["configuration"]
        print(f"✓ Generated custom configuration: {config['name']}")
        print(f"  Preset ID: {config['preset_id']}")
        print(f"  Target Audience: {config['target_audience']}")
        print(f"  Duration: {config['duration_minutes']} minutes")
        print(f"  Scenarios: {result['scenario_count']}")
        print(f"  Estimated Duration: {result['estimated_duration']} minutes")
        
        # Show validation results
        validation = result["validation"]
        if validation["valid"]:
            print("  ✓ Configuration is valid")
            if validation.get("warnings"):
                print(f"  Warnings: {', '.join(validation['warnings'])}")
        else:
            print(f"  ✗ Validation errors: {', '.join(validation['errors'])}")
        
        # Show optimization notes
        if result.get("optimization_notes"):
            print(f"  Notes: {', '.join(result['optimization_notes'])}")
        
        return config
    else:
        print(f"✗ Failed to generate configuration: {result['error']}")
        return None


def demo_configuration_templates():
    """Demonstrate using configuration templates"""
    print("\n=== Configuration Templates ===")
    
    # Get available templates
    templates = custom_configurator.get_configuration_templates()
    print("Available templates:")
    
    for template in templates:
        print(f"\n- {template['name']} ({template['template_id']})")
        print(f"  Description: {template['description']}")
        print(f"  Duration: {template['duration_minutes']} minutes")
        print(f"  Scenarios: {template['scenario_count']}")
        print(f"  Complexity: {template['complexity_level']}")
        print(f"  Focus Areas: {', '.join(template['focus_areas'])}")
    
    # Apply a template
    print(f"\n=== Applying Quick Demo Template ===")
    result = custom_configurator.apply_configuration_template(
        "quick_demo",
        customizations={
            "duration_minutes": 12,
            "target_audience": "executive"
        }
    )
    
    if result["success"]:
        config = result["configuration"]
        print(f"✓ Applied template: {config['name']}")
        print(f"  Scenarios: {result['scenario_count']}")
        print(f"  Estimated Duration: {result['estimated_duration']} minutes")
    else:
        print(f"✗ Failed to apply template: {result['error']}")


def demo_audience_optimization():
    """Demonstrate audience optimization"""
    print("\n=== Audience Optimization ===")
    
    # Start with executive preset
    preset_details = scenario_manager.get_preset_details("executive_overview")
    if not preset_details:
        print("Could not find executive_overview preset")
        return
    
    print(f"Original preset: {preset_details['name']}")
    print(f"Target audience: {preset_details['target_audience']}")
    print(f"Avg FP rate: {preset_details['average_false_positive_rate']:.2f}")
    
    # Optimize for technical audience
    result = custom_configurator.optimize_for_audience(preset_details, "technical")
    
    if result["success"]:
        optimized = result["optimized_configuration"]
        print(f"\n✓ Optimized for technical audience")
        print(f"  New target audience: {optimized['target_audience']}")
        print(f"  Optimizations applied: {', '.join(result['optimizations_applied'])}")
        
        # Show scenario changes
        original_scenarios = preset_details['scenarios']
        optimized_scenarios = optimized['scenarios']
        
        print(f"\n  Scenario adjustments:")
        for i, (orig, opt) in enumerate(zip(original_scenarios[:2], optimized_scenarios[:2])):
            orig_config = orig['configuration']
            print(f"    {orig_config['scenario_id']}:")
            print(f"      FP rate: {orig_config['false_positive_probability']:.2f} → {opt['false_positive_probability']:.2f}")
            print(f"      Weight: {orig_config['weight']:.1f} → {opt['weight']:.1f}")
    else:
        print(f"✗ Optimization failed: {result['error']}")


def demo_compliance_mapping():
    """Demonstrate compliance framework mapping"""
    print("\n=== Compliance Framework Mapping ===")
    
    # Get HKMA SA-2 mapping
    result = scenario_manager.get_compliance_mapping("hkma_sa2")
    
    if result["success"]:
        mapping = result["mapping"]
        print(f"HKMA SA-2 compliance mapping ({result['scenario_count']} scenarios):")
        
        for scenario_type, requirements in list(mapping.items())[:4]:  # Show first 4
            print(f"\n  {scenario_type}:")
            for req in requirements:
                print(f"    - {req}")
    else:
        print(f"✗ Failed to get compliance mapping: {result['error']}")


def main():
    """Run all demonstration functions"""
    print("🎯 NeoHarbour Security - Scenario Management System Demo")
    print("=" * 60)
    
    try:
        demo_browse_scenarios()
        demo_browse_presets()
        demo_preset_recommendations()
        custom_config = demo_custom_configuration()
        demo_configuration_templates()
        demo_audience_optimization()
        demo_compliance_mapping()
        
        print("\n" + "=" * 60)
        print("✅ Demo completed successfully!")
        print("\nThe scenario management system provides:")
        print("• 10+ pre-defined attack scenario templates")
        print("• 5 built-in demo presets for different audiences")
        print("• Custom configuration generation")
        print("• Audience-specific optimization")
        print("• Compliance framework mapping")
        print("• Configuration templates and validation")
        
    except Exception as e:
        print(f"\n❌ Demo failed with error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()