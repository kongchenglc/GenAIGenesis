from pydantic import BaseModel, Field

class AudioRequest(BaseModel):
    is_activated: bool = Field(default=False, description="Whether voice activation is enabled")

class WebSocketResponse(BaseModel):
    message: str = Field(description="Message to be sent to the client")
    is_activated: bool = Field(default=False, description="Whether voice activation is enabled")

class AudioResponse(BaseModel):
    audio_data: bytes = Field(description="Audio data to be sent to the client")

