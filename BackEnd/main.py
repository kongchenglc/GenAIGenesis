import sys
import os
import base64
import ssl

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
    allow_origins=["chrome-extension://jpjjgcceigohocmjjlmiacfpokenkfff"],
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
        # 读取音频数据
        contents = await audio.read()
        audio_array, sample_rate = sf.read(io.BytesIO(contents))
        
        # 确保音频是单声道
        if len(audio_array.shape) > 1:
            audio_array = np.mean(audio_array, axis=1)
        
        # 处理音频
        text = await voice_processor.process_audio(audio_array, sample_rate)
        
        if not text:
            return {"command": None}
        
        # 处理命令
        command = await command_processor.process_command(text, isActivated)
        return {"command": command}
        
    except Exception as e:
        print(f"Error processing audio: {str(e)}")
        return {"error": str(e)}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket connection established")
    
    try:
        while True:
            # 接收消息
            message = await websocket.receive_text()
            try:
                data = json.loads(message)
                
                if data["type"] == "init":
                    print(f"Received init message: {data}")
                    await websocket.send_json({"status": "initialized"})
                    continue
                
                if data["type"] == "audio_data":
                    # 解码base64音频数据
                    audio_bytes = base64.b64decode(data["data"])
                    
                    try:
                        # 转换WebM音频为WAV格式
                        audio_array, sample_rate = convert_webm_to_wav(audio_bytes)
                        
                        # 处理音频
                        text = await voice_processor.process_audio(audio_array, sample_rate)
                        
                        if text:
                            # 处理命令
                            command = await command_processor.process_command(text, True)
                            await websocket.send_json({"command": command})
                            
                    except Exception as e:
                        print(f"Error processing audio data: {str(e)}")
                        await websocket.send_json({
                            "error": "audio_processing_error",
                            "message": str(e)
                        })
                        
            except json.JSONDecodeError as e:
                print(f"Invalid JSON message: {str(e)}")
                await websocket.send_json({
                    "error": "invalid_json",
                    "message": "Invalid JSON message format"
                })
                
            except Exception as e:
                print(f"Error processing message: {str(e)}")
                await websocket.send_json({
                    "error": "processing_error",
                    "message": str(e)
                })
                
    except WebSocketDisconnect:
        print("WebSocket connection closed")
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
    finally:
        await websocket.close()
        print("WebSocket connection cleaned up")

if __name__ == "__main__":
    # 生成自签名证书的路径
    cert_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'certs')
    os.makedirs(cert_dir, exist_ok=True)
    
    cert_file = os.path.join(cert_dir, 'server.crt')
    key_file = os.path.join(cert_dir, 'server.key')
    
    # 如果证书不存在，生成自签名证书
    if not (os.path.exists(cert_file) and os.path.exists(key_file)):
        print("Generating self-signed certificate...")
        subprocess.run([
            'openssl', 'req', '-x509', '-newkey', 'rsa:4096', '-nodes',
            '-out', cert_file,
            '-keyout', key_file,
            '-days', '365',
            '-subj', '/CN=localhost'
        ], check=True)
        print("Certificate generated successfully")
    
    # 创建SSL上下文
    ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
    ssl_context.load_cert_chain(cert_file, key_file)
    
    # 使用SSL运行服务器
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        ssl_keyfile=key_file,
        ssl_certfile=cert_file
    ) 