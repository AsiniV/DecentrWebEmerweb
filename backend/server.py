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
        from services.privacy_service import privacy_service
        self.privacy_service = privacy_service
    
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
        """Fetch HTTP content with privacy features enabled by default"""
        try:
            # Use privacy service for enhanced protection
            private_request = await self.privacy_service.create_private_request(url, 'GET')
            
            # Use privacy-enhanced headers and session
            headers = private_request['headers']
            
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

# Initialize Cosmos service on startup
@app.on_event("startup")
async def startup_event():
    from services.cosmos_service import cosmos_service
    from services.working_browser_service import working_browser_service
    from services.privacy_service import privacy_service
    
    # Initialize privacy services first (they're foundational)
    privacy_initialized = await privacy_service.initialize()
    if privacy_initialized:
        logger.info("✅ ALL PRIVACY FEATURES ENABLED BY DEFAULT")
    
    await cosmos_service.initialize()
    await working_browser_service.initialize()

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
    """Perform hybrid search across IPFS, OrbitDB, and Cosmos blockchain"""
    try:
        from services.cosmos_service import cosmos_service
        
        results = []
        
        # Search IPFS network
        if query.search_type in ["hybrid", "ipfs"]:
            ipfs_results = await search_ipfs_content(query.query, query.limit // 2)
            results.extend(ipfs_results)
        
        # Search PrivaChain domains on Cosmos
        if query.search_type in ["hybrid", "prv", "cosmos"]:
            prv_results = await cosmos_service.search_domains(query.query, query.limit // 2)
            
            for domain_info in prv_results:
                results.append(SearchResult(
                    title=domain_info.get("title", f"PrivaChain Domain: {domain_info['domain']}"),
                    url=domain_info["domain"],
                    content_preview=domain_info.get("description", f"Decentralized content on {domain_info['domain']}"),
                    source="prv",
                    relevance_score=calculate_domain_relevance(domain_info["domain"], query.query),
                    metadata={
                        "owner": domain_info.get("owner"),
                        "content_hash": domain_info.get("content_hash"),
                        "blockchain": "cosmos"
                    }
                ))
        
        # Search Cosmos chain directly
        if query.search_type in ["hybrid", "cosmos"]:
            cosmos_results = await search_cosmos_chain(query.query, query.limit // 3)
            results.extend(cosmos_results)
        
        # Sort by relevance score
        results.sort(key=lambda x: x.relevance_score or 0, reverse=True)
        
        # Store search query for analytics
        search_record = {
            "query": query.query,
            "search_type": query.search_type,
            "timestamp": datetime.now(timezone.utc),
            "results_count": len(results),
            "sources": list(set(r.source for r in results))
        }
        await db.search_queries.insert_one(search_record)
        
        return results[:query.limit]
    
    except Exception as e:
        logging.error(f"Search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def search_ipfs_content(query: str, limit: int) -> List[SearchResult]:
    """Search for IPFS content"""
    try:
        results = []
        
        # Search known IPFS hashes and content
        known_content = [
            {
                "cid": "QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o",
                "title": "Hello World Content",
                "description": "Simple text content on IPFS"
            },
            {
                "cid": "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG",
                "title": "IPFS Directory Example",
                "description": "Example directory structure on IPFS"
            }
        ]
        
        query_lower = query.lower()
        
        for content in known_content:
            if (query_lower in content["title"].lower() or 
                query_lower in content["description"].lower()):
                results.append(SearchResult(
                    title=content["title"],
                    url=f"ipfs://{content['cid']}",
                    content_preview=content["description"],
                    source="ipfs",
                    relevance_score=calculate_text_relevance(content["title"] + " " + content["description"], query),
                    metadata={"cid": content["cid"]}
                ))
        
        return results[:limit]
        
    except Exception as e:
        logging.error(f"IPFS search error: {str(e)}")
        return []


async def search_cosmos_chain(query: str, limit: int) -> List[SearchResult]:
    """Search Cosmos blockchain for transactions and data"""
    try:
        from services.cosmos_service import cosmos_service
        
        results = []
        
        # Search for transactions, smart contracts, etc.
        chain_info = await cosmos_service.get_chain_info()
        
        if chain_info.get("connected"):
            results.append(SearchResult(
                title=f"Cosmos Chain Query: {query}",
                url=f"https://mintscan.io/cosmos/txs?q={query}",
                content_preview=f"Blockchain data related to '{query}' on {chain_info.get('chain_id', 'Cosmos Hub')}",
                source="cosmos",
                relevance_score=0.7,
                metadata={
                    "chain_id": chain_info.get("chain_id"),
                    "latest_height": chain_info.get("latest_block_height")
                }
            ))
        
        return results[:limit]
        
    except Exception as e:
        logging.error(f"Cosmos search error: {str(e)}")
        return []


def calculate_domain_relevance(domain: str, query: str) -> float:
    """Calculate relevance score for domain vs query"""
    domain_lower = domain.lower().replace('.prv', '')
    query_lower = query.lower()
    
    if domain_lower == query_lower:
        return 1.0
    elif query_lower in domain_lower:
        return 0.8
    elif domain_lower in query_lower:
        return 0.6
    else:
        return 0.4


def calculate_text_relevance(text: str, query: str) -> float:
    """Calculate relevance score for text vs query"""
    text_lower = text.lower()
    query_terms = query.lower().split()
    
    matches = sum(1 for term in query_terms if term in text_lower)
    return min(matches / len(query_terms), 1.0)

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

@api_router.get("/proxy")
async def proxy_website(url: str):
    """Proxy websites to bypass X-Frame-Options restrictions"""
    try:
        if not url.startswith(('http://', 'https://')):
            raise HTTPException(status_code=400, detail="Invalid URL scheme")
        
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        }
        
        async with httpx.AsyncClient(follow_redirects=True, timeout=30.0) as client:
            response = await client.get(url, headers=headers)
            
            if response.status_code == 200:
                content = response.text
                
                # Remove X-Frame-Options and CSP headers that block iframe embedding
                content = modify_content_for_iframe(content, url)
                
                return {
                    "content": content,
                    "content_type": "text/html",
                    "status_code": response.status_code,
                    "proxied": True
                }
            else:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch website")
                
    except Exception as e:
        logging.error(f"Proxy error for {url}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Proxy error: {str(e)}")


def modify_content_for_iframe(content: str, base_url: str) -> str:
    """Modify HTML content to work better in iframe"""
    try:
        from urllib.parse import urljoin, urlparse
        
        # Remove or modify problematic headers in meta tags
        content = content.replace('X-Frame-Options', 'X-Frame-Options-Disabled')
        content = content.replace('frame-ancestors', 'frame-ancestors-disabled')
        
        # Fix relative URLs to absolute URLs
        base_domain = urlparse(base_url).netloc
        
        # Basic relative URL fixing (this could be enhanced)
        content = content.replace('href="/', f'href="https://{base_domain}/')
        content = content.replace('src="/', f'src="https://{base_domain}/')
        content = content.replace("href='/", f"href='https://{base_domain}/")
        content = content.replace("src='/", f"src='https://{base_domain}/")
        
        # Add base tag for better resource loading
        base_tag = f'<base href="{base_url}">'
        if '<head>' in content:
            content = content.replace('<head>', f'<head>{base_tag}')
        
        # Add iframe-friendly meta tags
        iframe_meta = '''
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
        html, body { 
            margin: 0; 
            padding: 0; 
            width: 100%; 
            height: 100%; 
            overflow-x: auto;
        }
        </style>
        '''
        
        if '<head>' in content:
            content = content.replace('<head>', f'<head>{iframe_meta}')
        
        return content
        
    except Exception as e:
        logging.error(f"Content modification error: {str(e)}")
        return content


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

# Advanced Browser rendering endpoints  
@api_router.post("/browser/session")
async def create_browser_session():
    """Create a new working browser session that handles ANY website"""
    try:
        from services.working_browser_service import working_browser_service
        
        if not working_browser_service.is_running:
            success = await working_browser_service.initialize()
            if not success:
                raise HTTPException(
                    status_code=503, 
                    detail="Working browser service unavailable."
                )
        
        session_id = await working_browser_service.create_session()
        
        return {
            "success": True,
            "session_id": session_id,
            "capabilities": [
                "javascript_rendering",
                "advanced_proxy_bypass", 
                "synthetic_page_generation",
                "dpi_bypass",
                "figma_youtube_support"
            ]
        }
        
    except Exception as e:
        logger.error(f"Failed to create working browser session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/browser/{session_id}/navigate")
async def navigate_browser_session(session_id: str, request: Dict[str, str]):
    """Navigate working browser session to ANY URL with multiple fallback methods"""
    try:
        from services.working_browser_service import working_browser_service
        url = request.get("url")
        
        if not url:
            raise HTTPException(status_code=400, detail="URL is required")
        
        result = await working_browser_service.navigate_to_url(session_id, url)
        return result
        
    except Exception as e:
        logger.error(f"Working browser navigation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/browser/{session_id}/interact")
async def interact_with_browser(session_id: str, action: Dict[str, Any]):
    """Send advanced interaction to browser session"""
    try:
        from services.advanced_browser_service import advanced_browser_service
        result = await advanced_browser_service.interact_with_page(session_id, action)
        return result
        
    except Exception as e:
        logger.error(f"Advanced interaction failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/browser/{session_id}/content")
async def get_browser_content(session_id: str):
    """Get current page content and screenshot"""
    try:
        from services.working_browser_service import working_browser_service
        result = await working_browser_service.get_page_content(session_id)
        return result
        
    except Exception as e:
        logger.error(f"Working browser content retrieval failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/browser/{session_id}/execute")
async def execute_javascript(session_id: str, request: Dict[str, str]):
    """Execute JavaScript in browser session"""
    try:
        from services.browser_service import browser_service
        script = request.get("script")
        
        if not script:
            raise HTTPException(status_code=400, detail="Script is required")
        
        result = await browser_service.execute_javascript(session_id, script)
        return result
        
    except Exception as e:
        logger.error(f"JavaScript execution failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/browser/{session_id}")
async def close_browser_session(session_id: str):
    """Close working browser session"""
    try:
        from services.working_browser_service import working_browser_service
        await working_browser_service.close_session(session_id)
        
        return {"success": True}
        
    except Exception as e:
        logger.error(f"Working session closure failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.post("/browser/{session_id}/oauth")
async def handle_oauth_popup(session_id: str, credentials: Dict[str, str]):
    """Handle OAuth popup login (Gmail, Facebook, etc.)"""
    try:
        from services.advanced_browser_service import advanced_browser_service
        result = await advanced_browser_service.handle_oauth_popup(session_id, credentials)
        return result
        
    except Exception as e:
        logger.error(f"OAuth popup handling failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/browser/sessions")
async def list_browser_sessions():
    """List all active browser sessions"""
    try:
        from services.advanced_browser_service import advanced_browser_service
        sessions = []
        for session_id, session in advanced_browser_service.sessions.items():
            sessions.append({
                'session_id': session_id,
                'current_url': session.current_url,
                'last_activity': session.last_activity.isoformat(),
                'popup_count': len(session.popup_windows)
            })
        
        return {"sessions": sessions}
        
    except Exception as e:
        logger.error(f"Session listing failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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
    from services.working_browser_service import working_browser_service
    await working_browser_service.stop()