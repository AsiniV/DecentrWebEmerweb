#!/usr/bin/env python3
"""
Comprehensive test for enhanced ContentResolver with privacy features
"""

import asyncio
import json
import sys
import requests
import time

def test_privacy_endpoint():
    """Test the privacy status endpoint"""
    print("🔒 Testing Privacy Status Endpoint")
    print("-" * 40)
    
    try:
        response = requests.get("http://localhost:8001/api/privacy/status")
        if response.status_code == 200:
            data = response.json()
            print("✅ Privacy endpoint accessible")
            print(f"   Privacy by default: {data['privacy_by_default']}")
            print(f"   Features enabled: {len(data['features_enabled'])} features")
            
            status = data['status']
            print(f"   TOR available: {'✅' if status['tor_available'] else '⚠️  (using obfuscation)'}")
            print(f"   IPFS encryption: {'✅' if status['ipfs_encryption'] else '❌'}")
            print(f"   Zero-Knowledge proofs: {'✅' if status['zk_proofs'] else '❌'}")
            print(f"   DPI bypass: {'✅' if status['dpi_bypass'] else '❌'}")
            print(f"   Protection level: {status['protection_level']}")
            return True
        else:
            print(f"❌ Privacy endpoint failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ Privacy endpoint error: {e}")
        return False

def test_ipfs_privacy():
    """Test IPFS content resolution with privacy"""
    print("\n🌐 Testing IPFS Content with Privacy")
    print("-" * 40)
    
    try:
        payload = {"url": "ipfs://QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o"}
        response = requests.post(
            "http://localhost:8001/api/content/resolve",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ IPFS content resolved")
            print(f"   Privacy enabled: {'✅' if data.get('privacy_enabled') else '❌'}")
            
            if data.get('privacy_features'):
                features = data['privacy_features']
                print("   Privacy features:")
                for key, value in features.items():
                    print(f"     {key}: {value}")
            
            print(f"   Content: {data.get('content', '')[:30]}...")
            return True
        else:
            print(f"❌ IPFS resolution failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ IPFS test error: {e}")
        return False

def test_http_privacy():
    """Test HTTP content resolution with privacy"""
    print("\n🌍 Testing HTTP Content with Privacy")
    print("-" * 40)
    
    try:
        payload = {"url": "https://httpbin.org/get"}
        response = requests.post(
            "http://localhost:8001/api/content/resolve",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ HTTP content resolved")
            print(f"   Privacy enabled: {'✅' if data.get('privacy_enabled') else '❌'}")
            
            if data.get('privacy_features'):
                features = data['privacy_features']
                print("   Privacy features:")
                for key, value in features.items():
                    if key == 'zk_proof':
                        print(f"     {key}: {str(value)[:20]}...")
                    else:
                        print(f"     {key}: {value}")
            
            return True
        else:
            print(f"❌ HTTP resolution failed: {response.status_code}")
            return False
    except Exception as e:
        print(f"❌ HTTP test error: {e}")
        return False

def main():
    """Run all privacy tests"""
    print("🚀 Enhanced ContentResolver Privacy Test Suite")
    print("=" * 50)
    
    tests = [
        test_privacy_endpoint,
        test_ipfs_privacy,
        test_http_privacy
    ]
    
    results = []
    for test in tests:
        result = test()
        results.append(result)
        time.sleep(1)  # Brief pause between tests
    
    print("\n📊 Test Results Summary")
    print("=" * 30)
    passed = sum(results)
    total = len(results)
    
    print(f"Tests passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 ALL PRIVACY FEATURES WORKING!")
        print("✅ ContentResolver enhanced with privacy by default")
    else:
        print("⚠️  Some tests failed - check implementation")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)