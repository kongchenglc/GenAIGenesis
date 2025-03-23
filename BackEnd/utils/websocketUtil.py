from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from PIL import Image
from io import BytesIO
import json
from summarize import FastWebSummarizer, agent_response


router = APIRouter()
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            if "text" in data:
                text_message = data["text"]
                try:
                    await websocket.send_text("hi")
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
                     #this custom data type will be filled by the API AI call
                    await websocket.send_json(API_response)
                except Exception as e:
                    print("Error processing image: ", e)
                    await websocket.send_text("Error processing image")
            elif "URL" in data:
                URL_message = data["URL"]
                try:
                    summarizer = FastWebSummarizer()
                    text_response, goto_url = agent_response(summarizer, URL_message)
                    API_response = {
                        "summary": text_response,
                        "url": goto_url
                    }
                    await websocket.send_json(API_response)
                    await summarizer.close()
                except Exception as e:
                    print("Error processing HTML: ", e)
                    await websocket.send_text("Error processing HTML.")         
    except WebSocketDisconnect:
        print("Client disconnected")