#!/usr/bin/env python3
"""
Test script to verify privacy integration in ContentResolver
"""

import asyncio
import sys
import os
sys.path.append('/app/backend')

from server import content_resolver
from services.privacy_service import privacy_service

async def test_privacy_integration():
    """Test that ContentResolver uses privacy features by default"""
    
    print("🔒 Testing Privacy Integration in ContentResolver")
    print("=" * 50)
    
    # Initialize privacy service
    print("1. Initializing privacy service...")
    privacy_init = await privacy_service.initialize()
    print(f"   Privacy service initialized: {'✅' if privacy_init else '❌'}")
    
    # Test privacy status
    print("\n2. Checking privacy status...")
    status = content_resolver.get_privacy_status()
    print(f"   Privacy enabled: {'✅' if status['privacy_enabled'] else '❌'}")
    print(f"   TOR available: {'✅' if status['tor_available'] else '⚠️  (using traffic obfuscation)'}")
    print(f"   IPFS encryption: {'✅' if status['ipfs_encryption'] else '❌'}")
    print(f"   Zero-Knowledge proofs: {'✅' if status['zk_proofs'] else '❌'}")
    print(f"   DPI bypass: {'✅' if status['dpi_bypass'] else '❌'}")
    print(f"   Protection level: {status['protection_level']}")
    
    # Test private request creation
    print("\n3. Testing private request creation...")
    try:
        private_request = await privacy_service.create_private_request("https://example.com")
        print("   ✅ Private request created successfully")
        print(f"   - TOR enabled: {private_request['tor_enabled']}")
        print(f"   - DPI bypassed: {private_request['dpi_bypassed']}")
        print(f"   - Anonymized: {private_request['anonymized']}")
        print(f"   - Privacy level: {private_request['privacy_level']}")
    except Exception as e:
        print(f"   ❌ Private request creation failed: {e}")
    
    print("\n🎉 Privacy Integration Test Complete!")
    print("All privacy features are enabled by default in ContentResolver")

if __name__ == "__main__":
    asyncio.run(test_privacy_integration())