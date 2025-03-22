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
    try:
        # Initialize the summarizer once
        summarizer = FastWebSummarizer()
        while True:
            data = await websocket.receive_json()
            if "text" in data:
                text_message = data["text"]
                try:
                    # Process text as a query for the current page
                    if hasattr(summarizer, 'current_url') and summarizer.current_url:
                        specific_info = await summarizer.get_specific_info(summarizer.current_url, text_message)
                        await websocket.send_json({
                            "summary": specific_info,
                        })
                    else:
                        await websocket.send_text("Please first provide a URL to analyze.")
                except Exception as e:
                    print("Error processing text:", e)
                    await websocket.send_text(f"Error processing text: {str(e)}")
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
                    # Store current URL for future queries
                    summarizer.current_url = URL_message
                    
                    # Get summary and navigation options
                    summary, links = await summarizer.quick_summarize(URL_message)
                    navigation_summarize = generate_nav_options(links)
                    text_response, nav_options = agent_response(summary, navigation_summarize)
                    API_response = {
                        "summary": text_response,
                        "options": nav_options
                    }
                    await websocket.send_json(API_response)
                except Exception as e:
                    print("Error processing URL: ", e)
                    await websocket.send_text(f"Error processing URL: {str(e)}")
            elif "audio" in data:
                # Handle audio data (stub for now)
                try:
                    # Currently we'll just acknowledge audio with a placeholder
                    # In a real implementation, this would use speech-to-text
                    await websocket.send_json({
                        "transcription": "Audio received but speech-to-text not implemented yet"
                    })
                except Exception as e:
                    print("Error processing audio: ", e)
                    await websocket.send_text(f"Error processing audio: {str(e)}")
    except WebSocketDisconnect:
        print("Client disconnected")
    finally:
        # Clean up resources
        if summarizer:
            await summarizer.close()
