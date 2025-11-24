#!/usr/bin/env python3
"""
Test Deepgram API connection and key validity
"""

import os
import asyncio
from deepgram import DeepgramClient, LiveOptions, LiveTranscriptionEvents

async def test_deepgram_connection():
    """Test basic Deepgram connection"""
    
    # Get API key from environment
    api_key = os.getenv("DEEPGRAM_API_KEY")
    
    if not api_key:
        print("❌ DEEPGRAM_API_KEY not found in environment")
        return False
    
    print(f"✅ API Key found (length: {len(api_key)})")
    print(f"✅ API Key starts with: {api_key[:8]}...")
    
    try:
        # Create client
        client = DeepgramClient(api_key)
        print("✅ Deepgram client created")
        
        # Test with simple prerecorded API first
        try:
            # This is a simple test to validate the API key
            print("🔍 Testing API key validity...")
            
            # Create live connection
            connection = client.listen.asyncwebsocket.v("1")
            print("✅ WebSocket connection object created")
            
            # Set up minimal event handlers
            async def on_open(self, open, **kwargs):
                print("✅ WebSocket connection opened successfully!")
                await connection.finish()
            
            async def on_error(self, error, **kwargs):
                print(f"❌ WebSocket error: {error}")
            
            connection.on(LiveTranscriptionEvents.Open, on_open)
            connection.on(LiveTranscriptionEvents.Error, on_error)
            
            # Configure minimal options
            options = LiveOptions(
                model="nova-2",
                language="en-US",
                encoding="linear16",
                sample_rate=16000,
                channels=1
            )
            
            print("🔍 Attempting WebSocket connection...")
            result = await connection.start(options)
            
            if result is False:
                print("❌ Failed to start WebSocket connection")
                return False
            
            print("✅ WebSocket connection test completed")
            return True
            
        except Exception as e:
            print(f"❌ Connection test failed: {e}")
            return False
            
    except Exception as e:
        print(f"❌ Client creation failed: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing Deepgram Connection...")
    print("=" * 50)
    
    result = asyncio.run(test_deepgram_connection())
    
    print("=" * 50)
    if result:
        print("✅ Deepgram connection test PASSED")
    else:
        print("❌ Deepgram connection test FAILED")
        print("\n💡 Troubleshooting tips:")
        print("1. Check your API key in .env file")
        print("2. Ensure you have Deepgram credits")
        print("3. Verify your internet connection")
        print("4. Check Deepgram service status")
