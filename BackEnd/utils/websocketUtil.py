from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from PIL import Image
from io import BytesIO
import json


router = APIRouter()
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive()
            if "text" in data:
                text_message = data["text"]
                try:
                    #this will be for AI to repond to user text

                    API_response = {
                        "summary": "Hello", 
                        "elements": "World"
                    }
                    two_string_response = json.dumps(API_response)
                    await websocket.send_json(two_string_response)
                
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
                    two_string_response = json.dumps(API_response)

                    await websocket.send_json(two_string_response)
                except Exception as e:
                    print("Error processing image: ", e)
                    await websocket.send_text("Error processing image")
            elif "URL" in data:
                URL_message = data["URL"]
                try:


                    #API call for URL message to Unpacker

                    API_response = {
                        "summary" : "test",
                        "options" : "test",
                        "HTML_Element" : {"testing":"response1"}
                    }

                    JSON_response = json.dumps(API_response)
                    await websocket.send_json(JSON_response)
                except Exception as e:
                    print("Error processing HTML: ", e)
                    await websocket.send_text("Error processing HTML.")         
    except WebSocketDisconnect:
        print("Client disconnected")
