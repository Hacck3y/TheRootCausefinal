from fastapi import FastAPI, UploadFile, File, Form, HTTPException
import psycopg2
import boto3
import pika
import exifread
import os
import json
import time
from typing import Optional
from io import BytesIO

app = FastAPI(title="Content Service")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@postgres:5432/content_db")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_PUBLIC_URL = os.getenv("MINIO_PUBLIC_URL", "http://localhost:9000")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")

def get_db_connection():
    return psycopg2.connect(DATABASE_URL)

def get_s3_client():
    return boto3.client(
        's3',
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
        config=boto3.session.Config(signature_version='s3v4')
    )

def publish_event(event_data: dict):
    try:
        params = pika.URLParameters(RABBITMQ_URL)
        connection = pika.BlockingConnection(params)
        channel = connection.channel()
        channel.queue_declare(queue='content_created')
        channel.basic_publish(
            exchange='',
            routing_key='content_created',
            body=json.dumps(event_data)
        )
        connection.close()
    except Exception as e:
        print(f"Failed to publish RabbitMQ event: {e}")

@app.post("/submissions")
async def create_submission(
    title: str = Form(...),
    description: str = Form(...),
    category: str = Form(...),
    authorId: Optional[str] = Form(None),
    media: Optional[UploadFile] = File(None)
):
    exif_data = {}
    media_url = ""

    try:
        if media:
            contents = await media.read()
            
            try:
                tags = exifread.process_file(BytesIO(contents), details=False)
                exif_data = {tag: str(val) for tag, val in tags.items() if tag not in ['JPEGThumbnail', 'TIFFThumbnail']}
            except Exception as e:
                print(f"Failed to parse EXIF: {e}")

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

        conn = get_db_connection()
        with conn.cursor() as cur:
            query = """
                INSERT INTO submissions (title, description, category, author_id, media_url, exif_metadata, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                RETURNING id, title, description, category, author_id, media_url, exif_metadata, created_at;
            """
            cur.execute(query, (
                title,
                description,
                category,
                authorId or "u_anonymous",
                media_url,
                json.dumps(exif_data) if exif_data else None
            ))
            row = cur.fetchone()
        conn.commit()

        submission = {
            "id": row[0],
            "title": row[1],
            "description": row[2],
            "category": row[3],
            "author_id": row[4],
            "media_url": row[5],
            "exif_metadata": row[6],
            "created_at": row[7].isoformat() if row[7] else None
        }

        publish_event(submission)

        return {"message": "Submission created successfully", "submission": submission}

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
