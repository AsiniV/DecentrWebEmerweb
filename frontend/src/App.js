import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import { Search, Globe, MessageSquare, Settings, Plus, ArrowLeft, ArrowRight, RotateCcw, ExternalLink } from 'lucide-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { Badge } from './components/ui/badge';
import { toast, Toaster } from 'sonner';
import MessengerView from './components/MessengerView';
import WebsiteViewer from './components/WebsiteViewer';
import { searchService } from './services/searchService';
import './App.css';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Browser Tab Component
const BrowserTab = ({ tab, isActive, onClick, onClose }) => {
  return (
    <div 
      className={`flex items-center gap-2 px-3 py-2 border-b-2 cursor-pointer transition-colors duration-200 ${
        isActive 
          ? 'border-blue-500 bg-blue-50' 
          : 'border-transparent hover:bg-gray-50'
      }`}
      onClick={onClick}
    >
      <div className="w-4 h-4 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 flex-shrink-0" />
      <span className="text-sm font-medium truncate max-w-[150px]">
        {tab.title || 'New Tab'}
      </span>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        className="text-gray-400 hover:text-gray-600 ml-1"
      >
        &times;
      </button>
    </div>
  );
};

// Content Viewer Component
const ContentViewer = ({ content, contentType, url, source }) => {
  if (!content && !url) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Globe className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>Enter a URL to browse decentralized content</p>
        </div>
      </div>
    );
  }

  // For HTTP/HTTPS websites, use smart loading with proxy fallback
  if (source === 'http' && (url?.startsWith('http://') || url?.startsWith('https://'))) {
    return (
      <WebsiteViewer url={url} />
    );
  }

  // For IPFS and .prv content, use the existing content viewer
  if (contentType?.includes('html') && source !== 'http') {
    return (
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
          <Badge 
            variant="outline" 
            className={
              source === 'ipfs' 
                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                : 'bg-green-50 text-green-700 border-green-200'
            }
          >
            {source?.toUpperCase()}
          </Badge>
          <span className="text-sm text-gray-600 truncate">{url}</span>
        </div>
        <div className="flex-1 p-4 overflow-auto">
          <div 
            className="prose max-w-none"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      </div>
    );
  }

  // For plain text and other IPFS content
  return (
    <div className="flex-1 flex flex-col">
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
        <Badge 
          variant="outline" 
          className={
            source === 'ipfs' 
              ? 'bg-blue-50 text-blue-700 border-blue-200' 
              : 'bg-green-50 text-green-700 border-green-200'
          }
        >
          {source?.toUpperCase()}
        </Badge>
        <Badge variant="outline">{contentType || 'text/plain'}</Badge>
        <span className="text-sm text-gray-600 truncate">{url}</span>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        <div className="bg-gray-50 rounded-lg p-4">
          <pre className="whitespace-pre-wrap text-sm font-mono">{content}</pre>
        </div>
      </div>
    </div>
  );
};

// Search Results Component
const SearchResults = ({ results, onNavigate }) => {
  return (
    <div className="space-y-3">
      {results.map((result) => (
        <Card 
          key={result.id} 
          className="cursor-pointer hover:shadow-md transition-shadow duration-200"
          onClick={() => onNavigate(result.url)}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <CardTitle className="text-lg text-blue-600 hover:text-blue-800">
                {result.title}
              </CardTitle>
              <Badge variant="secondary">{result.source}</Badge>
            </div>
            <CardDescription className="text-green-700">
              {result.url}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700">{result.content_preview}</p>
            {result.relevance_score && (
              <div className="mt-2">
                <Badge variant="outline">
                  Relevance: {(result.relevance_score * 100).toFixed(0)}%
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// Main Browser Component
const PrivaChainBrowser = () => {
  const [tabs, setTabs] = useState([
    { id: 1, title: 'New Tab', url: '', content: '', contentType: '', source: '' }
  ]);
  const [activeTabId, setActiveTabId] = useState(1);
  const [addressBar, setAddressBar] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [activeView, setActiveView] = useState('browser'); // browser, search, messenger
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  const activeTab = tabs.find(tab => tab.id === activeTabId);

  // Navigation functions
  const navigateToUrl = async (url) => {
    if (!url.trim()) return;

    setLoading(true);
    const trimmedUrl = url.trim();
    
    try {
      // For HTTP/HTTPS URLs, we can directly load them in iframe without backend processing
      if (trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')) {
        // Check if it's a commonly blocked site and warn user
        const blockedSites = ['google.com', 'youtube.com', 'facebook.com', 'twitter.com', 'instagram.com'];
        const isKnownBlocked = blockedSites.some(site => trimmedUrl.includes(site));
        
        // Update tab directly for web content
        setTabs(prevTabs => 
          prevTabs.map(tab => 
            tab.id === activeTabId 
              ? { 
                  ...tab, 
                  url: trimmedUrl, 
                  content: '', // No content needed for iframe
                  contentType: 'text/html',
                  source: 'http',
                  title: extractTitleFromUrl(trimmedUrl) || 'Web Page'
                }
              : tab
          )
        );

        setAddressBar(trimmedUrl);
        
        if (isKnownBlocked) {
          toast.warning('Note: This site may block embedding. Use "Open in New Tab" if needed.');
        } else {
          toast.success('Loading web content...');
        }
        return;
      }

      // For IPFS and .prv content, use the backend resolver
      const response = await axios.post(`${API}/content/resolve`, {
        url: trimmedUrl
      });

      const { content, content_type, source } = response.data;
      
      // Update active tab
      setTabs(prevTabs => 
        prevTabs.map(tab => 
          tab.id === activeTabId 
            ? { 
                ...tab, 
                url: trimmedUrl, 
                content, 
                contentType: content_type,
                source,
                title: extractTitle(content) || extractTitleFromUrl(trimmedUrl) || 'Untitled'
              }
            : tab
        )
      );

      setAddressBar(trimmedUrl);
      toast.success(`Content loaded from ${source.toUpperCase()}`);
    } catch (error) {
      console.error('Navigation error:', error);
      toast.error('Failed to load content: ' + (error.response?.data?.detail || error.message));
    } finally {
      setLoading(false);
    }
  };

  const extractTitle = (content) => {
    if (!content) return null;
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) return titleMatch[1];
    const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (h1Match) return h1Match[1].replace(/<[^>]*>/g, '');
    return null;
  };

  const extractTitleFromUrl = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname || url.split('/').pop() || 'Web Page';
    } catch {
      return url.split('/').pop() || 'Web Page';
    }
  };

  // Tab management
  const createNewTab = () => {
    const newId = Math.max(...tabs.map(t => t.id)) + 1;
    const newTab = {
      id: newId,
      title: 'New Tab',
      url: '',
      content: '',
      contentType: '',
      source: ''
    };
    setTabs([...tabs, newTab]);
    setActiveTabId(newId);
    setAddressBar('');
  };

  const closeTab = (tabId) => {
    if (tabs.length === 1) return; // Don't close last tab
    
    const newTabs = tabs.filter(tab => tab.id !== tabId);
    setTabs(newTabs);
    
    if (activeTabId === tabId) {
      const newActiveTab = newTabs[newTabs.length - 1];
      setActiveTabId(newActiveTab.id);
      setAddressBar(newActiveTab.url);
    }
  };

  // Search functionality
  const performSearch = async (query) => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      // Initialize search service if not already done
      if (!searchService.isInitialized) {
        toast.info('Initializing decentralized search...');
        await searchService.initialize();
      }

      // Perform real decentralized search
      const results = await searchService.search(query.trim(), {
        searchType: 'hybrid',
        limit: 20
      });

      // Also search backend for additional results
      try {
        const backendResponse = await axios.post(`${API}/search`, {
          query: query.trim(),
          search_type: 'hybrid',
          limit: 10
        });
        
        // Combine and deduplicate results
        const combinedResults = [...results, ...backendResponse.data];
        const uniqueResults = combinedResults.filter((result, index, self) =>
          index === self.findIndex(r => r.url === result.url)
        );
        
        setSearchResults(uniqueResults);
      } catch (backendError) {
        // If backend fails, use only OrbitDB results
        console.warn('Backend search failed, using OrbitDB only:', backendError);
        setSearchResults(results);
      }

      setActiveView('search');
      toast.success(`Found ${results.length} decentralized results`);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle address bar submission
  const handleAddressSubmit = (e) => {
    e.preventDefault();
    const trimmedAddress = addressBar?.trim() || '';
    
    if (!trimmedAddress) return;
    
    try {
      if (trimmedAddress.includes(' ') || (!trimmedAddress.includes('://') && !trimmedAddress.includes('.'))) {
        // Treat as search query
        performSearch(trimmedAddress);
      } else {
        // Treat as URL
        let url = trimmedAddress;
        if (!url.includes('://')) {
          if (url.endsWith('.prv')) {
            url = `https://${url}`; // For .prv domains
          } else {
            url = `https://${url}`; // Default to HTTPS
          }
        }
        navigateToUrl(url);
      }
    } catch (error) {
      console.error('Address submit error:', error);
      toast.error('Invalid address or search query');
    }
  };

  const handleSearchNavigation = (url) => {
    setActiveView('browser');
    navigateToUrl(url);
  };

  useEffect(() => {
    // Update address bar when active tab changes
    if (activeTab) {
      setAddressBar(activeTab.url || '');
    }
  }, [activeTabId, activeTab]);

  useEffect(() => {
    // Initialize decentralized services on app start
    const initializeServices = async () => {
      try {
        // Initialize search service in background
        searchService.initialize().then(() => {
          console.log('Decentralized search service initialized');
        }).catch((error) => {
          console.warn('Search service initialization failed:', error);
        });
      } catch (error) {
        console.error('Service initialization error:', error);
      }
    };

    initializeServices();
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between p-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-r from-cyan-400 to-blue-500 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 bg-clip-text text-transparent">
              PrivaChain Decentral
            </h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant={activeView === 'browser' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setActiveView('browser')}
              data-testid="browser-view-btn"
            >
              <Globe className="w-4 h-4 mr-1" />
              Browser
            </Button>
            <Button 
              variant={activeView === 'search' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setActiveView('search')}
              data-testid="search-view-btn"
            >
              <Search className="w-4 h-4 mr-1" />
              Search
            </Button>
            <Button 
              variant={activeView === 'messenger' ? 'default' : 'ghost'} 
              size="sm"
              onClick={() => setActiveView('messenger')}
              data-testid="messenger-view-btn"
            >
              <MessageSquare className="w-4 h-4 mr-1" />
              Messenger
            </Button>
          </div>
        </div>

        {/* Navigation Bar */}
        <div className="px-3 pb-3">
          <form onSubmit={handleAddressSubmit} className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="sm" disabled>
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm" 
                onClick={() => navigateToUrl(addressBar)}
                disabled={loading}
                title="Reload"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
            
            <Input
              value={addressBar}
              onChange={(e) => setAddressBar(e.target.value)}
              placeholder="Enter URL (ipfs://, https://, .prv) or search query..."
              className="flex-1"
              disabled={loading}
              data-testid="address-bar"
            />
            
            <Button type="submit" disabled={loading} data-testid="navigate-btn">
              {loading ? <RotateCcw className="w-4 h-4 animate-spin" /> : 'Go'}
            </Button>

            {/* Quick Access Buttons */}
            <div className="flex items-center gap-1 border-l pl-2 ml-2">
              <Button 
                type="button" 
                variant="ghost" 
                size="sm"
                onClick={() => navigateToUrl('https://figma.com')}
                title="Open Figma"
                className="text-xs px-2"
              >
                Figma
              </Button>
              <Button 
                type="button" 
                variant="ghost" 
                size="sm"
                onClick={() => navigateToUrl('https://google.com')}
                title="Open Google"
                className="text-xs px-2"
              >
                Google
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeView === 'browser' && (
          <>
            {/* Tab Bar */}
            <div className="bg-white border-b border-gray-200 flex items-center">
              <div className="flex items-center overflow-x-auto">
                {tabs.map(tab => (
                  <BrowserTab
                    key={tab.id}
                    tab={tab}
                    isActive={tab.id === activeTabId}
                    onClick={() => setActiveTabId(tab.id)}
                    onClose={closeTab}
                  />
                ))}
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={createNewTab}
                className="ml-2 mr-2"
                data-testid="new-tab-btn"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {/* Content Area */}
            <ContentViewer 
              content={activeTab?.content}
              contentType={activeTab?.contentType}
              url={activeTab?.url}
              source={activeTab?.source}
            />
          </>
        )}

        {activeView === 'search' && (
          <div className="flex-1 p-6 overflow-auto">
            <div className="max-w-4xl mx-auto">
              <div className="mb-6">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search IPFS, PrivaChain domains, and more..."
                  className="text-lg py-3"
                  onKeyPress={(e) => e.key === 'Enter' && performSearch(searchQuery)}
                  data-testid="search-input"
                />
                <div className="mt-2 flex gap-2">
                  <Button 
                    onClick={() => performSearch(searchQuery)}
                    disabled={loading}
                    data-testid="search-btn"
                  >
                    {loading ? <RotateCcw className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
                    Search
                  </Button>
                  <Badge variant="outline">Bang commands: !ipfs !prv !cosmos</Badge>
                </div>
              </div>

              {searchResults.length > 0 && (
                <SearchResults 
                  results={searchResults} 
                  onNavigate={handleSearchNavigation}
                />
              )}
            </div>
          </div>
        )}

        {activeView === 'messenger' && (
          <MessengerView />
        )}
      </div>
      
      <Toaster position="bottom-right" />
    </div>
  );
};

function App() {
  try {
    return (
      <div className="App">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PrivaChainBrowser />} />
          </Routes>
        </BrowserRouter>
      </div>
    );
  } catch (error) {
    console.error('App error:', error);
    return (
      <div className="App">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">PrivaChain Decentral</h1>
            <p className="text-red-600">An error occurred. Please refresh the page.</p>
          </div>
        </div>
      </div>
    );
  }
}

export default App;