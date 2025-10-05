import React, { useState, useEffect, useRef } from 'react';
import { ExternalLink, AlertTriangle, Loader2, RefreshCw, Globe, Monitor } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { toast } from 'sonner';
import ServerRenderedViewer from './ServerRenderedViewer';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const WebsiteViewer = ({ url }) => {
  const [loadingState, setLoadingState] = useState('loading'); // loading, success, blocked, error
  const [proxyUrl, setProxyUrl] = useState('');
  const [showProxy, setShowProxy] = useState(false);
  const [useServerBrowser, setUseServerBrowser] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (url) {
      attemptDirectLoad();
    }
  }, [url]);

  const attemptDirectLoad = () => {
    setLoadingState('loading');
    setShowProxy(false);
    
    // First try direct iframe loading
    const testFrame = document.createElement('iframe');
    testFrame.style.display = 'none';
    testFrame.src = url;
    
    const timeout = setTimeout(() => {
      // If it takes too long, assume it might be blocked
      setLoadingState('blocked');
      document.body.removeChild(testFrame);
    }, 10000);
    
    testFrame.onload = () => {
      clearTimeout(timeout);
      try {
        // Try to access iframe content to check if it's actually loaded
        const iframeDoc = testFrame.contentDocument || testFrame.contentWindow.document;
        if (iframeDoc && iframeDoc.body && iframeDoc.body.innerHTML) {
          setLoadingState('success');
        } else {
          setLoadingState('blocked');
        }
      } catch (e) {
        // Cross-origin restrictions or X-Frame-Options blocking
        setLoadingState('blocked');
      }
      document.body.removeChild(testFrame);
    };
    
    testFrame.onerror = () => {
      clearTimeout(timeout);
      setLoadingState('error');
      document.body.removeChild(testFrame);
    };
    
    document.body.appendChild(testFrame);
  };

  const tryProxyLoad = async () => {
    setShowProxy(true);
    setLoadingState('loading');
    
    try {
      // Fetch content via our backend proxy
      const response = await fetch(`${BACKEND_URL}/api/proxy?url=${encodeURIComponent(url)}`);
      
      if (response.ok) {
        const data = await response.json();
        
        // Create a blob URL with the proxied content
        const blob = new Blob([data.content], { type: 'text/html' });
        const blobUrl = URL.createObjectURL(blob);
        setProxyUrl(blobUrl);
        setLoadingState('success');
        toast.success('Loaded via decentralized proxy!');
      } else {
        throw new Error(`Proxy request failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Proxy load failed:', error);
      setLoadingState('error');
      toast.error('Proxy loading failed: ' + error.message);
    }
  };

  const handleIframeLoad = () => {
    if (loadingState === 'loading') {
      setLoadingState('success');
    }
  };

  const handleIframeError = () => {
    console.log('Iframe failed to load:', url);
    setLoadingState('blocked');
  };

  const openInNewTab = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
    toast.info('Website opened in new tab');
  };

  const isBlockedSite = (url) => {
    const blockedDomains = [
      'google.com', 'youtube.com', 'facebook.com', 'twitter.com', 
      'instagram.com', 'linkedin.com', 'github.com', 'stackoverflow.com'
    ];
    
    return blockedDomains.some(domain => url.includes(domain));
  };

  const useServerRendering = () => {
    setUseServerBrowser(true);
    setLoadingState('success');
    toast.success('Switching to server-side browser rendering...');
  };

  if (loadingState === 'loading') {
    return (
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            HTTP
          </Badge>
          <span className="text-sm text-gray-600 truncate">{url}</span>
          <Loader2 className="w-4 h-4 animate-spin ml-auto" />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
            <p className="text-lg font-medium">Loading Website</p>
            <p className="text-sm text-gray-500 mt-1">Establishing secure connection...</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadingState === 'blocked') {
    return (
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            BLOCKED
          </Badge>
          <span className="text-sm text-gray-600 truncate">{url}</span>
          <Button variant="ghost" size="sm" onClick={openInNewTab} className="ml-auto">
            <ExternalLink className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 flex items-center justify-center p-8">
          <Card className="max-w-md">
            <CardHeader className="text-center">
              <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-amber-500" />
              <CardTitle>Website Blocked Embedding</CardTitle>
              <CardDescription>
                {url.includes('google.com') ? 'Google' : 'This website'} prevents embedding for security reasons
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-600 text-center">
                Many major websites block iframe embedding using X-Frame-Options headers.
              </p>
              
              <div className="space-y-2">
                <Button onClick={openInNewTab} className="w-full" size="sm">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in New Tab
                </Button>
                
                <Button 
                  onClick={useServerRendering} 
                  className="w-full" 
                  size="sm"
                >
                  <Monitor className="w-4 h-4 mr-2" />
                  Use Server Browser
                </Button>
                
                <Button 
                  onClick={tryProxyLoad} 
                  variant="outline" 
                  className="w-full" 
                  size="sm"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Try Decentralized Proxy
                </Button>
                
                <Button 
                  onClick={attemptDirectLoad} 
                  variant="ghost" 
                  className="w-full" 
                  size="sm"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry Direct Load
                </Button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-700">
                  <strong>Why is this blocked?</strong> Major sites like Google, Facebook, Twitter block iframe embedding for security.
                  <br /><br />
                  <strong>✅ Sites that work:</strong> wikipedia.org, archive.org, most blogs
                  <br />
                  <strong>❌ Often blocked:</strong> google.com, youtube.com, facebook.com, twitter.com
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (loadingState === 'error') {
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
              <CardTitle>Failed to Load</CardTitle>
              <CardDescription>Unable to connect to the website</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-gray-600">
                The website may be down, have network issues, or require special access.
              </p>
              <div className="space-y-2">
                <Button onClick={openInNewTab} className="w-full" size="sm">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Open in New Tab
                </Button>
                <Button onClick={attemptDirectLoad} variant="outline" className="w-full" size="sm">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Success state - show the iframe
  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
        <Badge variant="outline" className={showProxy ? 
          "bg-green-50 text-green-700 border-green-200" : 
          "bg-blue-50 text-blue-700 border-blue-200"
        }>
          {showProxy ? 'PROXIED' : 'HTTP'}
        </Badge>
        <span className="text-sm text-gray-600 truncate">{url}</span>
        <Button variant="ghost" size="sm" onClick={openInNewTab} className="ml-auto">
          <ExternalLink className="w-4 h-4" />
        </Button>
      </div>
      
      <iframe
        ref={iframeRef}
        src={showProxy ? proxyUrl : url}
        className="flex-1 w-full border-0"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
        title={`Web content: ${url}`}
        onLoad={handleIframeLoad}
        onError={handleIframeError}
        style={{ minHeight: '600px' }}
      />
      
      {showProxy && (
        <div className="bg-green-50 border-t px-4 py-2 text-xs text-green-700">
          ⚡ Loaded via decentralized proxy • Content may differ from original
        </div>
      )}
    </div>
  );
};

export default WebsiteViewer;