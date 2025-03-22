from fastapi import FastAPI
from utils.websocketUtil import router as websocket_router

app = FastAPI()

app.include_router(websocket_router, prefix="/ws")


