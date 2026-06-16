from fastapi import FastAPI, HTTPException, Query
import redis
from elasticsearch import Elasticsearch
import pika
import os
import json
import threading
import time
from datetime import datetime, timedelta
from typing import Optional, List

app = FastAPI(title="Feed Service")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
ELASTICSEARCH_URL = os.getenv("ELASTICSEARCH_URL", "http://elasticsearch:9200")
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")

# Setup clients
redis_client = redis.from_url(REDIS_URL, decode_responses=True)
es_client = Elasticsearch(ELASTICSEARCH_URL)

# Fallback local in-memory store if Elasticsearch is down
IN_MEMORY_FEED = {}

def get_submission_by_id(sub_id: str):
    # Retrieve from Elasticsearch or local memory
    try:
        res = es_client.get(index="submissions", id=sub_id)
        return res['_source']
    except Exception:
        return IN_MEMORY_FEED.get(str(sub_id))

def index_in_elasticsearch(content: dict):
    sub_id = str(content.get("id"))
    doc = {
        "id": sub_id,
        "title": content.get("title"),
        "description": content.get("description"),
        "category": content.get("category"),
        "author_id": content.get("author_id"),
        "profile_type": content.get("profile_type"),
        "media_url": content.get("media_url"),
        "media_type": content.get("media_type"),
        "latitude": content.get("latitude"),
        "longitude": content.get("longitude"),
        "constituency": content.get("constituency"),
        "state": content.get("state"),
        "created_at": content.get("created_at"),
        "status": content.get("status"),
        "open_debate": content.get("open_debate", False),
        "questions": content.get("questions", []),
        "votes_count": content.get("votes_count", 0),
        "comments_count": content.get("comments_count", 0),
        "interactions": content.get("interactions", [])
    }
    
    # Store locally in memory
    IN_MEMORY_FEED[sub_id] = doc

    try:
        es_client.index(
            index="submissions",
            id=sub_id,
            document=doc
        )
        # Invalidate caches
        for key in redis_client.scan_iter("feed_*"):
            redis_client.delete(key)
        print(f"Indexed submission {sub_id} in Elasticsearch and invalidated Redis cache.")
    except Exception as e:
        print(f"Elasticsearch index failure: {e}")

def update_vote_metrics(vote_data: dict):
    sub_id = str(vote_data.get("submission_id"))
    sub = get_submission_by_id(sub_id)
    if not sub:
        print(f"Submission {sub_id} not found for updating vote metrics.")
        return

    # Increment counts
    sub["votes_count"] = sub.get("votes_count", 0) + 1
    sub["comments_count"] = sub.get("comments_count", 0) + 1
    
    # Add interaction timestamp
    interactions = sub.get("interactions", [])
    interactions.append({
        "voter_id": vote_data.get("voter_id"),
        "timestamp": vote_data.get("created_at") or datetime.utcnow().isoformat()
    })
    sub["interactions"] = interactions

    index_in_elasticsearch(sub)

def calculate_interaction_rate(sub: dict, hours: int = 1) -> float:
    # Interaction rate is the number of user interactions within the last X hours
    created_str = sub.get("created_at")
    if not created_str:
        return 0.0
    
    try:
        created_time = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
    except ValueError:
        created_time = datetime.utcnow()

    # Calculate interactions
    interactions = sub.get("interactions", [])
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    
    recent_interactions = 0
    for inter in interactions:
        try:
            ts = datetime.fromisoformat(inter.get("timestamp").replace("Z", "+00:00"))
            if ts >= cutoff:
                recent_interactions += 1
        except Exception:
            pass
            
    # Include original posts created inside the window
    if created_time >= cutoff:
        recent_interactions += 1

    return float(recent_interactions)

def rabbitmq_consumer():
    while True:
        try:
            params = pika.URLParameters(RABBITMQ_URL)
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            
            # Setup content queue
            channel.queue_declare(queue='content_created')
            
            # Setup votes queue
            channel.queue_declare(queue='vote_created')
            
            def content_callback(ch, method, properties, body):
                try:
                    content = json.loads(body.decode())
                    index_in_elasticsearch(content)
                except Exception as e:
                    print(f"Error in content callback: {e}")
                ch.basic_ack(delivery_tag=method.delivery_tag)

            def vote_callback(ch, method, properties, body):
                try:
                    vote_data = json.loads(body.decode())
                    update_vote_metrics(vote_data)
                except Exception as e:
                    print(f"Error in vote callback: {e}")
                ch.basic_ack(delivery_tag=method.delivery_tag)

            channel.basic_consume(queue='content_created', on_message_callback=content_callback)
            channel.basic_consume(queue='vote_created', on_message_callback=vote_callback)
            
            print("RabbitMQ Consumer listening on 'content_created' and 'vote_created'")
            channel.start_consuming()
        except Exception as e:
            print(f"RabbitMQ consumer error: {e}. Reconnecting in 5 seconds...")
            time.sleep(5)

@app.on_event("startup")
def startup_event():
    # Pre-populate some mock feeds in IN_MEMORY_FEED for robust testing fallbacks
    mock_data = [
        {
            "id": "1",
            "title": "Water Contamination in Sector 4",
            "description": "Drinking water in block C has a strong chemical smell. Multiple families reported illness.",
            "category": "Environmental",
            "author_id": "u_user1",
            "profile_type": "public",
            "latitude": 28.6139,
            "longitude": 77.2090,
            "constituency": "Assembly Constituency 12",
            "state": "State 5",
            "created_at": (datetime.utcnow() - timedelta(hours=2)).isoformat(),
            "status": "Accepted",
            "votes_count": 12,
            "comments_count": 12,
            "interactions": [{"voter_id": f"u_{i}", "timestamp": datetime.utcnow().isoformat()} for i in range(12)]
        },
        {
            "id": "2",
            "title": "Severe Potholes near Market Crossing",
            "description": "Large potholes causing traffic gridlocks and minor accidents on a daily basis.",
            "category": "Infrastructure",
            "author_id": "u_user2",
            "profile_type": "anonymous",
            "latitude": 28.6145,
            "longitude": 77.2095,
            "constituency": "Assembly Constituency 12",
            "state": "State 5",
            "created_at": (datetime.utcnow() - timedelta(hours=12)).isoformat(),
            "status": "Accepted",
            "votes_count": 8,
            "comments_count": 8,
            "interactions": [{"voter_id": f"u_{i}", "timestamp": datetime.utcnow().isoformat()} for i in range(8)]
        }
    ]
    for doc in mock_data:
        IN_MEMORY_FEED[doc["id"]] = doc

    consumer_thread = threading.Thread(target=rabbitmq_consumer, daemon=True)
    consumer_thread.start()

@app.get("/feeds/new")
async def get_new_feed(
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1)
):
    # New Submissions: Submissions created in the last 24 hours.
    cache_key = f"feed_new_p{page}_l{limit}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    cutoff = datetime.utcnow() - timedelta(days=1)
    results = []

    # Try Elasticsearch
    try:
        res = es_client.search(
            index="submissions",
            query={
                "range": {
                    "created_at": {
                        "gte": cutoff.isoformat()
                    }
                }
            },
            sort=[{"created_at": "desc"}],
            from_=(page - 1) * limit,
            size=limit
        )
        results = [hit['_source'] for hit in res['hits']['hits']]
    except Exception:
        # Fallback to local memory
        all_subs = list(IN_MEMORY_FEED.values())
        filtered = [
            sub for sub in all_subs 
            if datetime.fromisoformat(sub["created_at"].replace("Z", "+00:00")) >= cutoff
        ]
        filtered.sort(key=lambda x: x["created_at"], reverse=True)
        results = filtered[(page - 1) * limit : page * limit]

    redis_client.setex(cache_key, 30, json.dumps(results)) # Cache for 30 seconds
    return results

@app.get("/feeds/trending")
async def get_trending_feed(
    category: Optional[str] = None,
    constituency: Optional[str] = None,
    state: Optional[str] = None
):
    # Trending: Top 50 trending posts in every hour cycle, based on interaction rate
    cache_key = f"feed_trending_{category}_{constituency}_{state}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    all_subs = []
    try:
        res = es_client.search(
            index="submissions",
            query={"match_all": {}},
            size=1000
        )
        all_subs = [hit['_source'] for hit in res['hits']['hits']]
    except Exception:
        all_subs = list(IN_MEMORY_FEED.values())

    # Apply filters
    if category:
        all_subs = [s for s in all_subs if s.get("category") == category]
    if constituency:
        all_subs = [s for s in all_subs if s.get("constituency") == constituency]
    if state:
        all_subs = [s for s in all_subs if s.get("state") == state]

    # Calculate rate and sort
    for sub in all_subs:
        sub["trending_rate"] = calculate_interaction_rate(sub, hours=1)

    all_subs.sort(key=lambda x: x["trending_rate"], reverse=True)
    results = all_subs[:50]

    redis_client.setex(cache_key, 30, json.dumps(results))
    return results

@app.get("/feeds/local")
async def get_local_feed(
    constituency: str,
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1)
):
    # Local: Any submission made in an assembly constituency based on the geo location tagging of posts
    cache_key = f"feed_local_{constituency}_p{page}_l{limit}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    results = []
    try:
        res = es_client.search(
            index="submissions",
            query={
                "term": {
                    "constituency.keyword": constituency
                }
            },
            sort=[{"created_at": "desc"}],
            from_=(page - 1) * limit,
            size=limit
        )
        results = [hit['_source'] for hit in res['hits']['hits']]
    except Exception:
        all_subs = list(IN_MEMORY_FEED.values())
        filtered = [s for s in all_subs if s.get("constituency") == constituency]
        filtered.sort(key=lambda x: x["created_at"], reverse=True)
        results = filtered[(page - 1) * limit : page * limit]

    redis_client.setex(cache_key, 30, json.dumps(results))
    return results

@app.get("/feeds/national")
async def get_national_feed(
    category: Optional[str] = None,
    constituency: Optional[str] = None,
    state: Optional[str] = None
):
    # National: Any post within India. Submissions with a 24 hours higher interaction rate average. Top 500.
    cache_key = f"feed_national_{category}_{constituency}_{state}"
    cached = redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    all_subs = []
    try:
        res = es_client.search(
            index="submissions",
            query={"match_all": {}},
            size=1000
        )
        all_subs = [hit['_source'] for hit in res['hits']['hits']]
    except Exception:
        all_subs = list(IN_MEMORY_FEED.values())

    # Apply filters
    if category:
        all_subs = [s for s in all_subs if s.get("category") == category]
    if constituency:
        all_subs = [s for s in all_subs if s.get("constituency") == constituency]
    if state:
        all_subs = [s for s in all_subs if s.get("state") == state]

    # Calculate 24h interaction rate average and sort
    for sub in all_subs:
        sub["national_rate"] = calculate_interaction_rate(sub, hours=24)

    all_subs.sort(key=lambda x: x["national_rate"], reverse=True)
    results = all_subs[:500]

    redis_client.setex(cache_key, 30, json.dumps(results))
    return results

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
                    "fields": ["title", "description", "category", "constituency", "state"]
                }
            }
        )
        hits = res['hits']['hits']
        return {
            "results": [hit['_source'] for hit in hits],
            "took": res['took']
        }
    except Exception:
        # Fallback search matching substrings
        q_lower = q.lower()
        results = [
            sub for sub in IN_MEMORY_FEED.values()
            if q_lower in sub.get("title", "").lower() 
            or q_lower in sub.get("description", "").lower()
            or q_lower in sub.get("category", "").lower()
        ]
        return {
            "results": results,
            "took": 0
        }

@app.get("/health")
async def health():
    try:
        redis_ok = redis_client.ping()
    except Exception:
        redis_ok = False

    try:
        es_ok = es_client.ping()
    except Exception:
        es_ok = False

    return {
        "status": "ok",
        "service": "feed-service",
        "redis": "connected" if redis_ok else "disconnected",
        "elasticsearch": "connected" if es_ok else "disconnected"
    }
