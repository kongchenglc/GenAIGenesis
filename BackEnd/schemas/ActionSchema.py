from pydantic import BaseModel

class ActionItem(BaseModel):
    description: str
    action_type: str
    target_element: str = None
    parameters: dict = None

class ActionResponse(BaseModel):
    action_items: list[ActionItem]
    is_action_required: bool
    is_action_successful: bool
    