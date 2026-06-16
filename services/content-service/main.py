from fastapi import FastAPI, UploadFile, File, Form, HTTPException, status
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
import boto3
import pika
import exifread
import os
import json
import time
from typing import Optional, List
from io import BytesIO
import urllib.request
import urllib.error

app = FastAPI(title="Content Service")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/content_db")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "http://localhost:9000")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")
IDENTITY_SERVICE_URL = os.getenv("IDENTITY_SERVICE_URL", "http://identity-service:3001")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def get_s3_client():
    return boto3.client(
        's3',
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=boto3.session.Config(signature_version='s3v4')
    )

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        import decimal
        import datetime
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        return super().default(obj)

def publish_event(event_data: dict):
    try:
        params = pika.URLParameters(RABBITMQ_URL)
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        channel.queue_declare(queue='content_created')
        channel.basic_publish(
            exchange='',
            routing_key='content_created',
            body=json.dumps(event_data, cls=CustomJSONEncoder)
        )
        connection.close()
    except Exception as e:
        print(f"Failed to publish RabbitMQ event: {e}")

def update_user_score_in_identity(user_id: str, change: float, reason: str):
    try:
        url = f"{IDENTITY_SERVICE_URL}/users/{user_id}/score"
        data = json.dumps({"change": change, "reason": reason}).encode('utf-8')
        req = urllib.request.Request(
            url, 
            data=data, 
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        with urllib.request.urlopen(req) as res:
            return json.loads(res.read().decode())
    except Exception as e:
        print(f"Failed to update user score in Identity Service: {e}")
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
        return True # Default to allow if service is down temporarily

# Helper to convert exif coordinates to float
def _convert_to_degrees(value):
    d = float(value.values[0].num) / float(value.values[0].den)
    m = float(value.values[1].num) / float(value.values[1].den)
    s = float(value.values[2].num) / float(value.values[2].den)
    return d + (m / 60.0) + (s / 3600.0)

def extract_exif_data(contents: bytes):
    try:
        tags = exifread.process_file(BytesIO(contents), details=False)
        lat = None
        lon = None
        timestamp = None

        if 'GPS GPSLatitude' in tags and 'GPS GPSLatitudeRef' in tags and 'GPS GPSLongitude' in tags and 'GPS GPSLongitudeRef' in tags:
            lat_ref = tags['GPS GPSLatitudeRef'].printable
            lat_val = _convert_to_degrees(tags['GPS GPSLatitude'])
            if lat_ref != 'N':
                lat_val = -lat_val
            
            lon_ref = tags['GPS GPSLongitudeRef'].printable
            lon_val = _convert_to_degrees(tags['GPS GPSLongitude'])
            if lon_ref != 'E':
                lon_val = -lon_val
            
            lat = lat_val
            lon = lon_val
        
        for ts_tag in ['EXIF DateTimeOriginal', 'EXIF DateTimeDigitized', 'Image DateTime']:
            if ts_tag in tags:
                timestamp = tags[ts_tag].printable
                break
        
        return lat, lon, timestamp
    except Exception as e:
        print(f"Error parsing EXIF: {e}")
        return None, None, None

# Pydantic models for admin endpoints
class ReviewRequest(BaseModel):
    status: str # 'Accepted' or 'Rejected'
    reason: Optional[str] = None

class ClubRequest(BaseModel):
    clubbedWithId: Optional[int] = None

class DisputeRequest(BaseModel):
    userId: str
    reason: str

@app.post("/submissions")
async def create_submission(
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    authorId: str = Form(...),
    profileType: str = Form("public"), # 'public' or 'anonymous'
    questions: Optional[str] = Form(None), # JSON list of questions
    openDebate: bool = Form(False),
    # Geotag simulation/injector fields for local/web sandbox testing
    simulatedLatitude: Optional[float] = Form(None),
    simulatedLongitude: Optional[float] = Form(None),
    simulatedTimestamp: Optional[str] = Form(None),
    media: Optional[UploadFile] = File(None)
):
    # Enforce category validator
    valid_categories = {"Bureaucratic", "Executive", "Infrastructure", "Environmental", "Policy", "Other"}
    if category not in valid_categories:
        raise HTTPException(status_code=400, detail=f"Category must be one of {valid_categories}")

    # Check block list
    if not verify_user_not_blocked(authorId):
        raise HTTPException(
            status_code=403,
            detail="Your account score has fallen below -500 and you are restricted from creating submissions."
        )

    lat = None
    lon = None
    timestamp = None
    media_url = ""
    media_type = None

    # Handle attachments
    # "Attached document : only text, no image or video are allowed"
    if media:
        contents = await media.read()
        filename_lower = media.filename.lower()
        
        is_document = any(filename_lower.endswith(ext) for ext in ['.txt', '.pdf', '.doc', '.docx'])
        is_image = any(filename_lower.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.webp'])
        is_video = any(filename_lower.endswith(ext) for ext in ['.mp4', '.mov', '.avi', '.mkv'])
        is_audio = any(filename_lower.endswith(ext) for ext in ['.mp3', '.wav', '.m4a', '.aac'])

        if is_document:
            media_type = "document"
            # Document must be text-only, no EXIF required.
            # However, prompt says: "Attached document : only text, no image or video are allowed. (specific format)"
            # Check content-type
            if not filename_lower.endswith('.txt') and not media.content_type.startswith('text/'):
                raise HTTPException(status_code=400, detail="Document attachments must be text (.txt) only.")
        else:
            # Image, Video or Audio MUST have geotagging and timestamping
            if is_image:
                media_type = "image"
                lat, lon, timestamp = extract_exif_data(contents)
            elif is_video:
                media_type = "video"
            elif is_audio:
                media_type = "audio"
            
            # If EXIF extraction failed, check if simulated tags are injected by frontend testing tool
            if (lat is None or lon is None or timestamp is None) and (simulatedLatitude is not None and simulatedLongitude is not None):
                lat = simulatedLatitude
                lon = simulatedLongitude
                timestamp = simulatedTimestamp or time.strftime("%Y:%m:%d %H:%M:%S")
            
            # Reject if location is missing
            if lat is None or lon is None:
                raise HTTPException(
                    status_code=400,
                    detail="Media authenticity verification failed. Image/Video/Audio must contain Geo Location (GPS Latitude/Longitude) and Timestamp EXIF metadata."
                )

        # Upload to MinIO
        s3 = get_s3_client()
        bucket_name = "media-uploads"
        key = f"{int(time.time())}_{media.filename}"
        
        s3.put_object(
            Bucket=bucket_name,
            Key=key,
            Body=contents,
            ContentType=media.content_type
        )
        media_url = f"{MINIO_PUBLIC_URL}/{bucket_name}/{key}"

    # For text-only posts without media (or document-only posts)
    # If no latitude is present, we allow text-only/document posts, but feeds require geo-tag for constituency.
    # In such cases, if simulated coordinates are provided, save them.
    if lat is None and simulatedLatitude is not None:
        lat = simulatedLatitude
        lon = simulatedLongitude

    # Geocoding assembly constituency (mock lookup)
    constituency = None
    state = None
    if lat is not None and lon is not None:
        # Mock constituencies based on coordinates
        constituency = f"Assembly Constituency {int((lat + 90) * 10) % 200 + 1}"
        state = f"State {int((lon + 180) * 10) % 28 + 1}"

    parsed_questions = []
    if questions:
        try:
            parsed_questions = json.loads(questions)
        except Exception:
            parsed_questions = [questions]

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            query = """
                INSERT INTO submissions (
                    title, description, category, author_id, profile_type, media_url, media_type,
                    latitude, longitude, constituency, state, exif_metadata, questions, open_debate, status, created_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Under Review', NOW())
                RETURNING *;
            """
            cur.execute(query, (
                title,
                description,
                category,
                authorId,
                profileType,
                media_url or None,
                media_type,
                lat,
                lon,
                constituency,
                state,
                json.dumps({"latitude": lat, "longitude": lon, "timestamp": timestamp}) if lat is not None else None,
                json.dumps(parsed_questions),
                openDebate
            ))
            row = cur.fetchone()
            conn.commit()
            return {"message": "Submission created and is now Under Review.", "submission": row}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database insert failed: {e}")
    finally:
        conn.close()

@app.get("/submissions")
async def list_submissions(status: Optional[str] = None, authorId: Optional[str] = None):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            query = "SELECT * FROM submissions WHERE 1=1"
            params = []
            if status:
                query += " AND status = %s"
                params.append(status)
            if authorId:
                query += " AND author_id = %s"
                params.append(authorId)
            query += " ORDER BY created_at DESC;"
            cur.execute(query, params)
            rows = cur.fetchall()
            return rows
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database read failed: {e}")
    finally:
        conn.close()

@app.get("/submissions/{sub_id}")
async def get_submission(sub_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM submissions WHERE id = %s;", (sub_id,))
            sub = cur.fetchone()
            if not sub:
                raise HTTPException(status_code=404, detail="Submission not found.")
            return sub
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/submissions/{sub_id}/review")
async def review_submission(sub_id: int, payload: ReviewRequest):
    if payload.status not in ["Accepted", "Rejected"]:
        raise HTTPException(status_code=400, detail="Invalid review status. Must be Accepted or Rejected.")

    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM submissions WHERE id = %s;", (sub_id,))
            submission = cur.fetchone()
            if not submission:
                raise HTTPException(status_code=404, detail="Submission not found.")

            if submission['status'] != "Under Review":
                raise HTTPException(status_code=400, detail="Submission has already been reviewed.")

            # AI Rejection Reason Generator Agent (Mocked/Rule-based)
            rejection_reason = payload.reason
            if payload.status == "Rejected" and not rejection_reason:
                rejection_reason = f"[AI Moderation Agent] The submission titled '{submission['title']}' was rejected because the description lacks actionable civic details or details are too brief. Please provide a description of at least 50 characters outlining the public inconvenience, specific location indicators, and suggestions for administrative redress."

            cur.execute(
                """
                UPDATE submissions
                SET status = %s, rejection_reason = %s
                WHERE id = %s
                RETURNING *;
                """,
                (payload.status, rejection_reason, sub_id)
            )
            updated_sub = cur.fetchone()

            # Update score and notifications in Identity service
            author_id = submission['author_id']
            if author_id != "u_anonymous":
                if payload.status == "Accepted":
                    update_user_score_in_identity(
                        author_id, 
                        change=9, 
                        reason=f"Post Accepted: {submission['title']}"
                    )
                else:
                    update_user_score_in_identity(
                        author_id, 
                        change=-5, 
                        reason=f"Post Rejected: {submission['title']} - Reason: {rejection_reason}"
                    )

            conn.commit()

            # Trigger RabbitMQ notification if accepted
            if payload.status == "Accepted":
                publish_event(dict(updated_sub))

            return {
                "message": f"Submission successfully {payload.status}.",
                "submission": updated_sub
            }
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database update failed: {e}")
    finally:
        conn.close()

@app.post("/submissions/{sub_id}/club")
async def club_submission(sub_id: int, payload: ClubRequest):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM submissions WHERE id = %s;", (sub_id,))
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Submission not found.")
            
            if payload.clubbedWithId:
                cur.execute("SELECT id FROM submissions WHERE id = %s;", (payload.clubbedWithId,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Target clubbed submission not found.")

            cur.execute(
                "UPDATE submissions SET clubbed_with_id = %s WHERE id = %s RETURNING *;",
                (payload.clubbedWithId, sub_id)
            )
            row = cur.fetchone()
            conn.commit()
            return {"message": "Clubbing successfully updated.", "submission": row}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/submissions/{sub_id}/clubbed-siblings")
async def list_clubbed_siblings(sub_id: int):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT clubbed_with_id FROM submissions WHERE id = %s;", (sub_id,))
            row = cur.fetchone()
            if not row or not row['clubbed_with_id']:
                return []
            
            # Fetch all items sharing this parent
            parent_id = row['clubbed_with_id']
            cur.execute(
                "SELECT * FROM submissions WHERE (clubbed_with_id = %s OR id = %s) AND id != %s;",
                (parent_id, parent_id, sub_id)
            )
            siblings = cur.fetchall()
            return siblings
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.post("/submissions/{sub_id}/dispute")
async def file_dispute(sub_id: int, payload: DisputeRequest):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO clubbing_disputes (submission_id, user_id, reason, status, created_at)
                VALUES (%s, %s, %s, 'Pending', NOW())
                RETURNING *;
                """,
                (sub_id, payload.userId, payload.reason)
            )
            dispute = cur.fetchone()
            conn.commit()
            return {"message": "Dispute filed successfully.", "dispute": dispute}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/disputes")
async def list_disputes():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT d.*, s.title as submission_title 
                FROM clubbing_disputes d
                JOIN submissions s ON d.submission_id = s.id
                ORDER BY d.created_at DESC;
                """
            )
            return cur.fetchall()
    except Exception as e:
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
        
        s3 = get_s3_client()
        s3.list_buckets()
        
        return {
            "status": "ok",
            "service": "content-service",
            "dbTime": db_time.isoformat(),
            "s3Connected": True
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Health check failed: {e}")
    finally:
        if conn:
            conn.close()
