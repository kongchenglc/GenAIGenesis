import sys
import os
import base64
import ssl
import datetime
import platform
import torch
import traceback
from pydantic import BaseModel


# Add parent directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Add current directory to Python path to help with module resolution
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import asyncio
from typing import List, Dict, Any
import numpy as np
import soundfile as sf
import io
import json
import subprocess
import tempfile
from Agents.voice_processor import VoiceProcessor
from Agents.command_processor import CommandProcessor

from schemas.PageSchema import PageContent
from schemas.ActionSchema import ActionItem

# Try to import BeautifulSoup early to detect issues
try:
    from bs4 import BeautifulSoup
    print("BeautifulSoup imported successfully")
except ImportError as e:
    print(f"Warning: BeautifulSoup import failed: {e}")
    print("Page analysis functionality may not work correctly")

# Core data models
class PageContent(BaseModel):
    """Model for page content data"""
    html: str
    text: str
    url: str

class ActionItem(BaseModel):
    """Model for action items"""
    description: str
    action_type: str
    target_element: str = None
    parameters: dict = None

class AudioProcessor:
    """Handles audio file conversion and processing"""
    def __init__(self, target_sample_rate=16000):
        self.target_sample_rate = target_sample_rate
    
    def convert_webm_to_wav(self, webm_data):
        """Convert WebM audio data to WAV format"""
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
            webm_file.write(webm_data)
            webm_path = webm_file.name

        wav_path = webm_path + '.wav'
        
        try:
            # Use FFmpeg to convert WebM to WAV
            subprocess.run([
                'ffmpeg', '-i', webm_path,
                '-acodec', 'pcm_s16le',
                '-ar', str(self.target_sample_rate),
                '-ac', '1',
                '-y', wav_path
            ], check=True, capture_output=True)

            # Read the converted WAV file
            audio_array, sample_rate = sf.read(wav_path)
            
            # Clean up temporary files
            os.unlink(webm_path)
            os.unlink(wav_path)
            
            return audio_array, sample_rate
        except Exception as e:
            # Ensure temporary files are cleaned up
            if os.path.exists(webm_path):
                os.unlink(webm_path)
            if os.path.exists(wav_path):
                os.unlink(wav_path)
            raise e

class AssistantAPI:
    """Main API class that handles endpoints and processing"""
    def __init__(self):
        self.app = FastAPI()
        self.setup_middleware()
        self.setup_routes()
        
        # Initialize processors
        self.voice_processor = VoiceProcessor()
        self.command_processor = CommandProcessor()
        self.audio_processor = AudioProcessor()
        
        # Active client connections
        self.active_connections = {}
    
    def setup_middleware(self):
        """Configure middleware for the application"""
        self.app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],  # Allow all origins
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
    
    def setup_routes(self):
        """Set up API routes"""
        # HTTP endpoints
        self.app.post("/audio")(self.process_audio)
        self.app.post("/analyze_page")(self.analyze_page)
        self.app.get("/")(self.root)
        
        # WebSocket endpoint
        self.app.websocket("/ws")(self.websocket_endpoint)
    
    async def process_audio(self, audio: UploadFile = File(...), isActivated: bool = False):
        """Process audio file uploads"""
        try:
            # Read the audio file
            audio_data = await audio.read()
            
            # Convert audio to the required format
            audio_array, sample_rate = self.audio_processor.convert_webm_to_wav(audio_data)
            
            # Process the audio with the voice processor
            transcription = await self.voice_processor.process_audio(audio_array, sample_rate)
            
            # Process the transcribed command
            command_result = await self.command_processor.process_command(transcription, isActivated)
            
            # Return the results
            return {
                "success": True,
                "transcription": transcription,
                "command": command_result
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "transcription": "",
                "command": None
            }
    
    async def websocket_endpoint(self, websocket: WebSocket):
        """Handle WebSocket connections"""
        await websocket.accept()
        client_id = id(websocket)
        self.active_connections[client_id] = websocket
        
        try:
            while True:
                # Receive message from client
                data = await websocket.receive_text()
                message = json.loads(data)
                
                # Process different message types
                if message.get("type") == "audio":
                    await self.handle_audio_message(websocket, message)
                elif message.get("type") == "analyze_page":
                    await self.handle_page_analysis(websocket, message)
                else:
                    await websocket.send_json({
                        "success": False,
                        "error": "Unknown message type"
                    })
        except WebSocketDisconnect:
            # Clean up on disconnect
            if client_id in self.active_connections:
                del self.active_connections[client_id]
        except Exception as e:
            # Handle other exceptions
            try:
                await websocket.send_json({
                    "success": False,
                    "error": str(e)
                })
            except:
                pass
            
            # Clean up on error
            if client_id in self.active_connections:
                del self.active_connections[client_id]
    
    async def handle_audio_message(self, websocket: WebSocket, message: Dict):
        """Process audio data received via WebSocket"""
        try:
            # Get audio data and convert from base64 if needed
            audio_data = message.get("audio_data")
            is_activated = message.get("is_activated", False)
            
            # Further implementation would go here
            
            # Send response
            await websocket.send_json({
                "success": True,
                "message": "Audio processed"
            })
        except Exception as e:
            await websocket.send_json({
                "success": False,
                "error": str(e)
            })
    
    async def handle_page_analysis(self, websocket: WebSocket, message: Dict):
        """Process page analysis requests via WebSocket"""
        # Implementation would go here
        pass
    
    async def analyze_page(self, page_content: PageContent):
        """Analyze page content"""
        # Implementation would go here
        return {"success": True, "message": "Page analyzed"}
    
    async def root(self):
        """Root endpoint"""
        return {"status": "running"}

# Create the API instance
api = AssistantAPI()
app = api.app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000) 