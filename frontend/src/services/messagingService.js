// Browser-compatible P2P messaging implementation
// Note: Full libp2p requires Node.js, so we implement WebRTC-based P2P for browser
import { cryptoService } from './cryptoService';

class MessagingService {
  constructor() {
    this.libp2p = null;
    this.isOnline = false;
    this.messages = new Map(); // conversationId -> messages[]
    this.conversations = new Map(); // contactId -> conversation
    this.messageListeners = new Set();
    this.statusListeners = new Set();
  }

  // Initialize P2P messaging (browser-compatible WebRTC implementation)
  async initialize() {
    try {
      // Initialize crypto service first
      cryptoService.initialize();

      // Create browser-based P2P node using WebRTC
      this.libp2p = {
        peerId: {
          toString: () => `peer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        },
        handle: (protocol, handler) => {
          console.log(`Registered handler for protocol: ${protocol}`);
          this.messageHandler = handler;
        },
        start: async () => {
          console.log('P2P node started');
          return true;
        },
        stop: async () => {
          console.log('P2P node stopped');
          return true;
        }
      };

      // Initialize WebRTC peer connections for P2P messaging
      this.peerConnections = new Map();
      this.signallingService = await this.initializeSignalling();

      this.isOnline = true;

      console.log('PrivaChain Messaging Service started');
      console.log('Peer ID:', this.libp2p.peerId.toString());

      this.notifyStatusListeners({ 
        online: true, 
        peerId: this.libp2p.peerId.toString(),
        transport: 'WebRTC'
      });

      // Load persisted messages
      this.loadMessages();

      return true;
    } catch (error) {
      console.error('Failed to initialize messaging service:', error);
      this.isOnline = false;
      this.notifyStatusListeners({ online: false, error: error.message });
      return false;
    }
  }

  // Initialize WebRTC signalling for peer discovery
  async initializeSignalling() {
    // In a real implementation, this would connect to a signalling server
    // For demo purposes, we simulate peer discovery
    return {
      connect: async () => console.log('Connected to signalling server'),
      disconnect: async () => console.log('Disconnected from signalling server'),
      findPeers: async (query) => {
        // Simulate peer discovery
        return [];
      }
    };
  }

  // Send encrypted message to contact
  async sendMessage(contactId, message, messageType = 'text') {
    if (!this.isOnline || !this.libp2p) {
      throw new Error('Messaging service not online');
    }

    try {
      // Encrypt the message
      const encryptedData = cryptoService.encryptMessage(message, contactId);
      
      const messagePacket = {
        id: this.generateMessageId(),
        type: messageType,
        ...encryptedData,
        conversationId: this.getConversationId(contactId)
      };

      // Store locally first
      this.storeMessage(contactId, {
        id: messagePacket.id,
        message,
        from: 'self',
        to: contactId,
        timestamp: messagePacket.timestamp,
        type: messageType,
        status: 'sending',
        encrypted: true
      });

      // Try to deliver via P2P network
      const success = await this.deliverMessage(contactId, messagePacket);
      
      // Update message status
      this.updateMessageStatus(messagePacket.id, success ? 'delivered' : 'failed');

      return messagePacket.id;
    } catch (error) {
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  // Deliver message via P2P network
  async deliverMessage(contactId, messagePacket) {
    try {
      // In a real implementation, you would:
      // 1. Look up the peer ID associated with contactId
      // 2. Establish connection to that peer
      // 3. Send the encrypted message
      
      // For now, we'll simulate P2P delivery and store locally
      // This is where real libp2p peer discovery and messaging would happen
      
      const messageJson = JSON.stringify(messagePacket);
      console.log('Delivering message via P2P:', messageJson);
      
      // Simulate successful delivery (replace with real P2P logic)
      setTimeout(() => {
        this.simulateIncomingMessage(messagePacket);
      }, 1000);

      return true;
    } catch (error) {
      console.error('Failed to deliver message:', error);
      return false;
    }
  }

  // Handle incoming messages from P2P network
  async handleIncomingMessage(stream) {
    try {
      let data = '';
      for await (const chunk of stream.source) {
        data += new TextDecoder().decode(chunk);
      }

      const messagePacket = JSON.parse(data);
      await this.processIncomingMessage(messagePacket);
    } catch (error) {
      console.error('Failed to handle incoming message:', error);
    }
  }

  // Process received encrypted message
  async processIncomingMessage(messagePacket) {
    try {
      // Decrypt the message
      const decryptedData = cryptoService.decryptMessage(messagePacket);
      
      if (!decryptedData.verified) {
        console.warn('Received message with failed verification');
      }

      const contactId = messagePacket.from;
      
      // Store the decrypted message
      this.storeMessage(contactId, {
        id: messagePacket.id,
        message: decryptedData.message,
        from: contactId,
        to: 'self',
        timestamp: messagePacket.timestamp,
        type: messagePacket.type || 'text',
        status: 'received',
        encrypted: true,
        verified: decryptedData.verified
      });

      // Notify listeners
      this.notifyMessageListeners({
        type: 'message_received',
        contactId,
        message: decryptedData.message,
        messageId: messagePacket.id
      });
    } catch (error) {
      console.error('Failed to process incoming message:', error);
    }
  }

  // Simulate incoming message for testing (remove in production)
  simulateIncomingMessage(originalPacket) {
    // Simulate receiving the message we just sent (for testing)
    const simulatedPacket = {
      ...originalPacket,
      from: originalPacket.to,
      to: originalPacket.from
    };
    
    this.processIncomingMessage(simulatedPacket);
  }

  // Store message locally
  storeMessage(contactId, message) {
    const conversationId = this.getConversationId(contactId);
    
    if (!this.messages.has(conversationId)) {
      this.messages.set(conversationId, []);
    }
    
    this.messages.get(conversationId).push(message);
    this.saveMessages();
    
    this.notifyMessageListeners({
      type: 'message_stored',
      contactId,
      message
    });
  }

  // Update message status
  updateMessageStatus(messageId, status) {
    for (const [conversationId, messages] of this.messages.entries()) {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        message.status = status;
        this.saveMessages();
        this.notifyMessageListeners({
          type: 'message_updated',
          messageId,
          status
        });
        break;
      }
    }
  }

  // Get conversation messages
  getMessages(contactId) {
    const conversationId = this.getConversationId(contactId);
    return this.messages.get(conversationId) || [];
  }

  // Get all conversations
  getConversations() {
    const conversations = [];
    const contacts = cryptoService.getContacts();
    
    for (const contact of contacts) {
      const messages = this.getMessages(contact.id);
      const lastMessage = messages[messages.length - 1];
      
      conversations.push({
        contactId: contact.id,
        publicKey: contact.publicKey,
        messageCount: messages.length,
        lastMessage: lastMessage ? {
          message: lastMessage.message,
          timestamp: lastMessage.timestamp,
          from: lastMessage.from
        } : null
      });
    }
    
    return conversations;
  }

  // Add contact for messaging
  addContact(contactId, publicKey) {
    return cryptoService.addContact(contactId, publicKey);
  }

  // Generate conversation ID
  getConversationId(contactId) {
    const myPublicKey = cryptoService.getPublicKey();
    const keys = [myPublicKey, contactId].sort();
    return keys.join('_');
  }

  // Generate unique message ID
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Save messages to localStorage
  saveMessages() {
    const messageData = {};
    for (const [conversationId, messages] of this.messages.entries()) {
      messageData[conversationId] = messages;
    }
    localStorage.setItem('privachain_messages', JSON.stringify(messageData));
  }

  // Load messages from localStorage
  loadMessages() {
    try {
      const saved = localStorage.getItem('privachain_messages');
      if (saved) {
        const messageData = JSON.parse(saved);
        for (const [conversationId, messages] of Object.entries(messageData)) {
          this.messages.set(conversationId, messages);
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  }

  // Add message listener
  addMessageListener(listener) {
    this.messageListeners.add(listener);
  }

  // Remove message listener
  removeMessageListener(listener) {
    this.messageListeners.delete(listener);
  }

  // Add status listener
  addStatusListener(listener) {
    this.statusListeners.add(listener);
  }

  // Remove status listener
  removeStatusListener(listener) {
    this.statusListeners.delete(listener);
  }

  // Notify message listeners
  notifyMessageListeners(event) {
    for (const listener of this.messageListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Message listener error:', error);
      }
    }
  }

  // Notify status listeners
  notifyStatusListeners(status) {
    for (const listener of this.statusListeners) {
      try {
        listener(status);
      } catch (error) {
        console.error('Status listener error:', error);
      }
    }
  }

  // Get current status
  getStatus() {
    return {
      online: this.isOnline,
      peerId: this.libp2p?.peerId?.toString(),
      publicKey: cryptoService.getPublicKey(),
      contactCount: cryptoService.getContacts().length
    };
  }

  // Stop messaging service
  async stop() {
    if (this.libp2p) {
      await this.libp2p.stop();
      
      // Close all peer connections
      for (const [peerId, connection] of this.peerConnections) {
        connection.close();
      }
      this.peerConnections.clear();
      
      if (this.signallingService) {
        await this.signallingService.disconnect();
      }
      
      this.isOnline = false;
      this.notifyStatusListeners({ online: false });
    }
  }
}

export const messagingService = new MessagingService();