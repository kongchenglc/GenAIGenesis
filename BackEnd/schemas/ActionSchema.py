from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from .PageSchema import ElementInfo

class ActionItem(BaseModel):
    description: str = Field(description="Description of the action")
    action_type: str = Field(description="Type of action (click, input, etc.)")
    target_element: Optional[str] = Field(default=None, description="Target element selector")
    element_info: Optional[ElementInfo] = Field(default=None, description="Information about the target element")
    parameters: Optional[Dict[str, Any]] = Field(default=None, description="Additional parameters for the action")

class ActionResponse(BaseModel):
    action_items: List[ActionItem] = Field(description="List of actions to be performed")
    is_action_required: bool = Field(description="Whether action is required")
    is_action_successful: bool = Field(description="Whether the action was successful")
    message: Optional[str] = Field(default=None, description="Response message")

class VoiceCommand(BaseModel):
    command: str = Field(description="Voice command from the user")
    page_context: Optional[Dict[str, Any]] = Field(default=None, description="Context of the current page")

class CommandResponse(BaseModel):
    action_type: str = Field(description="Type of action to perform")
    element_info: Optional[Dict[str, Any]] = Field(default=None, description="Information about the target element")
    input_text: Optional[str] = Field(default=None, description="Text to input (for input actions)")
    message: str = Field(description="Response message to the user")
    success: bool = Field(description="Whether the command was successfully processed")
    