from fastapi import FastAPI, HTTPException, WebSocket, Depends, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
import json
import traceback
from typing import Dict, Any

from utils.websocketUtil import router as websocket_router
from utils.page_agent import WebPageAgent
from utils.model_service import ModelService
from schemas.PageSchema import PageContent, PageAnalysisResponse
from schemas.ActionSchema import VoiceCommand, CommandResponse, ActionResponse

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize model service and page agent
model_service = ModelService()
page_agent = WebPageAgent(model_service=model_service)

# Include the WebSocket router
app.include_router(websocket_router, prefix="/ws")

# Dependencies
def get_page_agent():
    return page_agent

@app.get("/")
async def root():
    return {"status": "ok", "message": "GenAIGenesis API is running"}

@app.post("/analyze_page", response_model=PageAnalysisResponse)
async def analyze_page(page_content: PageContent, agent: WebPageAgent = Depends(get_page_agent)):
    """
    Analyze a web page and identify its content and interactive elements
    """
    try:
        print("=== ANALYZE_PAGE ENDPOINT CALLED ===")
        print(f"URL: {page_content.url}")
        print(f"Text length: {len(page_content.text) if page_content.text else 0} characters")
        print(f"HTML length: {len(page_content.html) if page_content.html else 0} characters")
        print(f"Screenshot provided: {page_content.screenshot is not None}")
        
        # Use the agent to analyze the page
        print("Calling agent.analyze_page...")
        result = await agent.analyze_page(
            html=page_content.html,
            text=page_content.text,
            url=page_content.url,
            screenshot=page_content.screenshot
        )
        print("Agent.analyze_page completed")
        
        # Log the result
        print(f"Analysis summary: {result.summary}")
        print(f"Interactive elements found: {len(result.interactive_elements)}")
        print(f"Possible actions: {result.possible_actions}")
        
        # Convert to PageAnalysisResponse
        response = PageAnalysisResponse(
            summary=result.summary,
            interactive_elements=result.interactive_elements,
            possible_actions=result.possible_actions,
            message=f"Page analyzed successfully. {result.summary}"
        )
        
        print(f"Sending response with {len(response.interactive_elements)} interactive elements")
        return response
    except Exception as e:
        print(f"=== ERROR ANALYZING PAGE ===")
        print(f"Exception type: {type(e).__name__}")
        print(f"Exception message: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/process_voice", response_model=CommandResponse)
async def process_voice_command(command: VoiceCommand, agent: WebPageAgent = Depends(get_page_agent)):
    """
    Process a voice command related to page interaction
    """
    try:
        print("=== PROCESS_VOICE ENDPOINT CALLED ===")
        print(f"Command: {command.command}")
        print(f"Page context provided: {command.page_context is not None}")
        if command.page_context:
            print(f"Page context URL: {command.page_context.get('url', 'Not provided')}")
        
        # Use the agent to process the command
        print("Calling agent.process_voice_command...")
        result = await agent.process_voice_command(
            command=command.command,
            page_context=command.page_context
        )
        print("Agent.process_voice_command completed")
        
        # Log the result
        print(f"Action type: {result.get('action_type', 'unknown')}")
        print(f"Element info: {result.get('element_info')}")
        print(f"Message: {result.get('message', 'No message')}")
        print(f"Success: {result.get('success', False)}")
        
        # Return the command response
        response = CommandResponse(
            action_type=result.get("action_type", "unknown"),
            element_info=result.get("element_info"),
            input_text=result.get("input_text"),
            message=result.get("message", "Command processed."),
            success=result.get("success", False)
        )
        
        print(f"Sending response with action_type: {response.action_type}")
        return response
    except Exception as e:
        print(f"=== ERROR PROCESSING VOICE COMMAND ===")
        print(f"Exception type: {type(e).__name__}")
        print(f"Exception message: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/audio")
async def process_audio(
    audio: UploadFile = File(...),
    request: str = Form(None)
):
    """
    Process audio file (speech-to-text) and then process the resulting command
    """
    try:
        print("=== AUDIO ENDPOINT CALLED ===")
        print(f"Request content type: {audio.content_type}")
        print(f"Request filename: {audio.filename}")
        
        # Parse the request if provided
        request_data = {}
        if request:
            try:
                request_data = json.loads(request)
                print(f"Parsed request data: {json.dumps(request_data, indent=2)}")
            except json.JSONDecodeError:
                request_data = {"text": request}
                print(f"Couldn't parse JSON, using as text: {request}")
        else:
            print("No request data provided with audio")
        
        # Read audio content for processing
        audio_content = await audio.read()
        print(f"Audio size: {len(audio_content)} bytes")
        
        # 这里我们不再返回简单响应，而是实际处理音频
        # 获取页面代理实例
        agent = get_page_agent()
        
        # 假设这是一个语音转文字的结果 (实际环境需要集成真实的STT服务)
        # 为了演示，我们返回一个模拟响应，指示系统正在分析页面
        response = {
            "message": "正在分析页面内容，请稍候...",
            "is_activated": True,
            "is_action_required": True,
            "action_items": [
                {
                    "description": "分析当前页面",
                    "action_type": "analyze",
                    "target_element": "",
                    "parameters": {}
                }
            ],
            "success": True
        }
        
        print(f"Sending response: {json.dumps(response, indent=2)}")
        return response
    except Exception as e:
        print(f"=== ERROR PROCESSING AUDIO ===")
        print(f"Exception type: {type(e).__name__}")
        print(f"Exception message: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


