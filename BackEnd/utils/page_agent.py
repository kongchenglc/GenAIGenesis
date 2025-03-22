from typing import Dict, List, Any, Optional
import re
import json
import base64
from pydantic import BaseModel

class ElementInfo(BaseModel):
    """Information about an interactive element on the page"""
    element_type: str  # button, input, link, etc.
    text: Optional[str] = None
    id: Optional[str] = None
    name: Optional[str] = None
    css_selector: Optional[str] = None
    coordinates: Optional[Dict[str, int]] = None
    
class PageAnalysisResult(BaseModel):
    """Result of analyzing a web page"""
    summary: str
    interactive_elements: List[ElementInfo] = []
    possible_actions: List[str] = []
    
class ActionRequest(BaseModel):
    """Request to perform an action on the page"""
    action_type: str  # click, input, etc.
    element_info: ElementInfo
    input_text: Optional[str] = None

class ActionResult(BaseModel):
    """Result of performing an action"""
    success: bool
    message: str
    next_actions: Optional[List[str]] = None

class WebPageAgent:
    """
    WebPageAgent analyzes web pages and processes voice interactions
    """
    
    def __init__(self, model_service=None):
        """Initialize the agent with an optional model service"""
        self.model_service = model_service
        self.current_page_context = None
    
    async def analyze_page(self, html: str, text: str, url: str, screenshot: Optional[str] = None) -> PageAnalysisResult:
        """
        Analyze a web page and identify its content and interactive elements
        
        Args:
            html: The HTML content of the page
            text: The text content of the page
            url: The URL of the page
            screenshot: Base64-encoded screenshot (optional)
            
        Returns:
            PageAnalysisResult with summary and interactive elements
        """
        # Store the basic context for future interactions
        self.current_page_context = {
            "url": url,
            "title": self._extract_title(html),
            "text_sample": text[:200] if text else ""
        }
        
        # Extract interactive elements using regex (basic implementation)
        interactive_elements = self._extract_interactive_elements(html)
        
        # Generate a simple summary if no model service
        if not self.model_service:
            # Simple summary based on page title and URL
            title = self._extract_title(html) or "Untitled Page"
            summary = f"This appears to be a page about {title}. The page contains {len(interactive_elements)} interactive elements."
            possible_actions = self._generate_possible_actions(interactive_elements)
            
            return PageAnalysisResult(
                summary=summary,
                interactive_elements=interactive_elements,
                possible_actions=possible_actions
            )
        
        # If model service is available, use it for better analysis
        try:
            # Format the input for the model
            model_input = {
                "task": "analyze_webpage",
                "url": url,
                "title": self._extract_title(html),
                "text_sample": text[:1000] if text else "", # Limited sample for efficiency
                "has_screenshot": screenshot is not None,
                "element_count": len(interactive_elements)
            }
            
            if screenshot:
                model_input["screenshot"] = screenshot
                
            # Get analysis from model
            model_response = await self.model_service.analyze_content(model_input)
            
            # Process model response
            summary = model_response.get("summary", "Unable to generate summary")
            ai_elements = model_response.get("interactive_elements", [])
            
            # Merge AI-identified elements with extracted ones
            if ai_elements:
                # Convert AI elements to ElementInfo objects
                ai_element_infos = [
                    ElementInfo(
                        element_type=el.get("type", "unknown"),
                        text=el.get("text"),
                        css_selector=el.get("selector")
                    ) for el in ai_elements
                ]
                interactive_elements.extend(ai_element_infos)
            
            # Generate possible actions
            possible_actions = model_response.get("possible_actions", 
                                                 self._generate_possible_actions(interactive_elements))
            
            return PageAnalysisResult(
                summary=summary,
                interactive_elements=interactive_elements,
                possible_actions=possible_actions
            )
            
        except Exception as e:
            # Fallback to simple analysis if model fails
            print(f"Error using model for page analysis: {e}")
            title = self._extract_title(html) or "Untitled Page"
            summary = f"This appears to be a page titled '{title}'. The page contains {len(interactive_elements)} interactive elements."
            possible_actions = self._generate_possible_actions(interactive_elements)
            
            return PageAnalysisResult(
                summary=summary,
                interactive_elements=interactive_elements,
                possible_actions=possible_actions
            )
    
    async def process_voice_command(self, command: str, page_context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Process a voice command related to page interaction
        
        Args:
            command: The voice command to process
            page_context: Optional context about the current page
            
        Returns:
            Dictionary with action information and response message
        """
        # Use current context if none provided
        context = page_context or self.current_page_context or {}
        
        # If we don't have a model service, use simple command parsing
        if not self.model_service:
            return self._simple_command_parsing(command, context)
        
        # If model service is available, use it for better command processing
        try:
            # Format input for the model
            model_input = {
                "task": "process_voice_command",
                "command": command,
                "page_context": context
            }
            
            # Get response from model
            model_response = await self.model_service.process_command(model_input)
            
            return {
                "action_type": model_response.get("action_type", "unknown"),
                "element_info": model_response.get("element_info", {}),
                "message": model_response.get("message", "I processed your command."),
                "success": True
            }
            
        except Exception as e:
            # Fallback to simple parsing if model fails
            print(f"Error using model for command processing: {e}")
            return self._simple_command_parsing(command, context)
    
    def _extract_title(self, html: str) -> Optional[str]:
        """Extract the title from HTML content"""
        title_match = re.search(r"<title>(.*?)</title>", html, re.IGNORECASE)
        if title_match:
            return title_match.group(1)
        return None
    
    def _extract_interactive_elements(self, html: str) -> List[ElementInfo]:
        """Extract interactive elements from HTML using regex"""
        elements = []
        
        # Extract buttons
        button_matches = re.finditer(r"<button[^>]*>(.*?)</button>", html)
        for match in button_matches:
            button_html = match.group(0)
            button_text = match.group(1)
            
            # Remove HTML tags from text
            button_text = re.sub(r"<[^>]*>", "", button_text).strip()
            
            # Extract ID if present
            id_match = re.search(r'id=["\'](.*?)["\']', button_html)
            button_id = id_match.group(1) if id_match else None
            
            if button_text:
                elements.append(ElementInfo(
                    element_type="button",
                    text=button_text,
                    id=button_id,
                    css_selector=f"button:contains('{button_text}')" if button_text else None
                ))
        
        # Extract input fields
        input_matches = re.finditer(r"<input[^>]*>", html)
        for match in input_matches:
            input_html = match.group(0)
            
            # Extract type, id, name, placeholder attributes
            type_match = re.search(r'type=["\'](.*?)["\']', input_html)
            id_match = re.search(r'id=["\'](.*?)["\']', input_html)
            name_match = re.search(r'name=["\'](.*?)["\']', input_html)
            placeholder_match = re.search(r'placeholder=["\'](.*?)["\']', input_html)
            
            input_type = type_match.group(1) if type_match else "text"
            input_id = id_match.group(1) if id_match else None
            input_name = name_match.group(1) if name_match else None
            placeholder = placeholder_match.group(1) if placeholder_match else None
            
            # Skip hidden inputs
            if input_type == "hidden":
                continue
                
            elements.append(ElementInfo(
                element_type="input",
                text=placeholder,
                id=input_id,
                name=input_name,
                css_selector=f"input#{input_id}" if input_id else (f"input[name='{input_name}']" if input_name else None)
            ))
        
        # Extract links
        link_matches = re.finditer(r"<a[^>]*>(.*?)</a>", html)
        for match in link_matches:
            link_html = match.group(0)
            link_text = match.group(1)
            
            # Remove HTML tags from text
            link_text = re.sub(r"<[^>]*>", "", link_text).strip()
            
            # Extract href and id if present
            href_match = re.search(r'href=["\'](.*?)["\']', link_html)
            id_match = re.search(r'id=["\'](.*?)["\']', link_html)
            
            link_href = href_match.group(1) if href_match else "#"
            link_id = id_match.group(1) if id_match else None
            
            if link_text:
                elements.append(ElementInfo(
                    element_type="link",
                    text=link_text,
                    id=link_id,
                    css_selector=f"a:contains('{link_text}')" if link_text else None
                ))
        
        return elements
    
    def _generate_possible_actions(self, elements: List[ElementInfo]) -> List[str]:
        """Generate a list of possible actions based on the interactive elements"""
        actions = []
        
        # Add general actions
        actions.append("Read the page content")
        actions.append("Summarize this page")
        
        # Add element-specific actions
        for element in elements:
            if element.element_type == "button" and element.text:
                actions.append(f"Click the {element.text} button")
            
            elif element.element_type == "input":
                description = element.text or element.name or "text field"
                actions.append(f"Enter text in the {description} field")
            
            elif element.element_type == "link" and element.text:
                actions.append(f"Click the {element.text} link")
        
        # Return unique actions only
        return list(set(actions))
    
    def _simple_command_parsing(self, command: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Simple rule-based parsing of voice commands
        
        Args:
            command: The voice command to parse
            context: Context about the current page
            
        Returns:
            Dictionary with action information and response
        """
        command_lower = command.lower()
        
        # Check for general page inquiries
        if any(phrase in command_lower for phrase in [
            "what's on this page", 
            "describe this page", 
            "tell me about this page",
            "what is on this page",
            "what can i do on this page"
        ]):
            return {
                "action_type": "describe",
                "message": f"This is a page titled '{context.get('title', 'Untitled Page')}'. I can help you interact with elements on this page.",
                "success": True
            }
        
        # Check for click commands
        if "click" in command_lower:
            # Try to extract what to click
            element_match = re.search(r"click (?:on )?(?:the )?(.*?)(?:button|link)?$", command_lower)
            if element_match:
                element_text = element_match.group(1).strip()
                return {
                    "action_type": "click",
                    "element_info": {"text": element_text},
                    "message": f"I'll try to click on {element_text}",
                    "success": True
                }
        
        # Check for input commands
        if any(word in command_lower for word in ["type", "enter", "input"]):
            # Try to extract what to type and where
            input_match = re.search(r"(?:type|enter|input) ['\"]?(.*?)['\"]? (?:in|into) (?:the )?(.*?)(?:field|input|box)?$", command_lower)
            if input_match:
                text_to_input = input_match.group(1).strip()
                field_name = input_match.group(2).strip()
                return {
                    "action_type": "input",
                    "element_info": {"text": field_name},
                    "input_text": text_to_input,
                    "message": f"I'll try to enter '{text_to_input}' into the {field_name} field",
                    "success": True
                }
        
        # Default response for unknown commands
        return {
            "action_type": "unknown",
            "message": "I'm not sure how to process that command. Try asking me what's on this page, or to click on a specific button.",
            "success": False
        } 