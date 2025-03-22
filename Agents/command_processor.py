from typing import Dict, Optional, Any
import re

class CommandProcessor:
    def __init__(self):
        self.wake_word = "hey assistant"
        self.stop_word = "goodbye assistant"
        self.url_pattern = re.compile(r'open\s+(?:https?://)?(?:www\.)?([a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+)')
        
    async def process_command(self, text: str, is_activated: bool) -> Optional[Dict[str, Any]]:
        try:
            # Check wake word
            if not is_activated and self.wake_word in text:
                return {
                    "type": "WAKE_WORD_DETECTED"
                }
            
            # Check stop word
            if is_activated and self.stop_word in text:
                return {
                    "type": "STOP_WORD_DETECTED"
                }
            
            # If activated, process other commands
            if is_activated:
                # Process URL commands
                url_match = self.url_pattern.search(text)
                if url_match:
                    domain = url_match.group(1)
                    return {
                        "type": "URL_COMMAND",
                        "url": f"https://{domain}"
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