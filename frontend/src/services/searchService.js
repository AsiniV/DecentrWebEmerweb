import OrbitDB from 'orbit-db';
import IPFS from 'ipfs-http-client';

class SearchService {
  constructor() {
    this.orbitdb = null;
    this.ipfs = null;
    this.searchDB = null;
    this.contentDB = null;
    this.isInitialized = false;
    this.indexingQueue = [];
  }

  // Initialize OrbitDB and IPFS
  async initialize() {
    try {
      console.log('Initializing decentralized search service...');

      // Connect to IPFS
      this.ipfs = IPFS.create({
        host: 'ipfs.io',
        port: 443,
        protocol: 'https'
      });

      // Initialize OrbitDB
      this.orbitdb = await OrbitDB.createInstance(this.ipfs);

      // Create search index database
      this.searchDB = await this.orbitdb.docstore('privachain-search-index', {
        accessController: {
          write: ['*'] // Allow anyone to write (public index)
        }
      });

      // Create content database for caching
      this.contentDB = await this.orbitdb.docstore('privachain-content-cache', {
        accessController: {
          write: [this.orbitdb.identity.id] // Only we can write to our cache
        }
      });

      // Load existing databases
      await Promise.all([
        this.searchDB.load(),
        this.contentDB.load()
      ]);

      this.isInitialized = true;
      console.log('Decentralized search service initialized');

      // Process any queued indexing operations
      await this.processIndexingQueue();

      return true;
    } catch (error) {
      console.error('Failed to initialize search service:', error);
      this.isInitialized = false;
      return false;
    }
  }

  // Search across decentralized index
  async search(query, options = {}) {
    const {
      searchType = 'hybrid',
      limit = 20,
      offset = 0,
      sortBy = 'relevance'
    } = options;

    try {
      const results = [];

      // Search in OrbitDB index
      if (this.isInitialized && (searchType === 'hybrid' || searchType === 'orbitdb')) {
        const orbitResults = await this.searchOrbitDB(query, limit);
        results.push(...orbitResults);
      }

      // Search IPFS directly
      if (searchType === 'hybrid' || searchType === 'ipfs') {
        const ipfsResults = await this.searchIPFS(query, limit);
        results.push(...ipfsResults);
      }

      // Search .prv domains
      if (searchType === 'hybrid' || searchType === 'prv') {
        const prvResults = await this.searchPRVDomains(query, limit);
        results.push(...prvResults);
      }

      // Search Cosmos chain
      if (searchType === 'hybrid' || searchType === 'cosmos') {
        const cosmosResults = await this.searchCosmos(query, limit);
        results.push(...cosmosResults);
      }

      // Deduplicate and sort results
      const uniqueResults = this.deduplicateResults(results);
      const sortedResults = this.sortResults(uniqueResults, sortBy, query);

      return sortedResults.slice(offset, offset + limit);
    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  // Search in OrbitDB distributed index
  async searchOrbitDB(query, limit) {
    if (!this.searchDB) return [];

    try {
      const queryTerms = query.toLowerCase().split(' ');
      const allDocs = this.searchDB.query(() => true);

      const matchingDocs = allDocs.filter(doc => {
        const searchableText = [
          doc.title || '',
          doc.content || '',
          doc.description || '',
          doc.tags ? doc.tags.join(' ') : ''
        ].join(' ').toLowerCase();

        return queryTerms.some(term => searchableText.includes(term));
      });

      return matchingDocs.map(doc => ({
        id: doc._id || this.generateId(),
        title: doc.title || 'Untitled',
        url: doc.url || doc.cid ? `ipfs://${doc.cid}` : '#',
        content_preview: this.generatePreview(doc.content || doc.description, query),
        source: 'orbitdb',
        relevance_score: this.calculateRelevance(doc, query),
        metadata: {
          cid: doc.cid,
          author: doc.author,
          timestamp: doc.timestamp,
          tags: doc.tags || []
        }
      }));
    } catch (error) {
      console.error('OrbitDB search error:', error);
      return [];
    }
  }

  // Search IPFS network
  async searchIPFS(query, limit) {
    try {
      const results = [];
      
      // Search for IPFS hashes that might be related to the query
      // This is a simplified implementation - in practice you'd have
      // a more sophisticated IPFS content discovery mechanism
      
      const potentialCIDs = await this.discoverIPFSContent(query);
      
      for (const cid of potentialCIDs.slice(0, limit)) {
        try {
          const content = await this.fetchIPFSContent(cid);
          if (content && this.matchesQuery(content, query)) {
            results.push({
              id: this.generateId(),
              title: this.extractTitle(content) || `IPFS Content ${cid.slice(0, 8)}...`,
              url: `ipfs://${cid}`,
              content_preview: this.generatePreview(content, query),
              source: 'ipfs',
              relevance_score: this.calculateTextRelevance(content, query),
              metadata: {
                cid: cid,
                size: content.length,
                timestamp: Date.now()
              }
            });
          }
        } catch (error) {
          console.warn(`Failed to fetch IPFS content ${cid}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('IPFS search error:', error);
      return [];
    }
  }

  // Search .prv domains
  async searchPRVDomains(query, limit) {
    try {
      const results = [];
      
      // Generate potential .prv domain names based on query
      const potentialDomains = this.generatePRVDomains(query);
      
      for (const domain of potentialDomains.slice(0, limit)) {
        const result = {
          id: this.generateId(),
          title: `PrivaChain Domain: ${domain}`,
          url: `https://${domain}.prv`,
          content_preview: `Decentralized domain "${domain}" on PrivaChain network`,
          source: 'prv',
          relevance_score: this.calculateDomainRelevance(domain, query),
          metadata: {
            domain: domain,
            tld: '.prv',
            blockchain: 'cosmos'
          }
        };
        results.push(result);
      }

      return results;
    } catch (error) {
      console.error('PRV domain search error:', error);
      return [];
    }
  }

  // Search Cosmos blockchain
  async searchCosmos(query, limit) {
    try {
      const results = [];
      
      // Search for Cosmos-related content (transactions, smart contracts, etc.)
      // This would integrate with actual Cosmos RPC in a real implementation
      
      const cosmosMatches = this.generateCosmosResults(query, limit);
      
      for (const match of cosmosMatches) {
        results.push({
          id: this.generateId(),
          title: match.title,
          url: match.url,
          content_preview: match.description,
          source: 'cosmos',
          relevance_score: match.relevance,
          metadata: {
            chain: 'cosmoshub',
            type: match.type,
            blockHeight: match.blockHeight
          }
        });
      }

      return results;
    } catch (error) {
      console.error('Cosmos search error:', error);
      return [];
    }
  }

  // Index content in OrbitDB
  async indexContent(contentData) {
    if (!this.isInitialized) {
      this.indexingQueue.push(contentData);
      return false;
    }

    try {
      const indexEntry = {
        _id: contentData.cid || this.generateId(),
        title: contentData.title,
        content: contentData.content,
        description: contentData.description,
        url: contentData.url,
        cid: contentData.cid,
        author: contentData.author || 'anonymous',
        timestamp: Date.now(),
        tags: contentData.tags || [],
        type: contentData.type || 'content'
      };

      await this.searchDB.put(indexEntry);
      console.log('Content indexed:', indexEntry._id);
      return true;
    } catch (error) {
      console.error('Failed to index content:', error);
      return false;
    }
  }

  // Process queued indexing operations
  async processIndexingQueue() {
    while (this.indexingQueue.length > 0) {
      const contentData = this.indexingQueue.shift();
      await this.indexContent(contentData);
    }
  }

  // Discover IPFS content (simplified implementation)
  async discoverIPFSContent(query) {
    // In a real implementation, this would:
    // 1. Query IPFS pinning services
    // 2. Search DHT for content
    // 3. Use content addressing heuristics
    
    // For now, return some example CIDs
    const exampleCIDs = [
      'QmT78zSuBmuS4z925WZfrqQ1qHaJ56DQaTfyMUF7F8ff5o', // "hello world" content
      'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG', // Directory example
    ];
    
    return exampleCIDs;
  }

  // Fetch content from IPFS
  async fetchIPFSContent(cid) {
    try {
      const chunks = [];
      for await (const chunk of this.ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      return data.toString();
    } catch (error) {
      console.error(`Failed to fetch IPFS content ${cid}:`, error);
      return null;
    }
  }

  // Generate potential .prv domains
  generatePRVDomains(query) {
    const words = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ');
    const domains = [];
    
    // Single word domains
    for (const word of words) {
      if (word.length >= 3) {
        domains.push(word);
      }
    }
    
    // Combined word domains
    if (words.length > 1) {
      domains.push(words.join(''));
      domains.push(words.join('-'));
    }
    
    return domains.slice(0, 5); // Limit to 5 potential domains
  }

  // Generate Cosmos search results
  generateCosmosResults(query, limit) {
    const results = [];
    const queryLower = query.toLowerCase();
    
    // Example Cosmos-related results
    const cosmosTemplates = [
      {
        title: `Cosmos Transaction: ${query}`,
        url: `https://mintscan.io/cosmos/txs?q=${encodeURIComponent(query)}`,
        description: `Blockchain transaction or smart contract related to "${query}"`,
        type: 'transaction',
        relevance: 0.8,
        blockHeight: Math.floor(Math.random() * 1000000)
      },
      {
        title: `IBC Transfer: ${query}`,
        url: `https://mapofzones.com/?testnet=false&period=24&tableOrderBy=totalIbcTxs&tableOrderSort=desc`,
        description: `Inter-blockchain communication related to "${query}"`,
        type: 'ibc',
        relevance: 0.7,
        blockHeight: Math.floor(Math.random() * 1000000)
      }
    ];
    
    return cosmosTemplates.slice(0, limit);
  }

  // Helper methods
  matchesQuery(content, query) {
    const contentLower = content.toLowerCase();
    const queryTerms = query.toLowerCase().split(' ');
    return queryTerms.some(term => contentLower.includes(term));
  }

  calculateRelevance(doc, query) {
    const text = [doc.title, doc.content, doc.description].join(' ').toLowerCase();
    const queryTerms = query.toLowerCase().split(' ');
    
    let score = 0;
    for (const term of queryTerms) {
      const matches = (text.match(new RegExp(term, 'g')) || []).length;
      score += matches * (1 / text.length) * 1000;
    }
    
    return Math.min(score, 1);
  }

  calculateTextRelevance(content, query) {
    const contentLower = content.toLowerCase();
    const queryTerms = query.toLowerCase().split(' ');
    
    let matches = 0;
    for (const term of queryTerms) {
      matches += (contentLower.match(new RegExp(term, 'g')) || []).length;
    }
    
    return Math.min(matches / queryTerms.length / 10, 1);
  }

  calculateDomainRelevance(domain, query) {
    const domainLower = domain.toLowerCase();
    const queryLower = query.toLowerCase();
    
    if (domainLower === queryLower) return 1;
    if (domainLower.includes(queryLower)) return 0.8;
    if (queryLower.includes(domainLower)) return 0.6;
    
    return 0.4;
  }

  extractTitle(content) {
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return titleMatch[1];
    
    const h1Match = content.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) return h1Match[1];
    
    const firstLine = content.split('\n')[0];
    if (firstLine && firstLine.length < 100) return firstLine;
    
    return null;
  }

  generatePreview(content, query) {
    if (!content) return '';
    
    const queryTerms = query.toLowerCase().split(' ');
    let preview = content.substring(0, 200);
    
    // Try to find a snippet that contains query terms
    for (const term of queryTerms) {
      const index = content.toLowerCase().indexOf(term);
      if (index !== -1) {
        const start = Math.max(0, index - 50);
        const end = Math.min(content.length, index + 150);
        preview = content.substring(start, end);
        if (start > 0) preview = '...' + preview;
        if (end < content.length) preview = preview + '...';
        break;
      }
    }
    
    return preview;
  }

  deduplicateResults(results) {
    const seen = new Set();
    return results.filter(result => {
      const key = result.url || result.title;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  sortResults(results, sortBy, query) {
    switch (sortBy) {
      case 'relevance':
        return results.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
      case 'timestamp':
        return results.sort((a, b) => (b.metadata?.timestamp || 0) - (a.metadata?.timestamp || 0));
      default:
        return results;
    }
  }

  generateId() {
    return `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get service status
  getStatus() {
    return {
      initialized: this.isInitialized,
      orbitdbConnected: !!this.orbitdb,
      ipfsConnected: !!this.ipfs,
      searchDBAddress: this.searchDB?.address?.toString(),
      indexedItems: this.searchDB ? this.searchDB.query(() => true).length : 0
    };
  }
}

export const searchService = new SearchService();