from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import httpx
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.client = httpx.AsyncClient()
    yield
    await app.state.client.aclose()

app = FastAPI(title="API Gateway", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SERVICES = {
    "auth": os.getenv("IDENTITY_SERVICE_URL", "http://identity-service:3001"),
    "content": os.getenv("CONTENT_SERVICE_URL", "http://content-service:3002"),
    "feed": os.getenv("FEED_SERVICE_URL", "http://feed-service:3003"),
    "community": os.getenv("COMMUNITY_SERVICE_URL", "http://community-service:3004"),
}

@app.api_route("/api/v1/{service}/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def gateway_proxy(service: str, path: str, request: Request):
    if service not in SERVICES:
        return Response(content="Service not found", status_code=404)
    
    target_url = f"{SERVICES[service]}/{path}"
    
    query_params = request.query_params
    if query_params:
        target_url = f"{target_url}?{query_params}"

    body = await request.body()
    headers = dict(request.headers)
    headers.pop("host", None)
    headers.pop("content-length", None)
    
    try:
        response = await request.app.state.client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
            timeout=30.0
        )
        return Response(
            content=response.content,
            status_code=response.status_code,
            headers=dict(response.headers)
        )
    except httpx.RequestError as exc:
        return Response(content=f"Gateway error contacting downstream service: {exc}", status_code=502)

@app.get("/health")
async def health():
    return {"status": "ok", "service": "api-gateway"}

