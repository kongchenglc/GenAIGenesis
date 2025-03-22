from typing import Dict, List, Any, Optional
import re
import json
import base64
from pydantic import BaseModel
from bs4 import BeautifulSoup

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
    
    async def analyze_page(self, html, text, url, screenshot=None):
        """
        Analyze a web page and identify its content and interactive elements
        """
        print(f"=== Analyzing page (page_agent) ===")
        print(f"URL: {url}")
        print(f"Text length: {len(text) if text else 0}")
        
        try:
            # Use model service to analyze content
            analysis_result = await self.model_service.analyze_content({
                "task": "analyze_webpage",
                "html": html,
                "text": text,
                "url": url
            })
            
            # 确保我们至少返回一些有意义的内容
            if not analysis_result.get("summary"):
                analysis_result["summary"] = "这是一个网页，包含各种内容和可能的交互元素。"
            
            # 确保返回一些交互元素
            interactive_elements = []
            if not analysis_result.get("interactive_elements"):
                # 从HTML中提取一些基本的交互元素
                try:
                    soup = BeautifulSoup(html, 'html.parser')
                    
                    # 查找按钮
                    for button in soup.find_all(['button', 'a', 'input[type="button"]']):
                        text = button.get_text().strip() or button.get('value', '') or button.get('name', '') or "按钮"
                        interactive_elements.append({
                            "type": "button",
                            "text": text,
                            "selector": f"button:contains('{text}')" if text else ""
                        })
                    
                    # 查找输入框
                    for input_field in soup.find_all(['input[type="text"]', 'textarea']):
                        placeholder = input_field.get('placeholder', '') or input_field.get('name', '') or "输入框"
                        interactive_elements.append({
                            "type": "input",
                            "text": placeholder,
                            "selector": f"input[placeholder='{placeholder}']" if placeholder else ""
                        })
                except Exception as e:
                    print(f"Error extracting elements with BeautifulSoup: {str(e)}")
                    # 提供一些默认的交互元素
                    interactive_elements = [
                        {"type": "button", "text": "提交", "selector": "button.submit"},
                        {"type": "input", "text": "搜索", "selector": "input[name='search']"}
                    ]
            else:
                interactive_elements = analysis_result.get("interactive_elements")
            
            # 确保返回一些可能的操作
            possible_actions = analysis_result.get("possible_actions", [
                "阅读页面内容",
                "点击页面上的按钮",
                "在搜索框中输入文字"
            ])
            
            # 创建分析结果对象
            from schemas.PageSchema import PageAnalysisResult, ElementInfo
            
            # 将交互元素转换为ElementInfo对象
            element_info_list = []
            for elem in interactive_elements:
                element_info_list.append(ElementInfo(
                    element_type=elem.get("type", "unknown"),
                    text=elem.get("text", ""),
                    css_selector=elem.get("selector", ""),
                    name=elem.get("name", ""),
                    id=elem.get("id", "")
                ))
            
            result = PageAnalysisResult(
                summary=analysis_result.get("summary", ""),
                interactive_elements=element_info_list,
                possible_actions=possible_actions
            )
            
            print(f"Analysis complete: {result.summary}")
            print(f"Found {len(result.interactive_elements)} interactive elements")
            
            return result
            
        except Exception as e:
            print(f"Error in analyze_page: {str(e)}")
            import traceback
            traceback.print_exc()
            
            # 返回一个默认结果
            from schemas.PageSchema import PageAnalysisResult, ElementInfo
            
            return PageAnalysisResult(
                summary="无法分析页面内容。请重试。",
                interactive_elements=[],
                possible_actions=["重新尝试分析页面"]
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