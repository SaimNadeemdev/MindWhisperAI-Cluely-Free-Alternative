#!/usr/bin/env python3
"""
Simple test script to verify Deepgram WebSocket connection
"""
import os
import sys
import asyncio
from dotenv import load_dotenv
from deepgram import DeepgramClient, LiveTranscriptionEvents, LiveOptions

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

DEEPGRAM_API_KEY = os.getenv('DEEPGRAM_API_KEY')

async def test_deepgram_connection():
    """Test basic Deepgram WebSocket connection"""
    try:
        print(f"Testing Deepgram connection...")
        print(f"API Key present: {'Yes' if DEEPGRAM_API_KEY else 'No'}")
        print(f"API Key length: {len(DEEPGRAM_API_KEY) if DEEPGRAM_API_KEY else 0}")
        
        if not DEEPGRAM_API_KEY or len(DEEPGRAM_API_KEY) < 10:
            print("❌ Invalid or missing DEEPGRAM_API_KEY")
            return False
            
        # Create Deepgram client
        deepgram_client = DeepgramClient(DEEPGRAM_API_KEY)
        
        # Create WebSocket connection
        connection = deepgram_client.listen.websocket.v("1")
        
        # Track connection status
        connection_opened = False
        
        def on_open(self, open, **kwargs):
            nonlocal connection_opened
            connection_opened = True
            print("✅ Deepgram WebSocket connection opened successfully!")
        
        def on_error(self, error, **kwargs):
            print(f"❌ Deepgram error: {error}")
        
        def on_close(self, close, **kwargs):
            print("🔌 Deepgram connection closed")
        
        # Register event handlers
        connection.on(LiveTranscriptionEvents.Open, on_open)
        connection.on(LiveTranscriptionEvents.Error, on_error)
        connection.on(LiveTranscriptionEvents.Close, on_close)
        
        # Start connection with minimal options
        print("🔄 Starting Deepgram connection...")
        connection.start(LiveOptions(
            model="nova-2",
            language="en-US",
            encoding="linear16",
            sample_rate=16000,
            channels=1
        ))
        
        # Wait a bit to see if connection opens
        await asyncio.sleep(3)
        
        if connection_opened:
            print("✅ Connection test successful!")
            # Send a small test audio frame (silence)
            test_audio = b'\x00' * 1600  # 0.1 seconds of silence at 16kHz
            connection.send(test_audio)
            await asyncio.sleep(1)
            return True
        else:
            print("❌ Connection did not open within timeout")
            return False
            
    except Exception as e:
        print(f"❌ Connection test failed: {e}")
        return False
    finally:
        try:
            connection.finish()
        except:
            pass

if __name__ == "__main__":
    result = asyncio.run(test_deepgram_connection())
    sys.exit(0 if result else 1)
