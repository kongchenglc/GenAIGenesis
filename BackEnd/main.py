from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from backend.utils.websocketUtil import router as websocket_router

app = FastAPI()

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中，应该限制为特定的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 包含WebSocket路由
app.include_router(websocket_router)


