import sys
import os
import base64
import ssl
import datetime
import platform
import torch
import traceback
from pydantic import BaseModel


# Add parent directory to Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# Add current directory to Python path to help with module resolution
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, UploadFile, File, WebSocket, WebSocketDisconnect, Request
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

from schemas.PageSchema import PageContent
from schemas.ActionSchema import ActionItem

# Try to import BeautifulSoup early to detect issues
try:
    from bs4 import BeautifulSoup
    print("BeautifulSoup imported successfully")
except ImportError as e:
    print(f"Warning: BeautifulSoup import failed: {e}")
    print("Page analysis functionality may not work correctly")



app = FastAPI()

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize processors
voice_processor = VoiceProcessor()
command_processor = CommandProcessor()

def convert_webm_to_wav(webm_data):
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as webm_file:
        webm_file.write(webm_data)
        webm_path = webm_file.name

    wav_path = webm_path + '.wav'
    
    try:
        # Use FFmpeg to convert WebM to WAV
        subprocess.run([
            'ffmpeg', '-i', webm_path,
            '-acodec', 'pcm_s16le',
            '-ar', '16000',
            '-ac', '1',
            '-y', wav_path
        ], check=True, capture_output=True)

        # Read the converted WAV file
        audio_array, sample_rate = sf.read(wav_path)
        
        # Clean up temporary files
        os.unlink(webm_path)
        os.unlink(wav_path)
        
        return audio_array, sample_rate
    except Exception as e:
        # Ensure temporary files are cleaned up
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
    client = f"{websocket.client.host}:{websocket.client.port}"
    print(f"WebSocket connection established with {client}")
    
    try:
        # Send greeting message
        await websocket.send_json({
            "message": "Connected to GenAIGenesis Voice Recognition Server",
            "status": "ready"
        })
        
        while True:
            # Receive message
            message = await websocket.receive_text()
            print(f"Received message from {client}: {message[:100]}...")  # Only print first 100 characters
            
            try:
                data = json.loads(message)
                
                if data.get("type") == "init":
                    print(f"Received init message from {client}: {data}")
                    await websocket.send_json({"status": "initialized"})
                    print(f"Sent initialization response to {client}")
                    continue
                
                if data.get("type") == "text_data":
                    # Process text directly without audio conversion
                    print(f"Received text data from {client}: {data['text']}")
                    
                    try:
                        text = data["text"].lower().strip()
                        print(f"Processing text: '{text}'")
                        
                        if text:
                            # Process command
                            print(f"Processing command: '{text}'")
                            command = await command_processor.process_command(text, True)
                            
                            # Handle different command types
                            if command:
                                command["originalText"] = text
                                
                                # Handle page analysis command
                                if command.get("type") == "PAGE_ANALYSIS":
                                    print(f"Page analysis command detected: {command}")
                                    await websocket.send_json({
                                        "type": "EXECUTE_ACTION",
                                        "action_type": "analyze_page",
                                        "target": "page_content",
                                        "originalText": text
                                    })
                                # Handle action execution command
                                elif command.get("type") == "EXECUTE_ACTION":
                                    print(f"Action execution command detected: {command}")
                                    await websocket.send_json({
                                        "type": "EXECUTE_ACTION",
                                        "action_type": command.get("action_type"),
                                        "target": command.get("target"),
                                        "value": command.get("value", ""),
                                        "element_type": command.get("element_type", "unknown"),
                                        "element_attributes": command.get("element_attributes", {}),
                                        "originalText": text
                                    })
                                else:
                                    print(f"Sending command response to {client}: {command}")
                                    await websocket.send_json({"command": command})
                            else:
                                print(f"Sending text-only response to {client}: {text}")
                                await websocket.send_json({"command": {"originalText": text}})
                        else:
                            print(f"Empty text received, sending null command to {client}")
                            await websocket.send_json({"command": None})
                            
                    except Exception as e:
                        print(f"Error processing text data: {str(e)}")
                        await websocket.send_json({
                            "error": "text_processing_error",
                            "message": str(e)
                        })
                
                elif data.get("type") == "audio_data":
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
                            
                            # Handle different command types with original text
                            if command:
                                command["originalText"] = text
                                
                                # Handle page analysis command
                                if command.get("type") == "PAGE_ANALYSIS":
                                    print(f"Page analysis command detected: {command}")
                                    await websocket.send_json({
                                        "type": "EXECUTE_ACTION",
                                        "action_type": "analyze_page",
                                        "target": "page_content",
                                        "originalText": text
                                    })
                                # Handle action execution command
                                elif command.get("type") == "EXECUTE_ACTION":
                                    print(f"Action execution command detected: {command}")
                                    await websocket.send_json({
                                        "type": "EXECUTE_ACTION",
                                        "action_type": command.get("action_type"),
                                        "target": command.get("target"),
                                        "value": command.get("value", ""),
                                        "element_type": command.get("element_type", "unknown"),
                                        "element_attributes": command.get("element_attributes", {}),
                                        "originalText": text
                                    })
                                else:
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

                # Process page content for analysis
                elif data.get("type") == "page_content":
                    print(f"Received page content from {client} for analysis")
                    try:
                        # Create PageContent object
                        page_content = PageContent(
                            html=data.get("html", ""),
                            text=data.get("text", ""),
                            url=data.get("url", "")
                        )
                        
                        # Call analyze_page function
                        analysis_result = await analyze_page(page_content)
                        
                        # Send analysis results back to client
                        await websocket.send_json({
                            "type": "PAGE_ANALYSIS_RESULT",  # Updated type to match what the frontend expects
                            "main_content": analysis_result.get("main_content", ""),
                            "actions": analysis_result.get("actions", []),
                            "error": analysis_result.get("error", None)
                        })
                        
                    except Exception as e:
                        print(f"Error analyzing page content: {str(e)}")
                        await websocket.send_json({
                            "type": "PAGE_ANALYSIS_RESULT", 
                            "main_content": "Error analyzing page content",
                            "actions": [],
                            "error": str(e)
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

@app.post("/analyze_page")
async def analyze_page(page_content: PageContent):
    try:
        print(f"[PAGE ANALYSIS] Starting for URL: {page_content.url}")
        print(f"[PAGE ANALYSIS] HTML size: {len(page_content.html)} bytes, Text size: {len(page_content.text)} bytes")
        
        # Check for empty input
        if not page_content.html or len(page_content.html) < 100:
            print("[PAGE ANALYSIS] ERROR: HTML content too short or empty")
            return {
                "main_content": "Could not analyze page - HTML content too short or empty",
                "actions": [
                    ActionItem(
                        description="Go back to previous page",
                        action_type="navigate",
                        parameters={"action": "back"}
                    ).dict()
                ],
                "error": "HTML content too short or empty"
            }
        
        # Extract relevant information
        url = page_content.url
        text = page_content.text[:5000]  # Limit text to avoid token limits
        html_preview = page_content.html[:20000]  # Increase HTML limit for better analysis
        
        print(f"[PAGE ANALYSIS] URL being analyzed: {url}")
        print(f"[PAGE ANALYSIS] HTML preview length: {len(html_preview)} characters")
        
        # Initialize variables
        main_content = "Webpage content"
        actions = []
        
        # Process with HTML parsing
        try:
            print("[PAGE ANALYSIS] Attempting to parse HTML with BeautifulSoup...")
            # Try different parsers in order of preference
            parsers = ['lxml', 'html.parser', 'html5lib']
            soup = None
            parsing_error = None
            
            for parser in parsers:
                try:
                    print(f"[PAGE ANALYSIS] Trying parser: {parser}")
                    soup = BeautifulSoup(html_preview, parser)
                    if soup:
                        print(f"[PAGE ANALYSIS] Successfully parsed HTML using {parser}")
                        break
                except Exception as e:
                    parsing_error = f"Parser {parser} failed: {str(e)}"
                    print(f"[PAGE ANALYSIS] ERROR: {parsing_error}")
                    continue
            
            if not soup:
                raise Exception(f"All HTML parsers failed. Last error: {parsing_error}")
            
            # Check soup object is valid
            print(f"[PAGE ANALYSIS] BeautifulSoup object created: {soup is not None}")
            if soup:
                print(f"[PAGE ANALYSIS] First 100 characters of parsed HTML: {str(soup)[:100]}")
            
            # Extract page title for better main content description
            title = "Unknown page"
            if soup and soup.title:
                title = soup.title.string if soup.title.string else "Unknown page"
                print(f"[PAGE ANALYSIS] Page title: {title}")
            else:
                print("[PAGE ANALYSIS] WARNING: No page title found")
            
            # Extract headings to understand page structure
            headings = []
            if soup:
                headings = [h.text.strip() for h in soup.find_all(['h1', 'h2', 'h3']) if h and h.text and h.text.strip()]
                print(f"[PAGE ANALYSIS] Found {len(headings)} headings")
                if headings:
                    print(f"[PAGE ANALYSIS] First heading: {headings[0]}")
            
            # Extract meta description if available
            meta_desc = None
            if soup:
                meta_tag = soup.find('meta', attrs={'name': 'description'})
                if meta_tag and 'content' in meta_tag.attrs:
                    meta_desc = meta_tag['content']
                    print(f"[PAGE ANALYSIS] Meta description: {meta_desc}")
                else:
                    print("[PAGE ANALYSIS] No meta description found")
                    
            # Determine main content from title, headings and meta description
            if meta_desc:
                main_content = meta_desc
            elif headings and len(headings) > 0:
                main_content = f"{title} - {headings[0]}"
            else:
                main_content = title
                
            print(f"[PAGE ANALYSIS] Main content description: {main_content}")
                
            # Find all buttons
            if soup:
                print("[PAGE ANALYSIS] Searching for buttons...")
                buttons = []
                for btn in soup.find_all(['button', 'input']):
                    if not btn:
                        continue
                        
                    if btn.name == 'input' and btn.get('type') not in ['button', 'submit', 'reset']:
                        continue
                    
                    # Get button text or value
                    btn_text = ""
                    if btn.name == 'button':
                        btn_text = btn.text.strip() if btn.text else ""
                    else:
                        btn_text = btn.get('value', '')
                    
                    if not btn_text:
                        btn_text = btn.get('aria-label', '')
                    if not btn_text:
                        btn_text = btn.get('name', '')
                    if not btn_text:
                        btn_text = btn.get('id', '')
                        
                    if btn_text:
                        print(f"[PAGE ANALYSIS] Found button: {btn_text}")
                        # Create a CSS selector for this button
                        selector = ""
                        if btn.get('id'):
                            selector = f"#{btn.get('id')}"
                        elif btn.get('name'):
                            selector = f"{btn.name}[name='{btn.get('name')}']"
                        elif btn.get('class'):
                            selector = f"{btn.name}.{'.'.join(btn.get('class'))}"
                        else:
                            selector = btn.name
                            
                        print(f"[PAGE ANALYSIS] Button selector: {selector}")
                            
                        # Add to actions list
                        actions.append(
                            ActionItem(
                                description=f"Click {btn_text} button",
                                action_type="click",
                                target_element=selector,
                                element_type="button",
                                element_attributes={"text": btn_text}
                            )
                        )
                
                # Find all links with text
                print("[PAGE ANALYSIS] Searching for links...")
                for link in soup.find_all('a'):
                    if not link:
                        continue
                        
                    link_text = link.text.strip() if link.text else ""
                    if link_text and len(link_text) < 50:  # Avoid overly long link texts
                        href = link.get('href', '')
                        print(f"[PAGE ANALYSIS] Found link: {link_text} (href: {href[:30]}{'...' if len(href) > 30 else ''})")
                        
                        # Create a CSS selector for this link
                        selector = ""
                        if link.get('id'):
                            selector = f"#{link.get('id')}"
                        elif link.get('name'):
                            selector = f"a[name='{link.get('name')}']"
                        elif href:
                            selector = f"a[href='{href}']"
                        elif link.get('class'):
                            selector = f"a.{'.'.join(link.get('class'))}"
                        else:
                            # Use the link text as a fallback
                            selector = f"a:contains('{link_text}')"
                            
                        # Add to actions list
                        actions.append(
                            ActionItem(
                                description=f"Click on '{link_text}' link",
                                action_type="click",
                                target_element=selector,
                                element_type="link",
                                element_attributes={"text": link_text, "href": href}
                            )
                        )
                
                # Find all input fields
                print("[PAGE ANALYSIS] Searching for input fields...")
                for inp in soup.find_all('input'):
                    if not inp:
                        continue
                        
                    input_type = inp.get('type', 'text')
                    
                    # Skip buttons, already handled
                    if input_type in ['button', 'submit', 'reset']:
                        continue
                        
                    # Get input name/id/placeholder
                    input_name = inp.get('name', '')
                    input_id = inp.get('id', '')
                    input_placeholder = inp.get('placeholder', '')
                    
                    print(f"[PAGE ANALYSIS] Found input field: type={input_type}, name={input_name}, id={input_id}")
                    
                    # Determine input description
                    input_desc = ""
                    if input_placeholder:
                        input_desc = input_placeholder
                    elif input_name:
                        input_desc = input_name.replace('-', ' ').replace('_', ' ').title()
                    elif input_id:
                        input_desc = input_id.replace('-', ' ').replace('_', ' ').title()
                    else:
                        input_desc = f"{input_type} field"
                        
                    # Create a CSS selector for this input
                    selector = ""
                    if input_id:
                        selector = f"#{input_id}"
                    elif input_name:
                        selector = f"input[name='{input_name}']"
                    else:
                        selector = f"input[type='{input_type}']"
                        
                    # Add to actions list
                    if input_type in ['text', 'email', 'password', 'search', 'tel', 'url', 'number']:
                        actions.append(
                            ActionItem(
                                description=f"Enter text in {input_desc}",
                                action_type="input",
                                target_element=selector,
                                element_type="input",
                                parameters={"placeholder": f"Enter {input_desc}"},
                                element_attributes={"type": input_type, "name": input_name, "id": input_id, "placeholder": input_placeholder}
                            )
                        )
                    elif input_type == 'checkbox':
                        actions.append(
                            ActionItem(
                                description=f"Toggle {input_desc} checkbox",
                                action_type="click",
                                target_element=selector,
                                element_type="checkbox",
                                element_attributes={"name": input_name, "id": input_id}
                            )
                        )
                    elif input_type == 'radio':
                        actions.append(
                            ActionItem(
                                description=f"Select {input_desc} option",
                                action_type="click",
                                target_element=selector,
                                element_type="radio",
                                element_attributes={"name": input_name, "id": input_id}
                            )
                        )
                
                # Find all textareas
                print("[PAGE ANALYSIS] Searching for textareas...")
                for textarea in soup.find_all('textarea'):
                    if not textarea:
                        continue
                        
                    # Get textarea name/id/placeholder
                    textarea_name = textarea.get('name', '')
                    textarea_id = textarea.get('id', '')
                    textarea_placeholder = textarea.get('placeholder', '')
                    
                    print(f"[PAGE ANALYSIS] Found textarea: name={textarea_name}, id={textarea_id}")
                    
                    # Determine textarea description
                    textarea_desc = ""
                    if textarea_placeholder:
                        textarea_desc = textarea_placeholder
                    elif textarea_name:
                        textarea_desc = textarea_name.replace('-', ' ').replace('_', ' ').title()
                    elif textarea_id:
                        textarea_desc = textarea_id.replace('-', ' ').replace('_', ' ').title()
                    else:
                        textarea_desc = "textarea"
                        
                    # Create a CSS selector for this textarea
                    selector = ""
                    if textarea_id:
                        selector = f"#{textarea_id}"
                    elif textarea_name:
                        selector = f"textarea[name='{textarea_name}']"
                    else:
                        selector = "textarea"
                        
                    # Add to actions list
                    actions.append(
                        ActionItem(
                            description=f"Enter text in {textarea_desc}",
                            action_type="input",
                            target_element=selector,
                            element_type="textarea",
                            parameters={"placeholder": f"Enter {textarea_desc}"},
                            element_attributes={"name": textarea_name, "id": textarea_id, "placeholder": textarea_placeholder}
                        )
                    )
                
                # Find all select/dropdown elements
                print("[PAGE ANALYSIS] Searching for select/dropdown elements...")
                for select in soup.find_all('select'):
                    if not select:
                        continue
                        
                    # Get select name/id
                    select_name = select.get('name', '')
                    select_id = select.get('id', '')
                    
                    print(f"[PAGE ANALYSIS] Found select element: name={select_name}, id={select_id}")
                    
                    # Determine select description
                    select_desc = ""
                    if select_name:
                        select_desc = select_name.replace('-', ' ').replace('_', ' ').title()
                    elif select_id:
                        select_desc = select_id.replace('-', ' ').replace('_', ' ').title()
                    else:
                        select_desc = "dropdown"
                        
                    # Create a CSS selector for this select
                    selector = ""
                    if select_id:
                        selector = f"#{select_id}"
                    elif select_name:
                        selector = f"select[name='{select_name}']"
                    else:
                        selector = "select"
                        
                    # Add to actions list
                    actions.append(
                        ActionItem(
                            description=f"Select from {select_desc} dropdown",
                            action_type="click",
                            target_element=selector,
                            element_type="select",
                            element_attributes={"name": select_name, "id": select_id}
                        )
                    )
                    
        except Exception as e:
            print(f"[PAGE ANALYSIS] ERROR in HTML parsing: {str(e)}")
            traceback_str = traceback.format_exc()
            print(f"[PAGE ANALYSIS] Traceback: {traceback_str}")
            # Continue with alternative analysis methods
        
        # If no actions found from HTML parsing, try alternative methods
        if len(actions) == 0:
            print("[PAGE ANALYSIS] No actions found from HTML parsing, trying alternative methods")
            
            # Check for domain-specific patterns
            domain = url.split('/')[2] if '//' in url else url.split('/')[0]
            print(f"[PAGE ANALYSIS] Using domain-specific patterns for: {domain}")
            
            if "amazon.com" in domain or "amazon." in domain:
                print("[PAGE ANALYSIS] Detected Amazon domain, adding Amazon-specific actions")
                main_content = "Amazon shopping page with products and search functionality"
                
                # Look for common elements in Amazon pages
                if "product" in url or "dp/" in url or "gp/product" in url:
                    main_content = "Amazon product details page showing pricing, description, and purchase options"
                    actions = [
                        ActionItem(
                            description="Add this product to cart",
                            action_type="click",
                            target_element="#add-to-cart-button",
                            element_type="button"
                        ),
                        ActionItem(
                            description="Buy now",
                            action_type="click",
                            target_element="#buy-now-button",
                            element_type="button"
                        )
                    ]
                else:
                    # General Amazon page
                    actions = [
                        ActionItem(
                            description="Search for products",
                            action_type="input",
                            target_element="#twotabsearchtextbox",
                            element_type="input",
                            parameters={"placeholder": "Enter product name"}
                        )
                    ]
            
            elif "genaigenesis.ca" in domain:
                print("[PAGE ANALYSIS] Detected GenAIGenesis domain, adding GenAIGenesis-specific actions")
                main_content = "GenAIGenesis website offering AI solutions and services"
                
                # Always provide navigation buttons for GenAIGenesis site, regardless of parsing success
                nav_buttons = ["Home", "About", "Sponsors", "FAQ", "Team", "Dashboard", "Sign out"]
                
                # Create fresh action list for GenAIGenesis
                actions = []
                
                # Add all navigation buttons
                for btn_text in nav_buttons:
                    print(f"[PAGE ANALYSIS] Adding GenAIGenesis navigation button: {btn_text}")
                    actions.append(
                        ActionItem(
                            description=f"Click '{btn_text}' button",
                            action_type="click",
                            target_element=f"a:contains('{btn_text}'), button:contains('{btn_text}')",
                            element_type="button",
                            element_attributes={"text": btn_text}
                        )
                    )
                
                print(f"[PAGE ANALYSIS] Added {len(actions)} GenAIGenesis navigation buttons")
                
                # Return early for GenAIGenesis site - no need for filtering, we want these exact actions
                print(f"[PAGE ANALYSIS] COMPLETE: {main_content}, {len(actions)} GenAIGenesis actions found")
                return {
                    "main_content": main_content,
                    "actions": [action.dict() for action in actions]
                }
            
            else:
                print("[PAGE ANALYSIS] Using generic pattern matching")
                # Generic pattern-based analysis using text patterns
                if text and len(text) > 0:
                    # Try to extract a title or heading from text
                    lines = text.strip().split("\n")
                    if lines and len(lines) > 0:
                        main_content = lines[0].strip()[:100]  # Use first line as main content
                        print(f"[PAGE ANALYSIS] Extracted main content from text: {main_content}")
                
                # Generic pattern-based analysis
                if "cart" in html_preview.lower() or "checkout" in html_preview.lower():
                    print("[PAGE ANALYSIS] Detected checkout/cart patterns")
                    actions.append(
                        ActionItem(
                            description="Proceed to checkout",
                            action_type="click",
                            target_element="button[type='submit'], .checkout-button, .btn-checkout",
                            element_type="button"
                        )
                    )
                
                if "login" in html_preview.lower() or "sign in" in html_preview.lower():
                    print("[PAGE ANALYSIS] Detected login patterns")
                    actions.extend([
                        ActionItem(
                            description="Enter username or email",
                            action_type="input",
                            target_element="input[type='email'], input[name='email'], input[id*='email'], input[id*='username']",
                            element_type="input",
                            parameters={"placeholder": "Enter your email/username"}
                        ),
                        ActionItem(
                            description="Enter password",
                            action_type="input",
                            target_element="input[type='password']",
                            element_type="password",
                            parameters={"placeholder": "Enter your password"}
                        ),
                        ActionItem(
                            description="Click login button",
                            action_type="click",
                            target_element="button[type='submit'], input[type='submit'], .login-button, .btn-login",
                            element_type="button"
                        )
                    ])
                
                if "search" in html_preview.lower():
                    print("[PAGE ANALYSIS] Detected search patterns")
                    actions.append(
                        ActionItem(
                            description="Search on this website",
                            action_type="input",
                            target_element="input[type='search'], input[name='q'], input[name='search'], input[placeholder*='search']",
                            element_type="input",
                            parameters={"placeholder": "Enter search terms"}
                        )
                    )
        
        # Always include scroll action if no other actions found
        if len(actions) == 0:
            print("[PAGE ANALYSIS] No buttons or inputs found, adding scroll action")
            actions.append(
                ActionItem(
                    description="Scroll down to see more content",
                    action_type="scroll",
                    parameters={"direction": "down", "amount": 500}
                )
            )
        
        # Limit the number of actions to avoid overwhelming the user
        if len(actions) > 10:
            print(f"[PAGE ANALYSIS] Too many actions ({len(actions)}), limiting to 10")
            # Sort actions by relevance - prioritize input and click actions over navigation
            def action_priority(action):
                if action.action_type == "input":
                    return 0  # Highest priority
                elif action.action_type == "click":
                    return 1
                else:
                    return 2  # Lowest priority
                    
            actions = sorted(actions, key=action_priority)[:10]
        
        # Filter actions to only include buttons and input fields
        filtered_actions = []
        
        # Special case for GenAIGenesis - always include navigation buttons
        is_genai_genesis = "genaigenesis.ca" in url if url else False
        genai_nav_buttons = ["Home", "About", "Sponsors", "FAQ", "Team", "Dashboard", "Sign out", "Sign Out", "Logout", "Log out"]
        
        for action in actions:
            # Include all actions for navigation buttons on GenAIGenesis site
            if is_genai_genesis and action.action_type == "click":
                # Check if this is a navigation button action
                if hasattr(action, "element_attributes") and action.element_attributes and "text" in action.element_attributes:
                    button_text = action.element_attributes.get("text", "")
                    if any(nav.lower() == button_text.lower() for nav in genai_nav_buttons):
                        print(f"[PAGE ANALYSIS] Keeping GenAIGenesis navigation button: {action.description}")
                        filtered_actions.append(action)
                        continue
            
            # For non-GenAIGenesis or other actions, apply normal filtering
            # Include input actions
            if action.action_type == "input":
                print(f"[PAGE ANALYSIS] Keeping input action: {action.description}")
                filtered_actions.append(action)
            # Include button click actions but not link clicks
            elif action.action_type == "click" and hasattr(action, "element_type") and action.element_type == "button":
                print(f"[PAGE ANALYSIS] Keeping button action: {action.description}")
                filtered_actions.append(action)
            # Include actions on input-like elements (checkboxes, radio buttons)
            elif action.action_type == "click" and hasattr(action, "element_type") and action.element_type in ["checkbox", "radio", "input"]:
                print(f"[PAGE ANALYSIS] Keeping input-like action: {action.description}")
                filtered_actions.append(action)
                
        print(f"[PAGE ANALYSIS] Filtered from {len(actions)} to {len(filtered_actions)} button/input actions")
        actions = filtered_actions
        
        print(f"[PAGE ANALYSIS] COMPLETE: {main_content}, {len(actions)} actions found")
        
        # Convert actions to dict format and check for issues
        action_dicts = []
        for i, action in enumerate(actions):
            try:
                action_dict = action.dict()
                action_dicts.append(action_dict)
            except Exception as e:
                print(f"[PAGE ANALYSIS] ERROR converting action {i} to dict: {str(e)}")
        
        return {
            "main_content": main_content,
            "actions": action_dicts
        }
        
    except Exception as e:
        error_msg = f"Error analyzing page: {str(e)}"
        print(f"[PAGE ANALYSIS] CRITICAL ERROR: {error_msg}")
        traceback_str = traceback.format_exc()
        print(f"[PAGE ANALYSIS] Traceback: {traceback_str}")
        
        # Provide some minimal actions even in case of error
        fallback_actions = [
            ActionItem(
                description="Reload the page and try again",
                action_type="navigate",
                parameters={"action": "refresh"}
            )
        ]
        
        return {
            "main_content": "Error analyzing page content",
            "actions": [action.dict() for action in fallback_actions],
            "error": str(e)
        }

if __name__ == "__main__":
    # Use HTTP to run the server
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    ) 