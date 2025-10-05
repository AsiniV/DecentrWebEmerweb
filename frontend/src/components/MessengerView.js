import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Plus, Send, Key, Shield, Users, Copy, Check, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { toast } from 'sonner';
import { messagingService } from '../services/messagingService';
import { cryptoService } from '../services/cryptoService';

const MessengerView = () => {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [peerId, setPeerId] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [isInitializing, setIsInitializing] = useState(true);
  const [newContactId, setNewContactId] = useState('');
  const [newContactKey, setNewContactKey] = useState('');
  const [showAddContact, setShowAddContact] = useState(false);
  const [showMyKeys, setShowMyKeys] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    initializeMessaging();
    
    return () => {
      messagingService.stop();
    };
  }, []);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation);
    }
  }, [activeConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const initializeMessaging = async () => {
    try {
      setIsInitializing(true);
      
      // Initialize messaging service
      const success = await messagingService.initialize();
      
      if (success) {
        // Set up event listeners
        messagingService.addStatusListener(handleStatusUpdate);
        messagingService.addMessageListener(handleMessageUpdate);
        
        // Load initial data
        const status = messagingService.getStatus();
        setIsOnline(status.online);
        setPeerId(status.peerId || '');
        setPublicKey(status.publicKey);
        
        // Load conversations
        loadConversations();
        
        toast.success('Decentralized messaging initialized');
      } else {
        toast.error('Failed to initialize messaging service');
      }
    } catch (error) {
      console.error('Messaging initialization error:', error);
      toast.error('Messaging service error: ' + error.message);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleStatusUpdate = (status) => {
    setIsOnline(status.online);
    if (status.peerId) setPeerId(status.peerId);
    if (status.error) {
      toast.error('Messaging service error: ' + status.error);
    }
  };

  const handleMessageUpdate = (event) => {
    switch (event.type) {
      case 'message_received':
        loadConversations();
        if (activeConversation === event.contactId) {
          loadMessages(event.contactId);
        }
        toast.success(`New message from ${event.contactId.slice(0, 8)}...`);
        break;
      case 'message_stored':
        if (activeConversation === event.contactId) {
          loadMessages(event.contactId);
        }
        break;
      case 'message_updated':
        if (activeConversation) {
          loadMessages(activeConversation);
        }
        break;
    }
  };

  const loadConversations = () => {
    const convs = messagingService.getConversations();
    setConversations(convs);
  };

  const loadMessages = (contactId) => {
    const msgs = messagingService.getMessages(contactId);
    setMessages(msgs);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConversation) return;
    
    try {
      await messagingService.sendMessage(activeConversation, newMessage.trim());
      setNewMessage('');
      loadMessages(activeConversation);
    } catch (error) {
      console.error('Send message error:', error);
      toast.error('Failed to send message: ' + error.message);
    }
  };

  const addContact = async () => {
    if (!newContactId.trim() || !newContactKey.trim()) {
      toast.error('Please provide both contact ID and public key');
      return;
    }

    try {
      const success = messagingService.addContact(newContactId.trim(), newContactKey.trim());
      if (success) {
        setNewContactId('');
        setNewContactKey('');
        setShowAddContact(false);
        loadConversations();
        toast.success('Contact added successfully');
      } else {
        toast.error('Failed to add contact');
      }
    } catch (error) {
      console.error('Add contact error:', error);
      toast.error('Failed to add contact: ' + error.message);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  if (isInitializing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-500" />
          <h3 className="text-lg font-semibold mb-2">Initializing Decentralized Messaging</h3>
          <p className="text-gray-500">Setting up P2P network and encryption...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex">
      {/* Sidebar */}
      <div className="w-80 border-r bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-500" />
              Encrypted Messages
            </h2>
            <div className="flex gap-2">
              <Dialog open={showMyKeys} onOpenChange={setShowMyKeys}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Key className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Your Cryptographic Identity</DialogTitle>
                    <DialogDescription>
                      Share your public key with contacts to enable encrypted messaging
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Peer ID (P2P Network)</label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          value={peerId}
                          readOnly
                          className="font-mono text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(peerId)}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Public Key (Encryption)</label>
                      <div className="flex items-center gap-2 mt-1">
                        <Input
                          value={publicKey}
                          readOnly
                          className="font-mono text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyToClipboard(publicKey)}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              
              <Dialog open={showAddContact} onOpenChange={setShowAddContact}>
                <DialogTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Plus className="w-4 h-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Contact</DialogTitle>
                    <DialogDescription>
                      Add a new contact by providing their ID and public key
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Contact ID</label>
                      <Input
                        value={newContactId}
                        onChange={(e) => setNewContactId(e.target.value)}
                        placeholder="Enter contact identifier"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Public Key</label>
                      <Input
                        value={newContactKey}
                        onChange={(e) => setNewContactKey(e.target.value)}
                        placeholder="Enter contact's public key"
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setShowAddContact(false)}>
                        Cancel
                      </Button>
                      <Button onClick={addContact}>
                        Add Contact
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className={isOnline ? 'text-green-600' : 'text-red-600'}>
              {isOnline ? 'Connected to P2P Network' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="text-center p-8 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No conversations yet</p>
              <p className="text-xs mt-1">Add contacts to start messaging</p>
            </div>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.contactId}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  activeConversation === conversation.contactId ? 'bg-blue-50 border-blue-200' : ''
                }`}
                onClick={() => setActiveConversation(conversation.contactId)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {conversation.contactId.length > 16 
                        ? `${conversation.contactId.slice(0, 16)}...` 
                        : conversation.contactId}
                    </p>
                    {conversation.lastMessage && (
                      <p className="text-xs text-gray-500 truncate mt-1">
                        {conversation.lastMessage.from === 'self' ? 'You: ' : ''}
                        {conversation.lastMessage.message}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {conversation.lastMessage && formatTimestamp(conversation.lastMessage.timestamp)}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <Badge variant="outline" className="text-xs">
                    {conversation.messageCount} messages
                  </Badge>
                  <Shield className="w-3 h-3 text-green-500" title="End-to-end encrypted" />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {!activeConversation ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Select a conversation to start messaging</p>
              <p className="text-sm mt-2">All messages are end-to-end encrypted</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b bg-white">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium">
                    {activeConversation.length > 20 
                      ? `${activeConversation.slice(0, 20)}...` 
                      : activeConversation}
                  </p>
                  <p className="text-xs text-green-600">End-to-end encrypted • P2P delivery</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.from === 'self' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.from === 'self'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-gray-900'
                    }`}
                  >
                    <p className="text-sm">{message.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-xs opacity-70">
                        {formatTimestamp(message.timestamp)}
                      </p>
                      {message.encrypted && (
                        <Shield className="w-3 h-3 opacity-70" title="Encrypted" />
                      )}
                      {message.status && message.from === 'self' && (
                        <Badge variant="outline" className="text-xs">
                          {message.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="p-4 border-t bg-white">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your encrypted message..."
                  className="flex-1"
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  disabled={!isOnline}
                />
                <Button onClick={sendMessage} disabled={!newMessage.trim() || !isOnline}>
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              {!isOnline && (
                <p className="text-xs text-red-500 mt-1">
                  Reconnecting to P2P network...
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default MessengerView;