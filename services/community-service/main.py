from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import psycopg2
import os

app = FastAPI(title="Community Service")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/moderation_db")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

class VoteRequest(BaseModel):
    submissionId: str
    voterId: str
    voteType: str
    reason: str

SPAM_KEYWORDS = ['fake', 'scam', 'spam', 'hack', 'sell product']

@app.post("/votes")
async def create_vote(payload: VoteRequest):
    if not payload.reason or len(payload.reason.strip()) < 15:
        raise HTTPException(
            status_code=400,
            detail="A mandatory constructive comment (minimum 15 characters) is required to vote on submissions."
        )

    is_troll = any(keyword in payload.reason.lower() for keyword in SPAM_KEYWORDS)
    moderation_status = "flagged" if is_troll else "approved"
    vote_val = 1 if payload.voteType == "up" else -1

    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            query = """
                INSERT INTO votes (submission_id, voter_id, vote_value, comment, moderation_status, created_at)
                VALUES (%s, %s, %s, %s, %s, NOW())
                RETURNING id, submission_id, voter_id, vote_value, comment, moderation_status, created_at;
            """
            cur.execute(query, (
                payload.submissionId,
                payload.voterId,
                vote_val,
                payload.reason,
                moderation_status
            ))
            row = cur.fetchone()
        conn.commit()

        vote = {
            "id": row[0],
            "submission_id": row[1],
            "voter_id": row[2],
            "vote_value": row[3],
            "comment": row[4],
            "moderation_status": row[5],
            "created_at": row[6].isoformat() if row[6] else None
        }

        msg = 'Vote submitted but comment flagged automatically by moderation filter.' if is_troll else 'Vote and comment registered successfully.'
        return {"message": msg, "vote": vote}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if 'conn' in locals() and conn:
            conn.close()

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
            "service": "community-service",
            "dbTime": db_time.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database status error: {e}")
    finally:
        if conn:
            conn.close()
