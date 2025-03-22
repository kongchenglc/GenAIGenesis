import sys
import os
import base64
import ssl
import datetime
import platform
import torch

# 添加父目录到Python路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect
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

app = FastAPI()

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，方便测试
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化处理器
voice_processor = VoiceProcessor()
command_processor = CommandProcessor()

def convert_webm_to_wav(webm_data):
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
        webm_file.write(webm_data)
        webm_path = webm_file.name

    wav_path = webm_path + '.wav'
    
    try:
        # 使用FFmpeg将WebM转换为WAV
        subprocess.run([
            'ffmpeg', '-i', webm_path,
            '-acodec', 'pcm_s16le',
            '-ar', '16000',
            '-ac', '1',
            '-y', wav_path
        ], check=True, capture_output=True)

        # 读取转换后的WAV文件
        audio_array, sample_rate = sf.read(wav_path)
        
        # 清理临时文件
        os.unlink(webm_path)
        os.unlink(wav_path)
        
        return audio_array, sample_rate
    except Exception as e:
        # 确保清理临时文件
        if os.path.exists(webm_path):
            os.unlink(webm_path)
        if os.path.exists(wav_path):
            os.unlink(wav_path)
        raise e

@app.post("/audio")
async def process_audio(audio: UploadFile = File(...), isActivated: bool = False):
    try:
        # Read audio data
        contents = await audio.read()
        audio_array, sample_rate = sf.read(io.BytesIO(contents))
        
        # Ensure audio is mono channel
        if len(audio_array.shape) > 1:
            audio_array = np.mean(audio_array, axis=1)
        
        # Process audio
        text = await voice_processor.process_audio(audio_array, sample_rate)
        
        print(f"Recognition result: {text}")
        
        if not text:
            return {"command": None}
        
        # Process command
        command = await command_processor.process_command(text, isActivated)
        if command:
            command["originalText"] = text
            
        return {"command": command or {"originalText": text}}
        
    except Exception as e:
        print(f"Error processing audio: {str(e)}")
        return {"error": str(e)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    client = websocket.client.host
    print(f"WebSocket connection established from {client}")
    
    try:
        while True:
            # Receive message
            print(f"Waiting for message from {client}...")
            message = await websocket.receive_text()
            print(f"Received message from {client}: {message[:50]}...")  # Only print first 50 characters
            
            try:
                data = json.loads(message)
                
                if data["type"] == "init":
                    print(f"Received init message from {client}: {data}")
                    await websocket.send_json({"status": "initialized"})
                    print(f"Sent initialization response to {client}")
                    continue
                
                if data["type"] == "audio_data":
                    # Decode base64 audio data
                    print(f"Received audio data from {client}, decoding...")
                    audio_bytes = base64.b64decode(data["data"])
                    print(f"Decoded audio data size: {len(audio_bytes)} bytes")
                    
                    try:
                        # Convert WebM audio to WAV format
                        print(f"Converting WebM to WAV...")
                        audio_array, sample_rate = convert_webm_to_wav(audio_bytes)
                        print(f"Converted to WAV: {len(audio_array)} samples, {sample_rate}Hz")
                        
                        # Process audio
                        print(f"Processing audio with voice processor...")
                        text = await voice_processor.process_audio(audio_array, sample_rate)
                        print(f"WebSocket recognition result: '{text}'")
                        
                        if text:
                            # Process command
                            print(f"Processing command: '{text}'")
                            command = await command_processor.process_command(text, True)
                            
                            # Add original text
                            if command:
                                command["originalText"] = text
                                print(f"Sending command response to {client}: {command}")
                                await websocket.send_json({"command": command})
                            else:
                                print(f"Sending text-only response to {client}: {text}")
                                await websocket.send_json({"command": {"originalText": text}})
                        else:
                            print(f"No text recognized, sending null command to {client}")
                            await websocket.send_json({"command": None})
                            
                    except Exception as e:
                        print(f"Error processing audio data: {str(e)}")
                        await websocket.send_json({
                            "error": "audio_processing_error",
                            "message": str(e)
                        })
                        
            except json.JSONDecodeError as e:
                print(f"Invalid JSON message from {client}: {str(e)}")
                await websocket.send_json({
                    "error": "invalid_json",
                    "message": "Invalid JSON message format"
                })
                
            except Exception as e:
                print(f"Error processing message from {client}: {str(e)}")
                await websocket.send_json({
                    "error": "processing_error",
                    "message": str(e)
                })
                
    except WebSocketDisconnect:
        print(f"WebSocket connection with {client} closed")
    except Exception as e:
        print(f"WebSocket error with {client}: {str(e)}")
    finally:
        await websocket.close()
        print(f"WebSocket connection with {client} cleaned up")

@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "GenAIGenesis Voice Recognition Server is running",
        "usage": "Please send audio data via WebSocket connection to ws://localhost:8000/ws"
    }

@app.get("/debug")
async def debug():
    return {
        "status": "ok",
        "timestamp": str(datetime.datetime.now()),
        "system_info": {
            "python_version": sys.version,
            "platform": platform.platform(),
            "whisper_model": voice_processor.model.__class__.__name__,
            "cuda_available": str(torch.cuda.is_available())
        }
    }

if __name__ == "__main__":
    # 使用HTTP运行服务器
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    ) 