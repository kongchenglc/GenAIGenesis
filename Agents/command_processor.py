from typing import Dict, Optional, Any
import re

class CommandProcessor:
    def __init__(self):
        self.wake_word = "hey assistant"
        self.stop_word = "goodbye assistant"
        
        # Enhanced English patterns with more detailed matching
        self.url_pattern = re.compile(r'open\s+(?:https?://)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)(?:/\S*)?', re.IGNORECASE)
        # Updated analyze pattern to match more variations of the analyze page command
        self.analyze_pattern = re.compile(r'(what|tell me|describe|analyze|analyze_page|summarize|explain).*?(page|content|website|this page|this website|about)', re.IGNORECASE)
        
        # Improved action pattern with better element recognition
        self.action_pattern = re.compile(r'(click|tap|press|select|choose|input|type|enter|fill)(?:\s+on)?(?:\s+the)?(?:\s+button)?(?:\s+link)?\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', re.IGNORECASE)
        
        # Additional patterns for specific element types
        self.button_pattern = re.compile(r'(?:the\s+)?(button|tab|icon)(?:\s+(?:that\s+)?(?:says|labeled|with\s+text|with\s+label))?\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', re.IGNORECASE)
        self.link_pattern = re.compile(r'(?:the\s+)?link(?:\s+(?:that\s+)?(?:says|to|labeled|with\s+text))?\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', re.IGNORECASE)
        self.input_pattern = re.compile(r'(?:the\s+)?(input|field|box|textbox|text\s+box|form\s+field|textarea)(?:\s+(?:with|labeled|for))?\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', re.IGNORECASE)
        
    async def process_command(self, text: str, is_activated: bool) -> Optional[Dict[str, Any]]:
        try:
            # Convert text to lowercase for easier matching
            text_lower = text.lower()
            
            # Check wake word
            if not is_activated and self.wake_word in text_lower:
                return {
                    "type": "WAKE_WORD_DETECTED"
                }
            
            # Check stop word
            if is_activated and self.stop_word in text_lower:
                return {
                    "type": "STOP_WORD_DETECTED"
                }
            
            # If activated, process other commands
            if is_activated:
                # Direct match for analyze_page command
                if text_lower == "analyze page" or text_lower == "analyze_page" or text_lower == "analyze this page":
                    return {
                        "type": "PAGE_ANALYSIS",
                        "action": "analyze_page"
                    }
                
                # Process URL commands (with specific support for Amazon and genaigenesis.ca)
                url_match = self.url_pattern.search(text_lower)
                
                if url_match:
                    domain = url_match.group(1)
                    # Get full URL if present in the command
                    full_url = re.search(r'open\s+(https?://\S+)', text_lower, re.IGNORECASE)
                    if full_url:
                        return {
                            "type": "URL_COMMAND",
                            "url": full_url.group(1)
                        }
                    return {
                        "type": "URL_COMMAND",
                        "url": f"https://{domain}"
                    }
                
                # Check for Amazon specific command
                if re.search(r'open\s+amazon', text_lower, re.IGNORECASE):
                    return {
                        "type": "URL_COMMAND",
                        "url": "https://www.amazon.com"
                    }
                
                # Check for GenAIGenesis specific command
                if re.search(r'open\s+genaigenesis', text_lower, re.IGNORECASE):
                    return {
                        "type": "URL_COMMAND",
                        "url": "https://genaigenesis.ca"
                    }
                
                # GenAIGenesis navigation buttons specific command (English)
                genai_nav_match = re.search(r'(click|go\s+to|navigate\s+to|open|select)\s+(home|about|sponsors|faq|team|dashboard|sign\s*out|log\s*out)', text_lower, re.IGNORECASE)
                if genai_nav_match:
                    nav_button = genai_nav_match.group(2).strip()
                    return {
                        "type": "EXECUTE_ACTION",
                        "action_type": "click",
                        "target": nav_button,
                        "element_type": "button",
                        "element_attributes": {"text": nav_button}
                    }
                
                # GenAIGenesis navigation buttons specific command (Chinese)
                chinese_nav_mapping = {
                    "首页": "Home",
                    "主页": "Home",
                    "关于": "About",
                    "赞助商": "Sponsors",
                    "常见问题": "FAQ",
                    "问答": "FAQ",
                    "团队": "Team",
                    "仪表盘": "Dashboard",
                    "控制面板": "Dashboard",
                    "退出": "Sign out",
                    "登出": "Sign out",
                    "注销": "Sign out"
                }
                
                for chinese_term, english_button in chinese_nav_mapping.items():
                    if chinese_term in text:
                        print(f"Matched Chinese navigation term: {chinese_term} -> {english_button}")
                        return {
                            "type": "EXECUTE_ACTION",
                            "action_type": "click",
                            "target": english_button,
                            "element_type": "button",
                            "element_attributes": {"text": english_button}
                        }
                
                # Process page analysis commands with regex
                analyze_match = self.analyze_pattern.search(text_lower)
                
                if analyze_match:
                    return {
                        "type": "PAGE_ANALYSIS",
                        "action": "analyze_page"
                    }
                
                # Process action execution commands (click, input, etc.)
                action_match = self.action_pattern.search(text_lower)
                
                if action_match:
                    action_type = action_match.group(1).lower()
                    target = action_match.group(2).strip()
                    
                    if action_type in ["click", "tap", "press", "select", "choose"]:
                        # Check for more specific element information
                        element_info = self._extract_element_info(text_lower)
                        
                        return {
                            "type": "EXECUTE_ACTION",
                            "action_type": "click",
                            "target": target,
                            "element_type": element_info.get("element_type", "unknown"),
                            "element_attributes": element_info.get("attributes", {})
                        }
                    elif action_type in ["input", "type", "enter", "fill"]:
                        # Extract the text to input with enhanced pattern
                        input_text_match = re.search(r'(?:input|type|enter|fill)(?:\s+in)?(?:\s+the)?(?:\s+text)?\s+(?:"|\')?([^"\']+)(?:"|\')?\s+(?:in|into|to)(?:\s+the)?\s+(.+)', text_lower, re.IGNORECASE)
                        
                        if input_text_match:
                            input_text = input_text_match.group(1).strip()
                            input_target = input_text_match.group(2).strip()
                            
                            # Get element info for better targeting
                            element_info = self._extract_element_info(input_target)
                            
                            return {
                                "type": "EXECUTE_ACTION",
                                "action_type": "input",
                                "target": input_target,
                                "value": input_text,
                                "element_type": element_info.get("element_type", "input"),
                                "element_attributes": element_info.get("attributes", {})
                            }
                        else:
                            # If we can't parse the specific format, try to get what comes after the action verb
                            parts = text_lower.split(action_match.group(1), 1)
                            if len(parts) > 1:
                                remaining_text = parts[1].strip()
                                
                                # Try to extract value and target
                                value_target_match = re.search(r'(?:"|\')?([^"\']+)(?:"|\')?\s+(?:in|into|to)(?:\s+the)?\s+(.+)', remaining_text)
                                if value_target_match:
                                    input_value = value_target_match.group(1).strip()
                                    input_target = value_target_match.group(2).strip()
                                    
                                    # Get element info for better targeting
                                    element_info = self._extract_element_info(input_target)
                                    
                                    return {
                                        "type": "EXECUTE_ACTION",
                                        "action_type": "input",
                                        "target": input_target,
                                        "value": input_value,
                                        "element_type": element_info.get("element_type", "input"),
                                        "element_attributes": element_info.get("attributes", {})
                                    }
                                    
                                return {
                                    "type": "EXECUTE_ACTION",
                                    "action_type": "input",
                                    "target": target,
                                    "value": remaining_text
                                }
                
                # Process more generic element interactions
                button_match = self.button_pattern.search(text_lower)
                if button_match:
                    element_type = button_match.group(1).lower()
                    button_text = button_match.group(2).strip()
                    return {
                        "type": "EXECUTE_ACTION",
                        "action_type": "click",
                        "target": button_text,
                        "element_type": element_type,
                        "element_attributes": {"text": button_text}
                    }
                
                link_match = self.link_pattern.search(text_lower)
                if link_match:
                    link_text = link_match.group(1).strip()
                    return {
                        "type": "EXECUTE_ACTION",
                        "action_type": "click",
                        "target": link_text,
                        "element_type": "link",
                        "element_attributes": {"text": link_text}
                    }
                
                input_match = self.input_pattern.search(text_lower)
                if input_match:
                    input_type = input_match.group(1).lower()
                    input_label = input_match.group(2).strip()
                    
                    # Look for what to input
                    input_value_match = re.search(r'(?:with|the value|the text)\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', text_lower)
                    input_value = input_value_match.group(1).strip() if input_value_match else ""
                    
                    return {
                        "type": "EXECUTE_ACTION",
                        "action_type": "input",
                        "target": input_label,
                        "value": input_value,
                        "element_type": input_type,
                        "element_attributes": {"label": input_label, "placeholder": input_label}
                    }
                
                # Process other general commands
                if text:
                    return {
                        "type": "GENERAL_COMMAND",
                        "text": text
                    }
            
            return None
            
        except Exception as e:
            print(f"Error in command processing: {str(e)}")
            return None
            
    def _extract_element_info(self, text: str) -> Dict[str, Any]:
        """Extract detailed information about an element from the command text."""
        element_info = {
            "element_type": "unknown",
            "attributes": {}
        }
        
        # Check for button indicators
        if re.search(r'button|tab|btn', text, re.IGNORECASE):
            element_info["element_type"] = "button"
            
        # Check for link indicators
        elif re.search(r'link|url|href', text, re.IGNORECASE):
            element_info["element_type"] = "link"
            
        # Check for input indicators
        elif re.search(r'input|field|box|textbox|textarea|form', text, re.IGNORECASE):
            element_info["element_type"] = "input"
            
            # Check for input types
            if re.search(r'email', text, re.IGNORECASE):
                element_info["attributes"]["type"] = "email"
            elif re.search(r'password', text, re.IGNORECASE):
                element_info["attributes"]["type"] = "password"
            elif re.search(r'search', text, re.IGNORECASE):
                element_info["attributes"]["type"] = "search"
            else:
                element_info["attributes"]["type"] = "text"
                
        # Check for specific attributes
        id_match = re.search(r'id\s+(?:is|of|=)\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', text, re.IGNORECASE)
        if id_match:
            element_info["attributes"]["id"] = id_match.group(1).strip()
            
        name_match = re.search(r'name\s+(?:is|of|=)\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', text, re.IGNORECASE)
        if name_match:
            element_info["attributes"]["name"] = name_match.group(1).strip()
            
        class_match = re.search(r'class\s+(?:is|of|=)\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', text, re.IGNORECASE)
        if class_match:
            element_info["attributes"]["class"] = class_match.group(1).strip()
            
        # Add the raw text as a potential attribute
        element_info["attributes"]["text"] = text.strip()
        
        return element_info 