# The CivicX — Identity Service (auth, profiles, scoring, notifications)
from fastapi import FastAPI, HTTPException, status, Depends
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
import hashlib
import hmac
import os
import random
from typing import Optional, List

from auth import create_access_token, require_auth

app = FastAPI(title="Identity Service")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/user_db")

# Feature flags / secrets (see SETUP_TODO.md)
DEV_MODE = os.getenv("DEV_MODE", "false").lower() == "true"          # exposes OTP in responses
ALLOW_MOCK_AUTH = os.getenv("ALLOW_MOCK_AUTH", "true").lower() == "true"  # accept client-provided OAuth payload
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")                 # when set, Google ID tokens are verified
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")               # CHANGE in production

# Simple OTP storage in-memory for validation (in a real app, use Redis/cache)
# Map: phone_number -> otp_code
OTP_STORE = {}


def verify_google_id_token(token: str) -> Optional[dict]:
    """Verify a Google ID token when GOOGLE_CLIENT_ID is configured.

    Returns the verified claims (with at least 'email' and 'name'), or raises
    HTTPException on failure. Returns None when verification is not configured.
    """
    if not GOOGLE_CLIENT_ID:
        return None
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        claims = google_id_token.verify_oauth2_token(
            token, google_requests.Request(), GOOGLE_CLIENT_ID
        )
        return {"email": claims.get("email"), "name": claims.get("name") or claims.get("email")}
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Google token verification failed: {e}")


def send_otp_sms(phone: str, otp: str) -> None:
    """Dispatch the OTP via an SMS provider when configured.

    Supports Twilio out of the box (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
    and TWILIO_FROM_NUMBER). If no provider is configured, this is a no-op and
    the OTP is only surfaced via DEV_MODE. See SETUP_TODO.md.
    """
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_FROM_NUMBER")
    if not (sid and auth_token and from_number):
        if not DEV_MODE:
            print("WARNING: No SMS provider configured; OTP not delivered. Set TWILIO_* env vars.")
        return
    try:
        from twilio.rest import Client
        client = Client(sid, auth_token)
        client.messages.create(
            body=f"Your CivicX verification code is {otp}",
            from_=from_number,
            to=phone,
        )
    except Exception as e:
        print(f"Failed to send OTP SMS via Twilio: {e}")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

# Pydantic models
class OAuthLoginRequest(BaseModel):
    provider: str
    token: str
    email: str
    name: str

class RequestOTPRequest(BaseModel):
    phone: str
    captchaToken: str

class VerificationRequest(BaseModel):
    userId: str
    phone: str
    otp: str
    captchaToken: str

class ScoreUpdateRequest(BaseModel):
    change: float
    reason: str
    isDownvote: bool = False

class Enable2FARequest(BaseModel):
    userId: str
    enabled: bool

# Help determine title based on score
def determine_title(score: int) -> str:
    milestones = [
        (1000000, "Mukhya Mantri"),
        (100000, "Mantri"),
        (50000, "Adhyaksha"),
        (20000, "Maha Sachiv"),
        (10000, "Sachiv"),
        (1000, "Pradhan"),
        (500, "Pravakta"),
        (100, "Pracharak"),
        (50, "Karyakarta"),
        (10, "Sewak")
    ]
    for limit, title in milestones:
        if score >= limit:
            return title
    return "Sewak"

@app.post("/login/oauth")
async def login_oauth(payload: OAuthLoginRequest):
    if payload.provider.lower() != "google":
        raise HTTPException(status_code=400, detail="Only Google authentication is supported.")

    # Determine the trusted identity. In production (GOOGLE_CLIENT_ID set), the
    # email/name come from the verified Google ID token, not the request body.
    email = payload.email
    name = payload.name
    verified = verify_google_id_token(payload.token)
    if verified:
        email = verified["email"]
        name = verified["name"]
    elif not ALLOW_MOCK_AUTH:
        raise HTTPException(
            status_code=401,
            detail="OAuth verification is required. Configure GOOGLE_CLIENT_ID or enable ALLOW_MOCK_AUTH for development.",
        )

    if not email:
        raise HTTPException(status_code=400, detail="A valid email is required.")

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check if user exists
            cur.execute("SELECT * FROM users WHERE email = %s;", (email,))
            user = cur.fetchone()

            if not user:
                # Create user
                user_id = "u_" + hashlib.md5(email.encode()).hexdigest()[:12]
                public_username = name.lower().replace(" ", "_") + "_" + user_id[-4:]
                anonymous_username = "anon_" + user_id[-8:]

                cur.execute(
                    """
                    INSERT INTO users (id, name, email, public_username, anonymous_username, score, title, two_fa_enabled)
                    VALUES (%s, %s, %s, %s, %s, 0, 'Sewak', FALSE)
                    RETURNING *;
                    """,
                    (user_id, name, email, public_username, anonymous_username)
                )
                user = cur.fetchone()
                conn.commit()

        return {
            "message": "Login successful",
            "user": user,
            "token": create_access_token(user["id"], role="user"),
        }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()

@app.post("/request-otp")
async def request_otp(payload: RequestOTPRequest):
    if not payload.captchaToken:
        raise HTTPException(status_code=400, detail="Captcha verification failed.")
    
    # Simple simulated OTP generation
    otp = str(random.randint(100000, 999999))
    OTP_STORE[payload.phone] = otp

    # In production this dispatches the OTP via an SMS provider (see
    # send_otp_sms / SETUP_TODO.md). The raw OTP is only returned in the
    # response when DEV_MODE is enabled, never in production.
    send_otp_sms(payload.phone, otp)

    response = {
        "message": "OTP generated successfully",
        "phone": payload.phone,
        "info": "This verification process creates a SHA-256 hash of your phone number to prevent duplicate registrations. We do NOT store your phone number or the OTP code.",
    }
    if DEV_MODE:
        response["otp"] = otp  # development convenience only
    return response

@app.post("/verify")
async def verify(payload: VerificationRequest):
    if not payload.captchaToken:
        raise HTTPException(status_code=400, detail="Captcha verification is mandatory.")

    # Check OTP
    stored_otp = OTP_STORE.get(payload.phone)
    if not stored_otp or stored_otp != payload.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP code.")

    # Create SHA-256 hash
    phone_hash = hashlib.sha256(payload.phone.encode()).hexdigest()

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            # Check for duplicacy
            cur.execute("SELECT id FROM users WHERE phone_hash = %s AND id != %s;", (phone_hash, payload.userId))
            duplicate = cur.fetchone()
            if duplicate:
                raise HTTPException(status_code=400, detail="This phone number has already been used to verify another account.")

            # Update user
            cur.execute(
                "UPDATE users SET phone_hash = %s WHERE id = %s RETURNING *;",
                (phone_hash, payload.userId)
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found.")
            
            conn.commit()

            # Clean OTP
            OTP_STORE.pop(payload.phone, None)

            return {
                "verified": True,
                "message": "User verified successfully.",
                "user": user
            }
    except HTTPException:
        conn.rollback()
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Verification failed: {e}")
    finally:
        conn.close()

@app.get("/users/{user_id}")
async def get_user(user_id: str):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found.")
            return user
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()

@app.post("/users/2fa")
async def update_2fa(payload: Enable2FARequest):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE users SET two_fa_enabled = %s WHERE id = %s RETURNING *;",
                (payload.enabled, payload.userId)
            )
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found.")
            conn.commit()
            return {"message": "2FA updated successfully", "user": user}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()

@app.post("/users/{user_id}/score")
async def update_score(user_id: str, payload: ScoreUpdateRequest):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s;", (user_id,))
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found.")

            old_score = user['score']
            change = payload.change

            # Scaling rejection cost: "if a person crosses 500 score their post rejection score cost will be higher, scaling by a ratio 1:10, so at 500, each reject post would -50"
            if change < 0 and "Post Rejected" in payload.reason and old_score >= 500:
                # Change is normally -5. Scaled 1:10, so at >= 500 it becomes -50.
                change = change * 10

            new_score = old_score + change
            new_title = determine_title(int(new_score))

            # Is restricted check: "If a users score falls below -500, they are restricted from voting, comments and debates"
            is_blocked = True if new_score < -500 else False

            cur.execute(
                """
                UPDATE users
                SET score = %s, title = %s, is_blocked = %s
                WHERE id = %s
                RETURNING *;
                """,
                (int(new_score), new_title, is_blocked, user_id)
            )
            updated_user = cur.fetchone()

            # Create notification for negative updates, except downvotes
            if change < 0 and not payload.isDownvote:
                cur.execute(
                    """
                    INSERT INTO user_notifications (user_id, type, message)
                    VALUES (%s, 'score_update', %s);
                    """,
                    (user_id, f"Your score was reduced by {abs(change)} because: {payload.reason}. Current score: {int(new_score)}")
                )

            # Create notification for rank up
            if new_title != user['title'] and new_score > old_score:
                cur.execute(
                    """
                    INSERT INTO user_notifications (user_id, type, message)
                    VALUES (%s, 'rank_up', %s);
                    """,
                    (user_id, f"Congratulations! You have been promoted to the rank of {new_title}!")
                )

            conn.commit()
            return {"message": "Score updated successfully", "user": updated_user}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()

@app.get("/users/{user_id}/notifications")
async def get_notifications(user_id: str):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM user_notifications WHERE user_id = %s ORDER BY created_at DESC;",
                (user_id,)
            )
            notifications = cur.fetchall()
            return notifications
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()

@app.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE user_notifications SET is_read = TRUE WHERE id = %s RETURNING *;",
                (notif_id,)
            )
            notif = cur.fetchone()
            if not notif:
                raise HTTPException(status_code=404, detail="Notification not found.")
            conn.commit()
            return {"message": "Notification marked as read", "notification": notif}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        conn.close()

class AdminLoginRequest(BaseModel):
    username: str
    password: str


@app.post("/admin/login")
async def admin_login(payload: AdminLoginRequest):
    """Authenticate a staff/admin user and issue an admin-role JWT.

    Credentials are configured via ADMIN_USERNAME / ADMIN_PASSWORD. Compared
    in constant time to avoid timing attacks.
    """
    user_ok = hmac.compare_digest(payload.username, ADMIN_USERNAME)
    pass_ok = hmac.compare_digest(payload.password, ADMIN_PASSWORD)
    if not (user_ok and pass_ok):
        raise HTTPException(status_code=401, detail="Invalid administrator credentials.")
    return {
        "message": "Admin login successful",
        "token": create_access_token(f"admin:{payload.username}", role="admin"),
        "role": "admin",
    }


@app.get("/me")
async def me(principal: Optional[dict] = Depends(require_auth)):
    """Return the current user derived from the bearer token."""
    if not principal:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    if principal.get("role") == "admin":
        return {"id": principal.get("sub"), "role": "admin"}
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM users WHERE id = %s;", (principal.get("sub"),))
            user = cur.fetchone()
            if not user:
                raise HTTPException(status_code=404, detail="User not found.")
            return user
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
            "service": "identity-service",
            "dbTime": db_time.isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database status error: {e}")
    finally:
        if conn:
            conn.close()
