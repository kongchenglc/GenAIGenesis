from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from PIL import Image
from io import BytesIO
import json
from summarize import agent_response, FastWebSummarizer, generate_nav_options


router = APIRouter()
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    summarizer = None
    current_url = None
    
    try:
        while True:
            data = await websocket.receive_json()
            
            if "URL" in data:
                # Initial URL load
                URL_message = data["URL"]
                try:
                    # Initialize summarizer if not exists
                    if not summarizer:
                        summarizer = FastWebSummarizer()
                        current_url = URL_message
                    
                    # Get initial response
                    response, new_url = await agent_response(summarizer, URL_message, "")
                    API_response = {
                        "summary": response["summary"],
                        "url": new_url
                    }
                    await websocket.send_json(API_response)
                except Exception as e:
                    print("Error processing URL: ", e)
                    await websocket.send_text("Error processing URL.")
                    
            elif "text" in data and summarizer and current_url:
                # Handle user input
                text_message = data["text"]
                try:
                    response, new_url = await agent_response(summarizer, current_url, text_message)
                    current_url = new_url  # Update current URL if navigation occurred
                    
                    API_response = {
                        "summary": response["summary"],
                        "url": current_url
                    }
                    await websocket.send_json(API_response)
                except Exception as e:
                    print("Error processing text:", e)
                    await websocket.send_text("Error processing text")
                    
            elif "bytes" in data:
                binary_message = data["bytes"]
                try:
                    image = Image.open(BytesIO(binary_message))
                    #send image to AI
                    API_response = {
                        "summary": "Hello",
                        "elements": "World"
                    }
                    await websocket.send_json(API_response)
                except Exception as e:
                    print("Error processing image: ", e)
                    await websocket.send_text("Error processing image")
                    
    except WebSocketDisconnect:
        print("Client disconnected")
        if summarizer:
            await summarizer.close()
    except Exception as e:
        print("Error: ", e)
        if summarizer:
            await summarizer.close()
