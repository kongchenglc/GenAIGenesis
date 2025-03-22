from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from PIL import Image
from io import BytesIO
import json
import base64
from typing import Dict, Any

# Import agent and schemas
from .page_agent import WebPageAgent
from .model_service import ModelService
from schemas.PageSchema import PageContent, ElementInfo
from schemas.ActionSchema import VoiceCommand, ActionItem, ActionResponse

# Initialize router
router = APIRouter()

# Initialize model service and page agent
model_service = ModelService()
page_agent = WebPageAgent(model_service=model_service)

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("=== WebSocket connection established ===")
    
    try:
        while True:
            try:
                data = await websocket.receive()
                print(f"=== WebSocket received data type: {list(data.keys())} ===")
                
                if "text" in data:
                    # Handle text message (likely a voice command)
                    text_message = data["text"]
                    print(f"WebSocket received text: {text_message[:100]}...")
                    try:
                        # Parse as JSON if possible
                        try:
                            command_data = json.loads(text_message)
                            print(f"Parsed JSON command data: {json.dumps(command_data, indent=2)}")
                            
                            # Check if this is a structured voice command
                            if "command" in command_data:
                                print(f"Processing structured voice command: {command_data['command']}")
                                # Create a VoiceCommand
                                command = VoiceCommand(
                                    command=command_data["command"],
                                    page_context=command_data.get("page_context")
                                )
                                
                                # Process the command
                                print("Calling page_agent.process_voice_command...")
                                result = await page_agent.process_voice_command(
                                    command=command.command,
                                    page_context=command.page_context
                                )
                                print(f"Command processing result: {json.dumps(result, indent=2)}")
                                
                                # Create response
                                response = {
                                    "message": result.get("message", "Command processed."),
                                    "action_type": result.get("action_type", "unknown"),
                                    "is_activated": True,
                                    "success": result.get("success", False)
                                }
                                
                                # Add element info if present
                                element_info = result.get("element_info")
                                if element_info:
                                    response["element_info"] = element_info
                                
                                # Add input text if present
                                input_text = result.get("input_text")
                                if input_text:
                                    response["input_text"] = input_text
                                
                                # Send response
                                print(f"Sending response: {json.dumps(response, indent=2)}")
                                await websocket.send_json(response)
                            else:
                                # Treat as a simple text message
                                print("Treating as simple text message")
                                await websocket.send_json({
                                    "message": f"Received text message: {text_message}",
                                    "is_activated": True
                                })
                        except json.JSONDecodeError:
                            # Not a JSON message, treat as plain text command
                            print(f"Not JSON, treating as plain text command: {text_message}")
                            result = await page_agent.process_voice_command(command=text_message)
                            print(f"Command processing result: {json.dumps(result, indent=2)}")
                            await websocket.send_json({
                                "message": result.get("message", "Command processed."),
                                "is_activated": True
                            })
                    except Exception as e:
                        print(f"=== ERROR processing WebSocket text ===")
                        print(f"Exception type: {type(e).__name__}")
                        print(f"Exception message: {str(e)}")
                        import traceback
                        traceback.print_exc()
                        await websocket.send_json({
                            "message": f"Error processing text: {str(e)}",
                            "is_activated": False
                        })
                
                elif "bytes" in data:
                    # Handle binary message (likely a screenshot or audio)
                    binary_message = data["bytes"]
                    print(f"WebSocket received binary data: {len(binary_message)} bytes")
                    try:
                        # Try to process as page data first
                        try:
                            # Check if it's binary encoded JSON
                            try:
                                text_data = binary_message.decode('utf-8')
                                print(f"Successfully decoded binary as UTF-8 text: {text_data[:100]}...")
                                page_data = json.loads(text_data)
                                print(f"Successfully parsed as JSON: {json.dumps(list(page_data.keys()), indent=2)}")
                                
                                # Check if it contains page content
                                if all(key in page_data for key in ["html", "url"]):
                                    print("Processing as page content...")
                                    # Process as page content
                                    analysis_result = await page_agent.analyze_page(
                                        html=page_data["html"],
                                        text=page_data.get("text", ""),
                                        url=page_data["url"],
                                        screenshot=page_data.get("screenshot")
                                    )
                                    print("Page analysis complete")
                                    
                                    # Create response
                                    response = {
                                        "summary": analysis_result.summary,
                                        "possible_actions": analysis_result.possible_actions,
                                        "message": f"Page analyzed. {analysis_result.summary}",
                                        "is_activated": True,
                                        "is_action_required": False
                                    }
                                    
                                    print(f"Sending page analysis response: {json.dumps(response, indent=2)}")
                                    await websocket.send_json(response)
                                    continue  # Skip the rest of the processing
                                else:
                                    print("Binary data contains JSON but not page content fields")
                            except (UnicodeDecodeError, json.JSONDecodeError) as decode_error:
                                # Not text data or not valid JSON
                                print(f"Binary is not JSON: {type(decode_error).__name__}: {str(decode_error)}")
                                pass
                        except Exception as content_error:
                            print(f"=== ERROR processing as page content ===")
                            print(f"Exception type: {type(content_error).__name__}")
                            print(f"Exception message: {str(content_error)}")
                            import traceback
                            traceback.print_exc()
                        
                        # Try to process as image
                        try:
                            print("Attempting to process as image...")
                            image = Image.open(BytesIO(binary_message))
                            print(f"Successfully parsed as image: {image.format} {image.size}px")
                            
                            # Convert to base64 for storage/processing
                            buffered = BytesIO()
                            image.save(buffered, format="PNG")
                            img_base64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
                            print(f"Converted image to base64 (length: {len(img_base64)})")
                            
                            # Send response indicating we received an image
                            await websocket.send_json({
                                "message": "Received an image. Please also send page content (HTML and URL) for analysis.",
                                "is_activated": True
                            })
                        except Exception as image_error:
                            print(f"=== ERROR processing as image ===")
                            print(f"Exception type: {type(image_error).__name__}")
                            print(f"Exception message: {str(image_error)}")
                            import traceback
                            traceback.print_exc()
                            
                            print("Attempting to process as audio data...")
                            # You would add audio processing logic here
                            await websocket.send_json({
                                "message": "Received binary data but could not process it as an image or page content.",
                                "is_activated": False
                            })
                            
                    except Exception as e:
                        print(f"Error processing binary message: {e}")
                        await websocket.send_json({
                            "message": f"Error processing binary data: {str(e)}",
                            "is_activated": False
                        })
                
                elif "page_data" in data:
                    # Handle structured page data
                    page_data_str = data["page_data"]
                    try:
                        # Parse the page data
                        page_data = json.loads(page_data_str)
                        
                        # Create PageContent object
                        page_content = PageContent(
                            html=page_data["html"],
                            text=page_data.get("text", ""),
                            url=page_data["url"],
                            screenshot=page_data.get("screenshot")
                        )
                        
                        # Process with the page agent
                        analysis_result = await page_agent.analyze_page(
                            html=page_content.html,
                            text=page_content.text,
                            url=page_content.url,
                            screenshot=page_content.screenshot
                        )
                        
                        # Create response
                        interactive_elements = analysis_result.interactive_elements
                        
                        # Convert to action items
                        action_items = []
                        for element in interactive_elements:
                            if element.element_type == "button" and element.text:
                                action_items.append({
                                    "description": f"Click the {element.text} button",
                                    "action_type": "click",
                                    "target_element": element.css_selector or "",
                                    "element_info": element.dict()
                                })
                            elif element.element_type == "input":
                                field_name = element.text or element.name or "text field"
                                action_items.append({
                                    "description": f"Enter text in the {field_name} field",
                                    "action_type": "input",
                                    "target_element": element.css_selector or "",
                                    "element_info": element.dict()
                                })
                        
                        response = {
                            "summary": analysis_result.summary,
                            "possible_actions": analysis_result.possible_actions,
                            "action_items": action_items,
                            "message": f"Page analyzed. {analysis_result.summary}",
                            "is_activated": True,
                            "is_action_required": len(action_items) > 0
                        }
                        
                        await websocket.send_json(response)
                        
                    except Exception as e:
                        print(f"Error processing page data: {e}")
                        await websocket.send_json({
                            "message": f"Error processing page data: {str(e)}",
                            "is_activated": False
                        })
                        
            except WebSocketDisconnect:
                print("WebSocket disconnected in inner loop")
                break  # Exit the loop if client disconnects
                
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {str(e)}")
    finally:
        print("WebSocket connection closed")
