from typing import Dict, Optional, Any, List
import re

class CommandMatcher:
    """Base class for command matchers that use regex patterns"""
    def __init__(self, pattern: str):
        self.pattern = re.compile(pattern, re.IGNORECASE)
    
    def match(self, text: str) -> Optional[Dict[str, Any]]:
        """Match text against pattern and return result or None"""
        return None

class WakeWordMatcher(CommandMatcher):
    """Matcher for wake word detection"""
    def __init__(self, wake_word="hey assistant"):
        self.wake_word = wake_word.lower()
    
    def match(self, text: str) -> Optional[Dict[str, Any]]:
        if self.wake_word in text.lower():
            return {"type": "WAKE_WORD_DETECTED"}
        return None

class StopWordMatcher(CommandMatcher):
    """Matcher for stop word detection"""
    def __init__(self, stop_word="goodbye assistant"):
        self.stop_word = stop_word.lower()
    
    def match(self, text: str) -> Optional[Dict[str, Any]]:
        if self.stop_word in text.lower():
            return {"type": "STOP_WORD_DETECTED"}
        return None

class UrlCommandMatcher(CommandMatcher):
    """Matcher for URL commands"""
    def __init__(self):
        super().__init__(r'open\s+(?:https?://)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)(?:/\S*)?')
    
    def match(self, text: str) -> Optional[Dict[str, Any]]:
        url_match = self.pattern.search(text.lower())
        if url_match:
            domain = url_match.group(1)
            # Check for full URL in the command
            full_url = re.search(r'open\s+(https?://\S+)', text.lower(), re.IGNORECASE)
            if full_url:
                return {
                    "type": "URL_COMMAND",
                    "url": full_url.group(1)
                }
            return {
                "type": "URL_COMMAND",
                "url": f"https://{domain}"
            }
        return None

class PageAnalysisMatcher(CommandMatcher):
    """Matcher for page analysis commands"""
    def __init__(self):
        super().__init__(r'(what|tell me|describe|analyze|analyze_page|summarize|explain).*?(page|content|website|this page|this website|about)')
    
    def match(self, text: str) -> Optional[Dict[str, Any]]:
        # Direct match for common analyze commands
        text_lower = text.lower()
        if text_lower in ["analyze page", "analyze_page", "analyze this page"]:
            return {
                "type": "PAGE_ANALYSIS",
                "action": "analyze_page"
            }
        
        # Regex match for more complex phrases
        if self.pattern.search(text_lower):
            return {
                "type": "PAGE_ANALYSIS",
                "action": "analyze_page"
            }
        return None

class ActionMatcher(CommandMatcher):
    """Matcher for action commands like click, input, etc."""
    def __init__(self):
        super().__init__(r'(click|tap|press|select|choose|input|type|enter|fill)(?:\s+on)?(?:\s+the)?(?:\s+button)?(?:\s+link)?\s+(?:"|\')?([^"\']+)(?:"|\')?\s*')
        # Patterns to identify element types
        self.button_pattern = re.compile(r'(?:the\s+)?(button|tab|icon)(?:\s+(?:that\s+)?(?:says|labeled|with\s+text|with\s+label))?\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', re.IGNORECASE)
        self.link_pattern = re.compile(r'(?:the\s+)?link(?:\s+(?:that\s+)?(?:says|to|labeled|with\s+text))?\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', re.IGNORECASE)
        self.input_pattern = re.compile(r'(?:the\s+)?(input|field|box|textbox|text\s+box|form\s+field|textarea)(?:\s+(?:with|labeled|for))?\s+(?:"|\')?([^"\']+)(?:"|\')?\s*', re.IGNORECASE)
    
    def match(self, text: str) -> Optional[Dict[str, Any]]:
        text_lower = text.lower()
        action_match = self.pattern.search(text_lower)
        
        if not action_match:
            return None
            
        action_type = action_match.group(1).lower()
        target = action_match.group(2).strip()
        
        if action_type in ["click", "tap", "press", "select", "choose"]:
            element_info = self._extract_element_info(text_lower)
            
            return {
                "type": "EXECUTE_ACTION",
                "action_type": "click",
                "target": target,
                "element_type": element_info.get("element_type", "unknown"),
                "element_attributes": element_info.get("attributes", {})
            }
        elif action_type in ["input", "type", "enter", "fill"]:
            # Extract input text and target field
            input_text_match = re.search(r'(?:input|type|enter|fill)(?:\s+in)?(?:\s+the)?(?:\s+text)?\s+(?:"|\')?([^"\']+)(?:"|\')?\s+(?:in|into|to)(?:\s+the)?\s+(.+)', text_lower, re.IGNORECASE)
            
            if input_text_match:
                input_text = input_text_match.group(1).strip()
                input_target = input_text_match.group(2).strip()
                
                return {
                    "type": "EXECUTE_ACTION",
                    "action_type": "input",
                    "target": input_target,
                    "input_text": input_text,
                    "element_type": "input",
                    "element_attributes": {"placeholder": input_target}
                }
        
        return None
    
    def _extract_element_info(self, text: str) -> Dict[str, Any]:
        """Extract information about the target element from the command text"""
        button_match = self.button_pattern.search(text)
        if button_match:
            return {
                "element_type": "button",
                "attributes": {"text": button_match.group(2)}
            }
            
        link_match = self.link_pattern.search(text)
        if link_match:
            return {
                "element_type": "link",
                "attributes": {"text": link_match.group(1)}
            }
            
        input_match = self.input_pattern.search(text)
        if input_match:
            return {
                "element_type": "input",
                "attributes": {"placeholder": input_match.group(2)}
            }
            
        return {
            "element_type": "unknown",
            "attributes": {}
        }

class CommandProcessor:
    """Process voice commands using a collection of command matchers"""
    def __init__(self, wake_word="hey assistant", stop_word="goodbye assistant"):
        # Create matchers for different command types
        self.matchers = [
            WakeWordMatcher(wake_word),
            StopWordMatcher(stop_word),
            UrlCommandMatcher(),
            PageAnalysisMatcher(),
            ActionMatcher()
        ]
    
    async def process_command(self, text: str, is_activated: bool) -> Optional[Dict[str, Any]]:
        """Process a command and return an action or None"""
        try:
            # Only check wake word if not already activated
            if not is_activated:
                wake_matcher = self.matchers[0]
                result = wake_matcher.match(text)
                if result:
                    return result
                return None
            
            # If activated, first check for stop word
            stop_matcher = self.matchers[1]
            result = stop_matcher.match(text)
            if result:
                return result
            
            # Try all other matchers
            for matcher in self.matchers[2:]:
                result = matcher.match(text)
                if result:
                    return result
            
            # No command matched
            return None
        except Exception as e:
            print(f"Error processing command: {str(e)}")
            return None 