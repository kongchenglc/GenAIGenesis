from pydantic import BaseModel, Field

class PageContent(BaseModel):
    html: str = Field(description="HTML content of the page")
    text: str = Field(description="Text content of the page")
    url: str = Field(description="URL of the page")

