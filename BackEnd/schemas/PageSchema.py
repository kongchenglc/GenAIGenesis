from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class PageContent(BaseModel):
    html: str = Field(description="HTML content of the page")
    text: str = Field(description="Text content of the page")
    url: str = Field(description="URL of the page")
    screenshot: Optional[str] = Field(default=None, description="Base64 encoded screenshot of the page")

class ElementInfo(BaseModel):
    element_type: str = Field(description="Type of element (button, input, link, etc.)")
    text: Optional[str] = Field(default=None, description="Text content of the element")
    id: Optional[str] = Field(default=None, description="ID attribute of the element")
    name: Optional[str] = Field(default=None, description="Name attribute of the element")
    css_selector: Optional[str] = Field(default=None, description="CSS selector for the element")
    attributes: Optional[Dict[str, str]] = Field(default=None, description="Additional attributes")

class PageAnalysisResponse(BaseModel):
    summary: str = Field(description="Summary of the page content")
    interactive_elements: List[ElementInfo] = Field(default=[], description="Interactive elements on the page")
    possible_actions: List[str] = Field(default=[], description="Possible actions that can be performed")
    message: str = Field(description="Message to display to the user")

