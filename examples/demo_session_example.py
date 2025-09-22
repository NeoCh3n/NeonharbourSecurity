#!/usr/bin/env python3
"""
Demo Session Management Example

This script demonstrates how to use the demo session management system
for the Interactive Demo System.
"""

import os
import sys
import time
from datetime import datetime

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from demo.controller import DemoSessionController
from demo.session import DemoParameters, DemoMetrics


def main():
    """Demonstrate demo session management functionality"""
    
    print("🚀 Demo Session Management Example")
    print("=" * 50)
    
    # Initialize controller
    controller = DemoSessionController()
    
    # 1. Show available presets
    print("\n📋 Available Demo Presets:")
    presets_result = controller.get_available_presets()
    if presets_result['success']:
        for name, preset in presets_result['presets'].items():
            print(f"  • {name}: {preset['description']}")
    
    # 2. Start a demo session with technical preset
    print("\n🎯 Starting Technical Deep Dive Demo Session...")
    session_result = controller.start_demo_session(
        created_by="demo-user",
        tenant_id="example-tenant",
        preset_name="technical_deep_dive",
        custom_parameters={
            'interval_seconds': 20.0,  # Override default interval
            'duration_minutes': 10     # 10 minute demo
        }
    )
    
    if not session_result['success']:
        print(f"❌ Failed to start session: {session_result['message']}")
        return
    
    session_id = session_result['session_id']
    print(f"✅ Session started successfully: {session_id}")
    print(f"   Status: {session_result['status']}")
    print(f"   Parameters: {session_result['parameters']}")
    
    # 3. Get session status
    print(f"\n📊 Getting Session Status...")
    status_result = controller.get_session_status(session_id)
    if status_result['success']:
        print(f"   Session ID: {status_result['session_id']}")
        print(f"   Status: {status_result['status']}")
        print(f"   Created: {status_result['created_at']}")
        print(f"   Metrics: {status_result['metrics']}")
    
    # 4. Update session parameters in real-time
    print(f"\n⚙️  Updating Session Parameters...")
    update_result = controller.update_session_parameters(
        session_id,
        {
            'interval_seconds': 15.0,
            'false_positive_rate': 0.85
        }
    )
    
    if update_result['success']:
        print(f"✅ Parameters updated: {update_result['updated_parameters']}")
    else:
        print(f"❌ Failed to update parameters: {update_result['message']}")
    
    # 5. Simulate some demo metrics updates
    print(f"\n📈 Simulating Demo Activity...")
    for i in range(3):
        metrics_update = {
            'alerts_generated': (i + 1) * 5,
            'alerts_processed': (i + 1) * 4,
            'auto_closed_count': (i + 1) * 3,
            'escalated_count': (i + 1) * 1
        }
        
        metrics_result = controller.update_session_metrics(session_id, metrics_update)
        if metrics_result['success']:
            automation_rate = metrics_result['updated_metrics']['automation_rate']
            print(f"   Update {i+1}: {metrics_update['alerts_processed']} alerts processed, "
                  f"{automation_rate:.1%} automation rate")
        
        time.sleep(1)  # Simulate time passing
    
    # 6. Pause the session
    print(f"\n⏸️  Pausing Demo Session...")
    pause_result = controller.pause_demo_session(session_id)
    if pause_result['success']:
        print(f"✅ Session paused: {pause_result['status']}")
    
    # 7. Resume the session
    print(f"\n▶️  Resuming Demo Session...")
    resume_result = controller.resume_demo_session(session_id)
    if resume_result['success']:
        print(f"✅ Session resumed: {resume_result['status']}")
    
    # 8. List active sessions
    print(f"\n📋 Listing Active Sessions...")
    list_result = controller.list_active_sessions("example-tenant")
    if list_result['success']:
        print(f"   Found {list_result['count']} active sessions:")
        for session in list_result['sessions']:
            print(f"   • {session['session_id']}: {session['status']} "
                  f"(created by {session['created_by']})")
    
    # 9. Stop the session
    print(f"\n🛑 Stopping Demo Session...")
    stop_result = controller.stop_demo_session(session_id)
    if stop_result['success']:
        print(f"✅ Session stopped: {stop_result['status']}")
        if 'final_metrics' in stop_result:
            final_metrics = stop_result['final_metrics']
            print(f"   Final metrics: {final_metrics}")
    
    # 10. Demonstrate parameter validation
    print(f"\n🔍 Testing Parameter Validation...")
    
    # Valid parameters
    valid_params = {
        'interval_seconds': 30.0,
        'false_positive_rate': 0.8,
        'duration_minutes': 60
    }
    validation = controller._validate_parameters(valid_params)
    print(f"   Valid parameters: {validation['valid']}")
    
    # Invalid parameters
    invalid_params = {
        'interval_seconds': -5,  # Invalid: negative
        'false_positive_rate': 1.5  # Invalid: > 1.0
    }
    validation = controller._validate_parameters(invalid_params)
    print(f"   Invalid parameters: {validation['valid']} - {validation.get('error', 'N/A')}")
    
    print(f"\n🎉 Demo Session Management Example Complete!")


if __name__ == "__main__":
    # Set environment variable for demo
    os.environ['DDB_DEMO_SESSIONS_TABLE'] = 'demo-sessions-example'
    
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n\n⚠️  Demo interrupted by user")
    except Exception as e:
        print(f"\n\n❌ Error running demo: {e}")
        import traceback
        traceback.print_exc()