from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from PIL import Image
from io import BytesIO
import json
from summarize import agent_response, FastWebSummarizer, find_website


router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    isOnStartup = True
    await websocket.accept()
    summarizer = None

    try:
        summarizer = FastWebSummarizer()
        await summarizer.start_browser()
        while True:
            data = await websocket.receive_json()
            if isOnStartup:
                if "text" in data:
                    text_message = data["text"]
                    summary, url, onStartup = await find_website(text_message, summarizer)
                    API_response = {    
                        "summary": summary,
                        "url": url,
                        "onStartup": onStartup
                    }
                    if not API_response["onStartup"]:
                        isOnStartup = False
                        JSON_response = {
                            "summary": API_response["summary"],
                            "url": API_response["url"],
                        }
                        await websocket.send_json(JSON_response)
                    else:
                        await websocket.send_json(
                            {
                                "summary": "Please ask a valid request to search the web for",
                                "url": None,
                            }
                        )
                    continue
                else:
                    await websocket.send_json(
                        {
                            "summary": "Please ask a valid request to search the web for",
                            "url": None,
                        }
                    )
                    continue
            if "text" in data:
                text_message = data["text"]
                try:
                    text_response, url = await agent_response(summarizer, text_message)
                    API_response = {
                        "summary": text_response["summary"],
                        "url": url
                    }
                    await websocket.send_json(API_response) 
                except Exception as e:
                    print("Error processing text:", e)
                    await websocket.send_text("Error processing text")
            elif "bytes" in data:
                binary_message = data["bytes"]
                try:
                    image = Image.open(BytesIO(binary_message))
                    # send image to AI
                    API_response = {"summary": "Hello", "elements": "World"}
                    # this custom data type will be filled by the API AI call
                    await websocket.send_json(API_response)
                except Exception as e:
                    print("Error processing image: ", e)
                    await websocket.send_text("Error processing image")
            elif "URL" in data:
                URL_message = data["URL"]
                try:
                    text_response, url = await agent_response(summarizer, URL_message)
                    API_response = {
                        "summary": text_response["summary"],
                        "url": url
                    }
                    await websocket.send_json(API_response)
                except Exception as e:
                    print("Error processing HTML: ", e)
                    await websocket.send_text("Error processing HTML.")
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error in websocket endpoint: {e}")
        await websocket.send_json({"type": "error", "data": {"message": str(e)}})
    finally:
        if summarizer:
            await summarizer.close()
