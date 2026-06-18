from fastapi import FastAPI, HTTPException, status, Depends
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
import pika
import os
import json
import urllib.request
import urllib.error
from typing import Optional, List

from auth import require_auth, require_admin

app = FastAPI(title="Community Service")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/moderation_db")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")
IDENTITY_SERVICE_URL = os.getenv("IDENTITY_SERVICE_URL", "http://identity-service:3001")
CONTENT_SERVICE_URL = os.getenv("CONTENT_SERVICE_URL", "http://content-service:3002")

# List of offensive keywords/abuse patterns for simple multilingual troll filtering
OFFENSIVE_KEYWORDS = [
    "abuse", "troll", "bastard", "scam", "fake", "hack", "spam", "nonsense", "idiot", "stupid",
    "bhadwa", "chutiya", "saala", "harami", "kamina", "bewakoof"
]

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        import decimal
        import datetime
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        return super().default(obj)

def publish_rabbitmq_event(event_name: str, payload: dict):
    try:
        params = pika.URLParameters(RABBITMQ_URL)
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        channel.queue_declare(queue=event_name)
        channel.basic_publish(
            exchange='',
            routing_key=event_name,
            body=json.dumps(payload, cls=CustomJSONEncoder)
        )
        connection.close()
    except Exception as e:
        print(f"Failed to publish event to {event_name}: {e}")

def call_identity_service(endpoint: str, data: dict = None, method: str = "POST"):
    try:
        url = f"{IDENTITY_SERVICE_URL}/{endpoint}"
        req_data = json.dumps(data).encode('utf-8') if data else None
        req = urllib.request.Request(
            url,
            data=req_data,
            headers={'Content-Type': 'application/json'} if data else {},
            method=method
        )
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        print(f"Error calling identity-service {endpoint}: {e}")
        return None

def fetch_submission_details(sub_id: int):
    try:
        url = f"{CONTENT_SERVICE_URL}/submissions/{sub_id}"
        with urllib.request.urlopen(url) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        print(f"Error calling content-service to fetch submission {sub_id}: {e}")
        return None

def verify_user_not_blocked(user_id: str) -> bool:
    if not user_id or user_id == "u_anonymous":
        return True
    try:
        url = f"{IDENTITY_SERVICE_URL}/users/{user_id}"
        with urllib.request.urlopen(url) as res:
            user = json.loads(res.read().decode())
            return not user.get("is_blocked", False)
    except Exception as e:
        print(f"Failed to check user blocked status: {e}")
        return True

# Pydantic Request Models
class VoteRequest(BaseModel):
    submissionId: int
    voterId: str
    voteType: str # 'up' or 'down'
    reason: str
    profileType: str = "public" # 'public' or 'anonymous'

class ReportRequest(BaseModel):
    reporterId: str
    contentType: str # 'post', 'comment', 'user', 'debate'
    contentId: str
    reason: str
    screenshotUrl: Optional[str] = None

class SurveyRequest(BaseModel):
    title: str
    description: str
    options: List[str]

class SurveyVoteRequest(BaseModel):
    userId: str
    optionSelected: str

@app.post("/votes")
async def create_vote(payload: VoteRequest, principal: Optional[dict] = Depends(require_auth)):
    # When auth is enforced, trust the token subject as the voter.
    if principal and principal.get("sub"):
        payload.voterId = principal["sub"]

    # Requirement: Comment minimum length (constructive comment minimum 15 characters)
    if not payload.reason or len(payload.reason.strip()) < 15:
        raise HTTPException(
            status_code=400,
            detail="A mandatory constructive comment (minimum 15 characters) is required to vote on submissions."
        )

    # Check restrict status
    if not verify_user_not_blocked(payload.voterId):
        raise HTTPException(
            status_code=403,
            detail="Your account score has fallen below -500. You are restricted from voting, comments, and debates."
        )

    # Verify submission exists and get author
    submission = fetch_submission_details(payload.submissionId)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found.")

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Profile lockout check: "If a user used a public profile to interact with a post, they cannot use their anonymous profile on the same post. Or vice versa."
            cur.execute(
                "SELECT * FROM votes WHERE submission_id = %s AND voter_id = %s;",
                (payload.submissionId, payload.voterId)
            )
            existing_vote = cur.fetchone()

            if existing_vote:
                # If they already voted using a different profile type, block them
                if existing_vote['profile_type'] != payload.profileType:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Profile lockout: You have already voted on this submission using your {existing_vote['profile_type']} profile. You cannot switch profiles on the same post."
                    )
                # If they want to update their vote (same profile type), we'll do an upsert
                # In a real app we would reverse the previous score adjustment. For MVP we'll simply delete the old vote first.
                cur.execute(
                    "DELETE FROM votes WHERE submission_id = %s AND voter_id = %s;",
                    (payload.submissionId, payload.voterId)
                )

            # Troll Filtering
            is_troll = any(kw in payload.reason.lower() for kw in OFFENSIVE_KEYWORDS)
            moderation_status = "flagged" if is_troll else "approved"
            vote_val = 1 if payload.voteType == "up" else -1

            # Insert vote
            cur.execute(
                """
                INSERT INTO votes (submission_id, voter_id, profile_type, vote_value, comment, moderation_status, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING *;
                """,
                (payload.submissionId, payload.voterId, payload.profileType, vote_val, payload.reason, moderation_status)
            )
            vote_row = cur.fetchone()
            conn.commit()

            # Handle scoring triggers in Identity service
            # 1. Author score adjustment: "Upvote/Downvote: +3/-1 for the user who posted"
            author_id = submission['author_id']
            if author_id != "u_anonymous":
                score_change = 3 if payload.voteType == "up" else -1
                call_identity_service(
                    f"users/{author_id}/score",
                    {"change": score_change, "reason": f"Received {payload.voteType}vote on post '{submission['title']}'", "isDownvote": (payload.voteType == "down")}
                )

            # 2. Voter score adjustment: "Comments on thread +1" (provided not flagged as troll)
            if payload.voterId != "u_anonymous" and payload.profileType == "public":
                if is_troll:
                    # Troll Penalty: "Spamming/Trolling -50"
                    call_identity_service(
                        f"users/{payload.voterId}/score",
                        {"change": -50, "reason": f"Spamming/Trolling comment on post '{submission['title']}'"}
                    )
                else:
                    call_identity_service(
                        f"users/{payload.voterId}/score",
                        {"change": 1, "reason": f"Constructive comment on post '{submission['title']}'"}
                    )

            # Publish event to RabbitMQ for feed update
            publish_rabbitmq_event("vote_created", dict(vote_row))

            msg = "Vote submitted but flagged automatically by moderation filter." if is_troll else "Vote and constructive comment registered successfully."
            return {"message": msg, "vote": vote_row}

    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database vote execution failed: {e}")
    finally:
        conn.close()

@app.get("/votes/submission/{sub_id}")
async def list_votes_for_submission(sub_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM votes WHERE submission_id = %s ORDER BY created_at DESC;", (sub_id,))
            return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/reports")
async def create_report(payload: ReportRequest, _user: Optional[dict] = Depends(require_auth)):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO reports (reporter_id, content_type, content_id, reason, screenshot_url, status, created_at)
                VALUES (%s, %s, %s, %s, %s, 'Pending', NOW())
                RETURNING *;
                """,
                (payload.reporterId, payload.contentType, payload.contentId, payload.reason, payload.screenshotUrl)
            )
            row = cur.fetchone()
            conn.commit()
            return {"message": "Report submitted successfully.", "report": row}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/reports")
async def list_reports(_admin: Optional[dict] = Depends(require_admin)):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM reports ORDER BY created_at DESC;")
            return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/reports/{report_id}/resolve")
async def resolve_report(report_id: int, status: str = "Resolved", banUser: bool = False, userId: Optional[str] = None, _admin: Optional[dict] = Depends(require_admin)):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE reports SET status = %s WHERE id = %s RETURNING *;", (status, report_id))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Report not found.")
            
            if banUser and userId:
                # Post Ban / User Ban score penalty: "Post Ban: -100" or User ban
                call_identity_service(
                    f"users/{userId}/score",
                    {"change": -100, "reason": "Administrative block / Ban for terms violation."}
                )
            
            conn.commit()
            return {"message": "Report resolved successfully.", "report": row}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/surveys")
async def create_survey(payload: SurveyRequest, _admin: Optional[dict] = Depends(require_admin)):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO surveys (title, description, options, created_at)
                VALUES (%s, %s, %s, NOW())
                RETURNING *;
                """,
                (payload.title, payload.description, json.dumps(payload.options))
            )
            row = cur.fetchone()
            conn.commit()
            return {"message": "Survey created successfully.", "survey": row}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/surveys")
async def list_surveys():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM surveys ORDER BY created_at DESC;")
            return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/surveys/{survey_id}/vote")
async def vote_survey(survey_id: int, payload: SurveyVoteRequest, principal: Optional[dict] = Depends(require_auth)):
    if principal and principal.get("sub"):
        payload.userId = principal["sub"]
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check user eligibility (e.g. not blocked)
            if not verify_user_not_blocked(payload.userId):
                raise HTTPException(
                    status_code=403,
                    detail="Your account score is under -500. Restricted from participation."
                )

            cur.execute(
                """
                INSERT INTO survey_votes (survey_id, user_id, option_selected, created_at)
                VALUES (%s, %s, %s, NOW())
                RETURNING *;
                """,
                (survey_id, payload.userId, payload.optionSelected)
            )
            row = cur.fetchone()
            conn.commit()
            return {"message": "Survey vote registered.", "vote": row}
    except psycopg2.IntegrityError:
        conn.rollback()
        raise HTTPException(status_code=400, detail="You have already voted on this survey.")
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/health")
async def health():
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT NOW();")
            db_time = cur.fetchone()['now']
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
