from fastapi import FastAPI, HTTPException
import redis
from elasticsearch import Elasticsearch
import pika
import os
import json
import threading
import time

app = FastAPI(title="Feed Service")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")

# Setup clients
redis_client = redis.from_url(REDIS_URL, decode_responses=True)
es_client = Elasticsearch(ELASTICSEARCH_URL)

def index_in_elasticsearch(content: dict):
    try:
        es_client.index(
            index="submissions",
            id=str(content.get("id")),
            document={
                "title": content.get("title"),
                "description": content.get("description"),
                "category": content.get("category"),
                "created_at": content.get("created_at"),
            }
        )
        redis_client.delete("feed_new")
        print(f"Indexed submission {content.get('id')} in Elasticsearch and invalidated cache.")
    except Exception as e:
        print(f"Elasticsearch index failure: {e}")

def rabbitmq_consumer():
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            channel.queue_declare(queue='content_created')
            
            def callback(ch, method, properties, body):
                try:
                    content = json.loads(body.decode())
                    index_in_elasticsearch(content)
                except Exception as e:
                    print(f"Error in consumer callback: {e}")
                ch.basic_ack(delivery_tag=method.delivery_tag)

            channel.basic_consume(queue='content_created', on_message_callback=callback)
            print("RabbitMQ Consumer started listening on 'content_created'")
            channel.start_consuming()
        except Exception as e:
            print(f"RabbitMQ consumer error: {e}. Reconnecting in 5 seconds...")
            time.sleep(5)

@app.on_event("startup")
def startup_event():
    consumer_thread = threading.Thread(target=rabbitmq_consumer, daemon=True)
    consumer_thread.start()

@app.get("/feeds/{feed_type}")
async def get_feed(feed_type: str):
    cache_key = f"feed_{feed_type}"
    try:
        cached = redis_client.get(cache_key)
        if cached:
            return {"source": "cache", "data": json.loads(cached)}
        
        mock_feeds = [
            {"id": "1", "title": "Potholes on Main Street", "category": "Infrastructure", "score": 98},
            {"id": "2", "title": "Water contamination issue", "category": "Health", "score": 85},
        ]
        
        redis_client.setex(cache_key, 60, json.dumps(mock_feeds))
        return {"source": "db", "data": mock_feeds}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/search")
async def search(q: str):
    if not q:
        raise HTTPException(status_code=400, detail="Search query parameter 'q' is required")
        
    try:
        res = es_client.search(
            index="submissions",
            query={
                "multi_match": {
                    "query": q,
                    "fields": ["title", "description", "category"]
                }
            }
        )
        hits = res['hits']['hits']
        return {
            "results": [hit['_source'] for hit in hits],
            "took": res['took']
        }
    except Exception as e:
        return {
            "error": "Elasticsearch connection bypassed",
            "results": [
                {"title": f"Mock Result matching \"{q}\"", "description": "Sample search indexing description placeholder."}
            ]
        }

@app.get("/health")
async def health():
    try:
        redis_ok = redis_client.ping()
        es_ok = es_client.ping()
        return {
            "status": "ok",
            "service": "feed-service",
            "redis": "connected" if redis_ok else "disconnected",
            "elasticsearch": "connected" if es_ok else "disconnected"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
