import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ExternalLink, Loader2, Monitor, Zap, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const ServerRenderedViewer = ({ url, onUrlChange }) => {
  const [sessionId, setSessionId] = useState(null);
  const [screenshot, setScreenshot] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pageTitle, setPageTitle] = useState('');
  const [currentUrl, setCurrentUrl] = useState(url);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (url) {
      initializeBrowserSession();
    }
    
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (url !== currentUrl && sessionId) {
      navigateToUrl(url);
    }
  }, [url, sessionId]);

  const initializeBrowserSession = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Create new browser session
      const sessionResponse = await fetch(`${BACKEND_URL}/api/browser/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!sessionResponse.ok) {
        throw new Error('Failed to create browser session');
      }
      
      const sessionData = await sessionResponse.json();
      const newSessionId = sessionData.session_id;
      setSessionId(newSessionId);
      
      // Navigate to URL
      await navigateToUrl(url, newSessionId);
      
      toast.success('Server-side browser initialized');
      
    } catch (error) {
      console.error('Browser session initialization failed:', error);
      setError(error.message);
      toast.error('Failed to initialize server browser');
    } finally {
      setLoading(false);
    }
  };

  const navigateToUrl = async (targetUrl, useSessionId = null) => {
    if (!targetUrl) return;
    
    const activeSessionId = useSessionId || sessionId;
    if (!activeSessionId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/browser/${activeSessionId}/navigate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl })
      });
      
      if (!response.ok) {
        throw new Error('Navigation failed');
      }
      
      const result = await response.json();
      
      if (result.success) {
        setScreenshot(result.screenshot);
        setPageTitle(result.title);
        setCurrentUrl(targetUrl);
        
        if (onUrlChange) {
          onUrlChange(targetUrl, result.title);
        }
        
        toast.success(`Loaded: ${result.title || 'Page'}`);
      } else {
        throw new Error(result.error || 'Navigation failed');
      }
      
    } catch (error) {
      console.error('Navigation failed:', error);
      setError(error.message);
      toast.error('Failed to load website');
    } finally {
      setLoading(false);
    }
  };

  const handleClick = useCallback(async (event) => {
    if (!sessionId) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/browser/${sessionId}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'click',
          x: x,
          y: y
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setScreenshot(result.screenshot);
          
          // Update URL if it changed
          if (result.url !== currentUrl) {
            setCurrentUrl(result.url);
            if (onUrlChange) {
              onUrlChange(result.url, pageTitle);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Click interaction failed:', error);
    }
  }, [sessionId, currentUrl, pageTitle, onUrlChange]);

  const handleKeyPress = useCallback(async (event) => {
    if (!sessionId) return;
    
    try {
      let action;
      
      if (event.key.length === 1) {
        // Regular character
        action = {
          type: 'type',
          text: event.key
        };
      } else {
        // Special key
        action = {
          type: 'key',
          key: event.key
        };
      }
      
      const response = await fetch(`${BACKEND_URL}/api/browser/${sessionId}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action)
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setScreenshot(result.screenshot);
          
          // Update URL if it changed
          if (result.url !== currentUrl) {
            setCurrentUrl(result.url);
            if (onUrlChange) {
              onUrlChange(result.url, pageTitle);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Key interaction failed:', error);
    }
  }, [sessionId, currentUrl, pageTitle, onUrlChange]);

  const handleScroll = useCallback(async (event) => {
    if (!sessionId) return;
    
    try {
      const response = await fetch(`${BACKEND_URL}/api/browser/${sessionId}/interact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'scroll',
          deltaY: event.deltaY
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setScreenshot(result.screenshot);
        }
      }
      
    } catch (error) {
      console.error('Scroll interaction failed:', error);
    }
  }, [sessionId]);

  const refreshPage = async () => {
    if (currentUrl) {
      await navigateToUrl(currentUrl);
    }
  };

  const cleanup = async () => {
    if (sessionId) {
      try {
        await fetch(`${BACKEND_URL}/api/browser/${sessionId}`, {
          method: 'DELETE'
        });
      } catch (error) {
        console.error('Session cleanup failed:', error);
      }
    }
  };

  const openInNewTab = () => {
    window.open(currentUrl, '_blank');
  };

  if (loading && !screenshot) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Monitor className="w-3 h-3 mr-1" />
            SERVER
          </Badge>
          <span className="text-sm text-gray-600 truncate">{url}</span>
          <Loader2 className="w-4 h-4 animate-spin ml-auto" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Monitor className="w-16 h-16 mx-auto mb-4 text-blue-500" />
            <h3 className="text-lg font-semibold mb-2">Initializing Server Browser</h3>
            <p className="text-gray-600 mb-4">
              Starting headless Chromium with full JavaScript, WebGL, and popup support
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
              <Zap className="w-4 h-4" />
              <span>Handles ANY website complexity</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            ERROR
          </Badge>
          <span className="text-sm text-gray-600 truncate">{url}</span>
          <Button variant="ghost" size="sm" onClick={openInNewTab} className="ml-auto">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="max-w-md text-center">
            <CardHeader>
              <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-red-500" />
              <CardTitle>Server Browser Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Button onClick={initializeBrowserSession} className="w-full" size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Server Browser
                </Button>
                <Button onClick={openInNewTab} variant="outline" className="w-full" size="sm">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in New Tab
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
          <Monitor className="w-3 h-3 mr-1" />
          SERVER
        </Badge>
        <span className="text-sm text-gray-600 truncate" title={currentUrl}>
          {pageTitle || currentUrl}
        </span>
        
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="ghost" size="sm" onClick={refreshPage} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={openInNewTab}>
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Browser View */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-hidden cursor-pointer"
        onClick={handleClick}
        onKeyDown={handleKeyPress}
        onWheel={handleScroll}
        tabIndex={0}
        style={{ outline: 'none' }}
      >
        {screenshot ? (
          <img 
            src={`data:image/png;base64,${screenshot}`}
            alt="Server-rendered website"
            className="w-full h-full object-contain bg-white"
            style={{ imageRendering: 'crisp-edges' }}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Monitor className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Loading server browser...</p>
            </div>
          </div>
        )}
      </div>

      {/* Status Footer */}
      <div className="bg-green-50 border-t px-4 py-2 text-xs text-green-700 flex items-center gap-2">
        <Zap className="w-3 h-3" />
        <span>
          Server-side rendering • Full JavaScript/WebGL/OAuth support • Session: {sessionId?.slice(-8)}
        </span>
      </div>
    </div>
  );
};

export default ServerRenderedViewer;