from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import psycopg2
import os

app = FastAPI(title="Identity Service")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/user_db")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

class OAuthLoginRequest(BaseModel):
    provider: str
    token: str

class VerificationRequest(BaseModel):
    captchaToken: str
    phone: str

@app.post("/login/oauth")
async def login_oauth(payload: OAuthLoginRequest):
    return {
        "message": f"OAuth login placeholder via {payload.provider}",
        "user": {"id": "u_1", "name": "John Doe", "email": "john@example.com"},
        "token": "jwt_token_stub"
    }

@app.post("/verify")
async def verify(payload: VerificationRequest):
    return {"verified": True, "message": "Verification successful"}

@app.get("/health")
async def health():
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT NOW();")
            db_time = cur.fetchone()[0]
        return {
            "status": "ok",
            "service": "identity-service",
            "dbTime": db_time.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database status error: {e}")
    finally:
        if conn:
            conn.close()
