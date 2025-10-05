"""
Advanced Browser Service - Handles ANY website complexity
- Full JavaScript execution
- OAuth popup windows
- WebGL, WebAssembly, Canvas rendering
- DPI bypass and traffic obfuscation
- Real-time interaction streaming
"""

import asyncio
import json
import logging
import base64
import uuid
import time
from typing import Dict, Optional, List, Any
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
from seleniumwire import webdriver as wire_webdriver
from pyvirtualdisplay import Display
from PIL import Image
import io
import threading
from datetime import datetime, timedelta
import random

logger = logging.getLogger(__name__)

class AdvancedBrowserSession:
    def __init__(self, session_id: str, driver, display=None):
        self.session_id = session_id
        self.driver = driver
        self.display = display
        self.last_activity = datetime.utcnow()
        self.current_url = ""
        self.popup_windows = []
        self.main_window = None
        
    def update_activity(self):
        self.last_activity = datetime.utcnow()
    
    def is_expired(self, timeout_minutes=30):
        return datetime.utcnow() - self.last_activity > timedelta(minutes=timeout_minutes)

class AdvancedBrowserService:
    def __init__(self):
        self.sessions: Dict[str, AdvancedBrowserSession] = {}
        self.is_running = False
        
    async def initialize(self):
        """Initialize the advanced browser service"""
        try:
            logger.info("Initializing advanced browser service...")
            self.is_running = True
            
            # Start cleanup task
            asyncio.create_task(self.cleanup_expired_sessions())
            
            logger.info("Advanced browser service initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize advanced browser service: {str(e)}")
            return False
    
    def create_chrome_options(self, enable_dpi_bypass=True):
        """Create Chrome options with full capabilities and DPI bypass"""
        chrome_options = Options()
        
        # Basic headless setup
        chrome_options.add_argument('--headless=new')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        
        # Window size for consistent rendering
        chrome_options.add_argument('--window-size=1920,1080')
        chrome_options.add_argument('--start-maximized')
        
        # Enable full web technologies
        chrome_options.add_argument('--enable-webgl')
        chrome_options.add_argument('--enable-accelerated-2d-canvas')
        chrome_options.add_argument('--enable-javascript')
        chrome_options.add_argument('--enable-web-components')
        chrome_options.add_argument('--enable-features=WebAssembly')
        chrome_options.add_argument('--enable-features=VaapiVideoDecoder')
        
        # Disable automation detection
        chrome_options.add_argument('--disable-blink-features=AutomationControlled')
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)
        
        # Allow popups and insecure content
        chrome_options.add_argument('--allow-running-insecure-content')
        chrome_options.add_argument('--disable-web-security')
        chrome_options.add_argument('--disable-site-isolation-trials')
        
        # Media and permissions
        chrome_options.add_argument('--use-fake-ui-for-media-stream')
        chrome_options.add_argument('--use-fake-device-for-media-stream')
        chrome_options.add_argument('--autoplay-policy=no-user-gesture-required')
        
        # Performance optimizations
        chrome_options.add_argument('--disable-background-timer-throttling')
        chrome_options.add_argument('--disable-backgrounding-occluded-windows')
        chrome_options.add_argument('--disable-renderer-backgrounding')
        
        if enable_dpi_bypass:
            # DPI bypass and traffic obfuscation
            chrome_options.add_argument('--proxy-bypass-list=*')
            chrome_options.add_argument('--disable-bundled-ppapi-flash')
            chrome_options.add_argument('--disable-plugins-discovery')
            
        # User agent rotation for DPI bypass
        user_agents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0'
        ]
        
        chrome_options.add_argument(f'--user-agent={random.choice(user_agents)}')
        
        return chrome_options
    
    async def create_session(self, enable_dpi_bypass=True) -> str:
        """Create a new advanced browser session"""
        try:
            session_id = str(uuid.uuid4())
            
            # Create virtual display for headless operation
            display = Display(visible=0, size=(1920, 1080))
            display.start()
            
            # Set up Chrome options
            chrome_options = self.create_chrome_options(enable_dpi_bypass)
            
            # Use selenium-wire for traffic interception and DPI bypass
            wireOptions = {
                'connection_timeout': 30,
                'read_timeout': 30,
                'ignore_http_methods': [],
                'disable_capture': False
            }
            
            # Set Chrome executable path
            chrome_options.binary_location = '/usr/bin/chromium'
            
            # Create driver with wire capabilities
            driver = wire_webdriver.Chrome(options=chrome_options, seleniumwire_options=wireOptions)
            
            # Execute script to remove automation flags
            driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
            driver.execute_cdp_cmd('Network.setUserAgentOverride', {"userAgent": driver.execute_script("return navigator.userAgent").replace("HeadlessChrome", "Chrome")})
            
            # Store main window handle
            main_window = driver.current_window_handle
            
            # Create session
            session = AdvancedBrowserSession(session_id, driver, display)
            session.main_window = main_window
            self.sessions[session_id] = session
            
            logger.info(f"Created advanced browser session: {session_id}")
            return session_id
            
        except Exception as e:
            logger.error(f"Failed to create browser session: {str(e)}")
            # Clean up display if created
            if 'display' in locals():
                display.stop()
            raise e
    
    async def navigate_to_url(self, session_id: str, url: str) -> Dict[str, Any]:
        """Navigate to URL with full JavaScript execution and popup handling"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            session.update_activity()
            
            driver = session.driver
            
            logger.info(f"Navigating to {url} in session {session_id}")
            
            # Set up request interceptor for DPI bypass
            def request_interceptor(request):
                # Add random delays to mimic human behavior
                time.sleep(random.uniform(0.1, 0.5))
                
                # Modify headers for DPI bypass
                request.headers['Accept-Language'] = 'en-US,en;q=0.9'
                request.headers['Accept-Encoding'] = 'gzip, deflate, br'
                request.headers['Cache-Control'] = 'no-cache'
                request.headers['Pragma'] = 'no-cache'
                
                # Random header order
                del request.headers['User-Agent']
                request.headers['User-Agent'] = driver.execute_script("return navigator.userAgent")
            
            driver.request_interceptor = request_interceptor
            
            # Navigate to URL
            driver.get(url)
            
            # Wait for page to load completely
            WebDriverWait(driver, 30).until(
                lambda d: d.execute_script('return document.readyState') == 'complete'
            )
            
            # Wait for any dynamic content and AJAX calls
            await asyncio.sleep(3)
            
            # Execute JavaScript to ensure all content is loaded
            driver.execute_script("""
                // Trigger any lazy loading
                window.scrollTo(0, document.body.scrollHeight);
                window.scrollTo(0, 0);
                
                // Dispatch events to trigger content loading
                window.dispatchEvent(new Event('load'));
                window.dispatchEvent(new Event('DOMContentLoaded'));
                
                // Force repaint
                document.body.style.display = 'none';
                document.body.offsetHeight;
                document.body.style.display = 'block';
            """)
            
            # Wait a bit more for content to render
            await asyncio.sleep(2)
            
            # Check for popups
            windows = driver.window_handles
            if len(windows) > 1:
                session.popup_windows = windows[1:]  # All windows except main
                logger.info(f"Detected {len(session.popup_windows)} popup windows")
            
            # Take screenshot
            screenshot_b64 = driver.get_screenshot_as_base64()
            
            session.current_url = url
            
            # Get page info
            title = driver.title
            
            return {
                'success': True,
                'url': driver.current_url,
                'title': title,
                'screenshot': screenshot_b64,
                'has_popups': len(session.popup_windows) > 0,
                'popup_count': len(session.popup_windows)
            }
            
        except Exception as e:
            logger.error(f"Navigation error for session {session_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'url': url
            }
    
    async def interact_with_page(self, session_id: str, action: Dict[str, Any]) -> Dict[str, Any]:
        """Handle complex user interactions including popups"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            session.update_activity()
            driver = session.driver
            
            action_type = action.get('type')
            
            if action_type == 'click':
                x, y = action['x'], action['y']
                
                # Use ActionChains for precise clicking
                actions = ActionChains(driver)
                actions.move_by_offset(x, y).click().perform()
                
            elif action_type == 'element_click':
                selector = action.get('selector')
                wait_time = action.get('wait', 10)
                
                element = WebDriverWait(driver, wait_time).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, selector))
                )
                
                # Scroll element into view
                driver.execute_script("arguments[0].scrollIntoView(true);", element)
                await asyncio.sleep(0.5)
                
                # Click with JavaScript for better compatibility
                driver.execute_script("arguments[0].click();", element)
                
            elif action_type == 'type':
                text = action['text']
                actions = ActionChains(driver)
                actions.send_keys(text).perform()
                
            elif action_type == 'key':
                key = action['key']
                if hasattr(Keys, key.upper()):
                    actions = ActionChains(driver)
                    actions.send_keys(getattr(Keys, key.upper())).perform()
                
            elif action_type == 'scroll':
                delta_y = action.get('deltaY', 0)
                driver.execute_script(f"window.scrollBy(0, {delta_y});")
                
            elif action_type == 'popup_action':
                popup_action = action.get('popup_action', 'focus')
                popup_index = action.get('popup_index', 0)
                
                if popup_index < len(session.popup_windows):
                    popup_handle = session.popup_windows[popup_index]
                    
                    if popup_action == 'focus':
                        driver.switch_to.window(popup_handle)
                    elif popup_action == 'close':
                        driver.switch_to.window(popup_handle)
                        driver.close()
                        driver.switch_to.window(session.main_window)
                        session.popup_windows.remove(popup_handle)
                    elif popup_action == 'screenshot':
                        driver.switch_to.window(popup_handle)
                        popup_screenshot = driver.get_screenshot_as_base64()
                        driver.switch_to.window(session.main_window)
                        
                        return {
                            'success': True,
                            'popup_screenshot': popup_screenshot,
                            'popup_title': driver.title,
                            'popup_url': driver.current_url
                        }
            
            # Wait for any changes to render
            await asyncio.sleep(1)
            
            # Check for new popups
            current_windows = driver.window_handles
            new_popups = [w for w in current_windows if w != session.main_window and w not in session.popup_windows]
            session.popup_windows.extend(new_popups)
            
            # Take updated screenshot
            driver.switch_to.window(session.main_window)
            screenshot_b64 = driver.get_screenshot_as_base64()
            
            return {
                'success': True,
                'screenshot': screenshot_b64,
                'url': driver.current_url,
                'new_popups': len(new_popups),
                'total_popups': len(session.popup_windows)
            }
            
        except Exception as e:
            logger.error(f"Interaction error for session {session_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def get_page_content(self, session_id: str) -> Dict[str, Any]:
        """Get current page content with popup information"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            session.update_activity()
            driver = session.driver
            
            # Ensure we're on main window
            driver.switch_to.window(session.main_window)
            
            # Take screenshot
            screenshot_b64 = driver.get_screenshot_as_base64()
            
            # Get page info
            title = driver.title
            url = driver.current_url
            
            # Get popup information
            popup_info = []
            for i, popup_handle in enumerate(session.popup_windows):
                try:
                    driver.switch_to.window(popup_handle)
                    popup_info.append({
                        'index': i,
                        'title': driver.title,
                        'url': driver.current_url,
                        'handle': popup_handle
                    })
                except:
                    # Popup was closed
                    session.popup_windows.remove(popup_handle)
            
            # Return to main window
            driver.switch_to.window(session.main_window)
            
            return {
                'success': True,
                'screenshot': screenshot_b64,
                'title': title,
                'url': url,
                'popups': popup_info
            }
            
        except Exception as e:
            logger.error(f"Content retrieval error for session {session_id}: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def execute_javascript(self, session_id: str, script: str) -> Dict[str, Any]:
        """Execute JavaScript with full browser capabilities"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            session.update_activity()
            driver = session.driver
            
            result = driver.execute_script(script)
            
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
    
    async def handle_oauth_popup(self, session_id: str, credentials: Dict[str, str]) -> Dict[str, Any]:
        """Handle OAuth popup login (Gmail, Facebook, etc.)"""
        try:
            if session_id not in self.sessions:
                raise ValueError(f"Session {session_id} not found")
            
            session = self.sessions[session_id]
            driver = session.driver
            
            # Wait for popup to appear
            await asyncio.sleep(2)
            
            # Check for OAuth popup
            windows = driver.window_handles
            if len(windows) > 1:
                # Switch to popup window
                popup_window = windows[-1]  # Latest window
                driver.switch_to.window(popup_window)
                
                # Wait for login form
                WebDriverWait(driver, 10).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email'], input[type='text']"))
                )
                
                # Fill credentials if provided
                if 'email' in credentials:
                    email_field = driver.find_element(By.CSS_SELECTOR, "input[type='email'], input[type='text']")
                    email_field.clear()
                    email_field.send_keys(credentials['email'])
                
                if 'password' in credentials:
                    try:
                        password_field = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
                        password_field.clear()
                        password_field.send_keys(credentials['password'])
                    except:
                        # Password field might not be visible yet
                        pass
                
                # Take screenshot of popup
                popup_screenshot = driver.get_screenshot_as_base64()
                popup_title = driver.title
                popup_url = driver.current_url
                
                # Return to main window
                driver.switch_to.window(session.main_window)
                
                return {
                    'success': True,
                    'popup_screenshot': popup_screenshot,
                    'popup_title': popup_title,
                    'popup_url': popup_url,
                    'message': 'OAuth popup detected and handled'
                }
            
            return {
                'success': False,
                'error': 'No popup window found'
            }
            
        except Exception as e:
            logger.error(f"OAuth popup handling error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def close_session(self, session_id: str):
        """Close browser session and clean up resources"""
        try:
            if session_id in self.sessions:
                session = self.sessions[session_id]
                
                # Close all popup windows
                for popup_handle in session.popup_windows:
                    try:
                        session.driver.switch_to.window(popup_handle)
                        session.driver.close()
                    except:
                        pass
                
                # Close main browser
                session.driver.quit()
                
                # Stop virtual display
                if session.display:
                    session.display.stop()
                
                del self.sessions[session_id]
                logger.info(f"Closed advanced browser session: {session_id}")
                
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
    
    async def stop(self):
        """Stop the browser service"""
        self.is_running = False
        
        # Close all sessions
        for session_id in list(self.sessions.keys()):
            await self.close_session(session_id)

# Global instance
advanced_browser_service = AdvancedBrowserService()