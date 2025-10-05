from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import httpx
import base64
import json
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="PrivaChain Decentral API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# IPFS Configuration
IPFS_API_KEY = os.environ.get('IPFS_API_KEY')
IPFS_RPC_ENDPOINT = os.environ.get('IPFS_RPC_ENDPOINT')
IPFS_PROJECT = os.environ.get('IPFS_PROJECT')

# Models
class ContentRequest(BaseModel):
    url: str
    content_type: Optional[str] = "auto"

class ContentResponse(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    url: str
    content: str
    content_type: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str  # 'ipfs', 'http', 'prv'
    metadata: Optional[Dict[str, Any]] = None

class SearchQuery(BaseModel):
    query: str
    search_type: Optional[str] = "hybrid"  # hybrid, ipfs, prv, cosmos
    limit: Optional[int] = 20

class SearchResult(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    url: str
    content_preview: str
    source: str
    metadata: Optional[Dict[str, Any]] = None
    relevance_score: Optional[float] = None

class Message(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    sender: str
    recipient: str
    content: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    encrypted: bool = True
    message_type: str = "text"  # text, file, image

class IPFSService:
    def __init__(self):
        self.api_key = IPFS_API_KEY
        self.rpc_endpoint = IPFS_RPC_ENDPOINT
        self.project = IPFS_PROJECT
    
    async def get_content(self, cid: str) -> Dict[str, Any]:
        """Retrieve content from IPFS using the provided API"""
        try:
            headers = {
                "Authorization": f"Basic {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Try to get content via IPFS API
            async with httpx.AsyncClient() as client:
                # First try to get via gateway
                gateway_url = f"https://ipfs.io/ipfs/{cid}"
                response = await client.get(gateway_url, timeout=10.0)
                
                if response.status_code == 200:
                    content_type = response.headers.get('content-type', 'text/plain')
                    return {
                        "content": response.text if 'text' in content_type else response.content.decode('utf-8', errors='ignore'),
                        "content_type": content_type,
                        "source": "ipfs",
                        "cid": cid
                    }
                else:
                    raise HTTPException(status_code=404, detail=f"IPFS content not found: {cid}")
        except Exception as e:
            logging.error(f"IPFS error for CID {cid}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"IPFS error: {str(e)}")
    
    async def add_content(self, content: str, filename: str = None) -> str:
        """Add content to IPFS and return CID"""
        try:
            headers = {
                "Authorization": f"Basic {self.api_key}"
            }
            
            files = {
                'file': (filename or 'content.txt', content, 'text/plain')
            }
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.rpc_endpoint}/api/v0/add",
                    headers=headers,
                    files=files,
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    result = response.json()
                    return result.get('Hash', '')
                else:
                    raise HTTPException(status_code=500, detail="Failed to add to IPFS")
        except Exception as e:
            logging.error(f"IPFS add error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"IPFS add error: {str(e)}")

class ContentResolver:
    def __init__(self):
        self.ipfs_service = IPFSService()
    
    async def resolve_content(self, url: str) -> Dict[str, Any]:
        """Resolve content based on URL scheme"""
        try:
            if url.startswith('ipfs://'):
                # Extract CID from ipfs:// URL
                cid = url.replace('ipfs://', '').split('/')[0]
                return await self.ipfs_service.get_content(cid)
            
            elif url.endswith('.prv'):
                # Handle .prv domains via Cosmos blockchain
                from services.cosmos_service import cosmos_service
                
                domain_info = await cosmos_service.resolve_prv_domain(url)
                
                if domain_info and domain_info.get("ipfs_hash"):
                    # Fetch content from IPFS using resolved hash
                    ipfs_content = await self.ipfs_service.get_content(domain_info["ipfs_hash"])
                    
                    return {
                        "content": ipfs_content["content"],
                        "content_type": ipfs_content["content_type"],
                        "source": "prv",
                        "domain": url,
                        "blockchain_info": {
                            "owner": domain_info.get("owner"),
                            "registration_height": domain_info.get("registration_height"),
                            "content_hash": domain_info["ipfs_hash"]
                        }
                    }
                else:
                    return {
                        "content": f"<h1>PrivaChain Domain Not Found</h1><p>The domain '{url}' is not registered on the PrivaChain network.</p><p>You can register this domain on the Cosmos blockchain to point to your IPFS content.</p>",
                        "content_type": "text/html",
                        "source": "prv",
                        "domain": url,
                        "error": "domain_not_found"
                    }
            
            elif url.startswith('http://') or url.startswith('https://'):
                # Handle regular HTTP requests with DPI bypass
                return await self.fetch_http_content(url)
            
            else:
                raise HTTPException(status_code=400, detail="Unsupported URL scheme")
        
        except Exception as e:
            logging.error(f"Content resolution error for {url}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Resolution error: {str(e)}")
    
    async def fetch_http_content(self, url: str) -> Dict[str, Any]:
        """Fetch HTTP content with DPI bypass techniques"""
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
            
            async with httpx.AsyncClient(
                follow_redirects=True,
                timeout=30.0,
                headers=headers
            ) as client:
                response = await client.get(url)
                
                if response.status_code == 200:
                    content_type = response.headers.get('content-type', 'text/html')
                    
                    # For complex web apps, we'll let the frontend handle them via iframe
                    # This endpoint is mainly for IPFS and simple content now
                    return {
                        "content": response.text,
                        "content_type": content_type,
                        "source": "http",
                        "url": str(response.url),  # Use final URL after redirects
                        "status_code": response.status_code,
                        "headers": dict(response.headers)
                    }
                else:
                    raise HTTPException(status_code=response.status_code, detail=f"HTTP fetch failed: {response.status_code}")
        except Exception as e:
            logging.error(f"HTTP fetch error for {url}: {str(e)}")
            raise HTTPException(status_code=500, detail=f"HTTP fetch error: {str(e)}")

# Initialize services
content_resolver = ContentResolver()

# Routes
@api_router.get("/")
async def root():
    return {"message": "PrivaChain Decentral API", "version": "1.0.0"}

@api_router.post("/content/resolve", response_model=ContentResponse)
async def resolve_content(request: ContentRequest):
    """Resolve content from various sources (IPFS, HTTP, .prv domains)"""
    try:
        result = await content_resolver.resolve_content(request.url)
        
        content_response = ContentResponse(
            url=request.url,
            content=result["content"],
            content_type=result["content_type"],
            source=result["source"],
            metadata=result.get("metadata")
        )
        
        # Store in database for caching
        await db.content_cache.insert_one(content_response.dict())
        
        return content_response
    
    except Exception as e:
        logging.error(f"Content resolution failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/content/cached", response_model=List[ContentResponse])
async def get_cached_content():
    """Get recently cached content"""
    try:
        cached_items = await db.content_cache.find().sort("timestamp", -1).limit(50).to_list(length=None)
        return [ContentResponse(**item) for item in cached_items]
    except Exception as e:
        logging.error(f"Cache retrieval failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/search", response_model=List[SearchResult])
async def hybrid_search(query: SearchQuery):
    """Perform hybrid search across IPFS, OrbitDB, and other sources"""
    try:
        results = []
        
        # Placeholder search results (OrbitDB integration coming)
        if query.search_type in ["hybrid", "ipfs"]:
            results.append(SearchResult(
                title=f"IPFS Search: {query.query}",
                url=f"ipfs://QmExample{len(query.query)}",
                content_preview=f"Search results for '{query.query}' in IPFS network",
                source="ipfs",
                relevance_score=0.9
            ))
        
        if query.search_type in ["hybrid", "prv"]:
            results.append(SearchResult(
                title=f"PrivaChain Domain: {query.query}",
                url=f"{query.query.lower().replace(' ', '')}.prv",
                content_preview=f"Decentralized content for '{query.query}' on PrivaChain",
                source="prv",
                relevance_score=0.8
            ))
        
        # Store search query for analytics
        search_record = {
            "query": query.query,
            "search_type": query.search_type,
            "timestamp": datetime.now(timezone.utc),
            "results_count": len(results)
        }
        await db.search_queries.insert_one(search_record)
        
        return results[:query.limit]
    
    except Exception as e:
        logging.error(f"Search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/ipfs/add", response_model=Dict[str, str])
async def add_to_ipfs(content: str, filename: str = "content.txt"):
    """Add content to IPFS"""
    try:
        cid = await content_resolver.ipfs_service.add_content(content, filename)
        return {"cid": cid, "url": f"ipfs://{cid}"}
    except Exception as e:
        logging.error(f"IPFS add failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/messages/send", response_model=Message)
async def send_message(message: Message):
    """Send a Web3 message (placeholder for E2E implementation)"""
    try:
        # Store message in database
        message_dict = message.dict()
        await db.messages.insert_one(message_dict)
        
        return message
    except Exception as e:
        logging.error(f"Message send failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/messages/{user_id}", response_model=List[Message])
async def get_messages(user_id: str):
    """Get messages for a user"""
    try:
        messages = await db.messages.find(
            {"$or": [{"sender": user_id}, {"recipient": user_id}]}
        ).sort("timestamp", -1).limit(50).to_list(length=None)
        
        return [Message(**msg) for msg in messages]
    except Exception as e:
        logging.error(f"Message retrieval failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/status/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test database connection
        await db.command("ping")
        
        return {
            "status": "healthy",
            "services": {
                "database": "connected",
                "ipfs": "configured" if IPFS_API_KEY else "not_configured"
            },
            "timestamp": datetime.now(timezone.utc)
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc)
        }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()