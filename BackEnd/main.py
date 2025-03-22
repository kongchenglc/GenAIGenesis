from fastapi import FastAPI, APIRouter, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from BackEnd.utils.websocketUtil import router as websocket_router
from fastapi.responses import JSONResponse
from typing import Optional
import io

app = FastAPI()

# 配置CORS，确保包含WebSocket
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 直接添加WebSocket路由，不添加前缀
app.include_router(websocket_router)

router = APIRouter()

@app.post("/audio")
async def process_audio(audio: UploadFile = File(...), isActivated: Optional[str] = Form(None)):
    """
    Process audio data from the extension.
    This is a placeholder endpoint that currently just acknowledges receipt of audio.
    In a full implementation, this would use a speech recognition service.
    """
    try:
        # Read the audio file
        audio_bytes = await audio.read()
        
        # For now, return a placeholder response
        # In a real implementation, this would process the audio and return transcription
        return {
            "transcription": "Audio received, but speech recognition not yet implemented",
            "command": {
                "type": "EXECUTE_ACTION",
                "action_type": "notification",
                "message": "Audio received by server"
            }
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Error processing audio: {str(e)}"}
        )

@app.post("/analyze_page")
async def analyze_page(pageContent: dict):
    """
    Analyze page content.
    This is a placeholder endpoint that currently just acknowledges receipt of page content.
    """
    try:
        # For now, return a placeholder response
        return {
            "main_content": "Page analysis received, but not yet implemented in REST API. Use WebSocket for full functionality."
        }
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"error": f"Error analyzing page: {str(e)}"}
        )
        
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)


