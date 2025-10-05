"""
Server-side browser rendering service for complex websites
Handles JavaScript, WebGL, OAuth popups, and any browser complexity
"""

import asyncio
import json
import logging
import base64
import uuid
from typing import Dict, Optional, List, Any
from playwright.async_api import async_playwright, Browser, Page, BrowserContext
from PIL import Image
import io
import websockets
import threading
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

class BrowserSession:
    def __init__(self, session_id: str, page: Page, context: BrowserContext):
        self.session_id = session_id
        self.page = page
        self.context = context
        self.last_activity = datetime.utcnow()
        self.websocket_connections = set()
        self.current_url = ""
        
    def update_activity(self):
        self.last_activity = datetime.utcnow()
    
    def is_expired(self, timeout_minutes=30):
        return datetime.utcnow() - self.last_activity > timedelta(minutes=timeout_minutes)

class BrowserRenderingService:
    def __init__(self):
        self.playwright = None
        self.browser = None
        self.sessions: Dict[str, BrowserSession] = {}
        self.is_running = False
        
    async def initialize(self):
        """Initialize the browser rendering service"""
        try:
            logger.info("Initializing browser rendering service...")
            
            self.playwright = await async_playwright().start()
            
            # Launch browser with full features
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--enable-webgl',
                    '--enable-accelerated-2d-canvas',
                    '--enable-javascript',
                    '--enable-web-components',
                    '--enable-features=WebAssembly',
                    '--allow-running-insecure-content',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-gpu',
                    '--remote-debugging-port=0'
                ]
            )
            
            self.is_running = True
            
            # Start cleanup task
            asyncio.create_task(self.cleanup_expired_sessions())
            
            logger.info("Browser rendering service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize browser service: {str(e)}")
            # Don't fail the entire application if browser service fails to initialize
            self.is_running = False
            return False
    
    async def create_session(self) -> str:
        """Create a new browser session"""
        try:
            if not self.browser or not self.is_running:
                # Try to reinitialize if browser is not available
                await self.initialize()
                if not self.browser:
                    raise Exception("Browser service not available")
            
            session_id = str(uuid.uuid4())
            
            # Create new browser context
            context = await self.browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                java_script_enabled=True,
                accept_downloads=True,
                ignore_https_errors=True,
                permissions=['camera', 'microphone', 'geolocation', 'notifications']
            )
            
            # Create new page
            page = await context.new_page()
            
            # Set up event handlers
            await self.setup_page_handlers(page, session_id)
            
            # Create session
            session = BrowserSession(session_id, page, context)
            self.sessions[session_id] = session
            
            logger.info(f"Created browser session: {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"Failed to create browser session: {str(e)}")
            raise e
    
    async def setup_page_handlers(self, page: Page, session_id: str):
        """Set up event handlers for the page"""
        
        # Handle console messages
        page.on("console", lambda msg: logger.info(f"Console [{session_id}]: {msg.text}"))
        
        # Handle JavaScript errors
        page.on("pageerror", lambda error: logger.error(f"JS Error [{session_id}]: {error}"))
        
        # Handle popup windows (OAuth, etc.)
        page.on("popup", lambda popup: asyncio.create_task(self.handle_popup(popup, session_id)))
        
        # Handle dialogs (alerts, confirms)
        page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
    
    async def handle_popup(self, popup: Page, session_id: str):
        """Handle popup windows like OAuth dialogs"""
        try:
            await popup.wait_for_load_state()
            logger.info(f"Popup opened [{session_id}]: {popup.url}")
            
            # Take screenshot of popup
            screenshot = await popup.screenshot(type='png')
            screenshot_b64 = base64.b64encode(screenshot).decode()
            
            # Notify frontend about popup
            await self.broadcast_to_session(session_id, {
                'type': 'popup_opened',
                'url': popup.url,
                'screenshot': screenshot_b64
            })
            
        except Exception as e:
            logger.error(f"Error handling popup: {str(e)}")
    
    async def navigate_to_url(self, session_id: str, url: str) -> Dict[str, Any]:
        """Navigate to a URL in the browser session"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            session.update_activity()
            
            logger.info(f"Navigating to {url} in session {session_id}")
            
            # Navigate to URL with full loading
            response = await session.page.goto(
                url, 
                wait_until='networkidle',
                timeout=30000
            )
            
            session.current_url = url
            
            # Wait for any dynamic content
            await session.page.wait_for_timeout(2000)
            
            # Take screenshot
            screenshot = await session.page.screenshot(
                type='png', 
                full_page=False,
                quality=90
            )
            screenshot_b64 = base64.b64encode(screenshot).decode()
            
            # Get page info
            title = await session.page.title()
            
            return {
                'success': True,
                'url': url,
                'title': title,
                'screenshot': screenshot_b64,
                'status_code': response.status if response else 200
            }
            
        except Exception as e:
            logger.error(f"Navigation error for session {session_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'url': url
            }
    
    async def interact_with_page(self, session_id: str, action: Dict[str, Any]) -> Dict[str, Any]:
        """Handle user interactions with the page"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            session.update_activity()
            
            action_type = action.get('type')
            
            if action_type == 'click':
                x, y = action['x'], action['y']
                await session.page.mouse.click(x, y)
                
            elif action_type == 'type':
                text = action['text']
                await session.page.keyboard.type(text)
                
            elif action_type == 'key':
                key = action['key']
                await session.page.keyboard.press(key)
                
            elif action_type == 'scroll':
                delta_y = action.get('deltaY', 0)
                await session.page.mouse.wheel(0, delta_y)
                
            elif action_type == 'element_click':
                selector = action['selector']
                await session.page.click(selector)
                
            elif action_type == 'element_type':
                selector = action['selector']
                text = action['text']
                await session.page.fill(selector, text)
            
            # Wait for any changes to render
            await session.page.wait_for_timeout(500)
            
            # Take updated screenshot
            screenshot = await session.page.screenshot(type='png', quality=90)
            screenshot_b64 = base64.b64encode(screenshot).decode()
            
            return {
                'success': True,
                'screenshot': screenshot_b64,
                'url': session.page.url
            }
            
        except Exception as e:
            logger.error(f"Interaction error for session {session_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_page_content(self, session_id: str) -> Dict[str, Any]:
        """Get the current page content and screenshot"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            session.update_activity()
            
            # Take screenshot
            screenshot = await session.page.screenshot(type='png', quality=90)
            screenshot_b64 = base64.b64encode(screenshot).decode()
            
            # Get page info
            title = await session.page.title()
            url = session.page.url
            
            return {
                'success': True,
                'screenshot': screenshot_b64,
                'title': title,
                'url': url
            }
            
        except Exception as e:
            logger.error(f"Content retrieval error for session {session_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def execute_javascript(self, session_id: str, script: str) -> Dict[str, Any]:
        """Execute JavaScript in the browser session"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            session.update_activity()
            
            result = await session.page.evaluate(script)
            
            return {
                'success': True,
                'result': result
            }
            
        except Exception as e:
            logger.error(f"JavaScript execution error for session {session_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def close_session(self, session_id: str):
        """Close a browser session"""
        try:
            if session_id in self.sessions:
                session = self.sessions[session_id]
                await session.context.close()
                del self.sessions[session_id]
                logger.info(f"Closed browser session: {session_id}")
                
        except Exception as e:
            logger.error(f"Error closing session {session_id}: {str(e)}")
    
    async def cleanup_expired_sessions(self):
        """Cleanup expired browser sessions"""
        while self.is_running:
            try:
                expired_sessions = [
                    session_id for session_id, session in self.sessions.items()
                    if session.is_expired()
                ]
                
                for session_id in expired_sessions:
                    logger.info(f"Cleaning up expired session: {session_id}")
                    await self.close_session(session_id)
                
                # Check every 5 minutes
                await asyncio.sleep(300)
                
            except Exception as e:
                logger.error(f"Cleanup error: {str(e)}")
                await asyncio.sleep(60)
    
    async def broadcast_to_session(self, session_id: str, message: Dict[str, Any]):
        """Broadcast message to all websocket connections for a session"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            disconnected = set()
            
            for websocket in session.websocket_connections:
                try:
                    await websocket.send(json.dumps(message))
                except:
                    disconnected.add(websocket)
            
            # Remove disconnected websockets
            session.websocket_connections -= disconnected
    
    async def add_websocket_connection(self, session_id: str, websocket):
        """Add websocket connection to session"""
        if session_id in self.sessions:
            self.sessions[session_id].websocket_connections.add(websocket)
    
    async def remove_websocket_connection(self, session_id: str, websocket):
        """Remove websocket connection from session"""
        if session_id in self.sessions:
            self.sessions[session_id].websocket_connections.discard(websocket)
    
    async def get_session_info(self, session_id: str) -> Dict[str, Any]:
        """Get information about a browser session"""
        if session_id in self.sessions:
            session = self.sessions[session_id]
            return {
                'session_id': session_id,
                'current_url': session.current_url,
                'last_activity': session.last_activity.isoformat(),
                'connected_clients': len(session.websocket_connections)
            }
        return None
    
    def get_all_sessions(self) -> List[Dict[str, Any]]:
        """Get information about all active sessions"""
        return [
            {
                'session_id': session_id,
                'current_url': session.current_url,
                'last_activity': session.last_activity.isoformat(),
                'connected_clients': len(session.websocket_connections)
            }
            for session_id, session in self.sessions.items()
        ]
    
    async def stop(self):
        """Stop the browser rendering service"""
        self.is_running = False
        
        # Close all sessions
        for session_id in list(self.sessions.keys()):
            await self.close_session(session_id)
        
        # Close browser
        if self.browser:
            await self.browser.close()
        
        # Stop playwright
        if self.playwright:
            await self.playwright.stop()

# Global instance
browser_service = BrowserRenderingService()