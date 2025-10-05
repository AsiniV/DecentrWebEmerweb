import nacl from 'tweetnacl';
import { decodeUTF8, encodeUTF8, decodeBase64, encodeBase64 } from 'tweetnacl-util';

class CryptoService {
  constructor() {
    this.keyPair = null;
    this.contactKeys = new Map();
  }

  // Generate new key pair for this user
  generateKeyPair() {
    this.keyPair = nacl.box.keyPair();
    this.saveKeyPair();
    return {
      publicKey: encodeBase64(this.keyPair.publicKey),
      secretKey: encodeBase64(this.keyPair.secretKey)
    };
  }

  // Load existing key pair from localStorage
  loadKeyPair() {
    try {
      const saved = localStorage.getItem('privachain_keypair');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.keyPair = {
          publicKey: decodeBase64(parsed.publicKey),
          secretKey: decodeBase64(parsed.secretKey)
        };
        return true;
      }
    } catch (error) {
      console.error('Failed to load key pair:', error);
    }
    return false;
  }

  // Save key pair to localStorage
  saveKeyPair() {
    if (!this.keyPair) return;
    
    const keyData = {
      publicKey: encodeBase64(this.keyPair.publicKey),
      secretKey: encodeBase64(this.keyPair.secretKey)
    };
    localStorage.setItem('privachain_keypair', JSON.stringify(keyData));
  }

  // Get current user's public key
  getPublicKey() {
    if (!this.keyPair) {
      if (!this.loadKeyPair()) {
        this.generateKeyPair();
      }
    }
    return encodeBase64(this.keyPair.publicKey);
  }

  // Add a contact's public key
  addContact(contactId, publicKeyBase64) {
    try {
      const publicKey = decodeBase64(publicKeyBase64);
      this.contactKeys.set(contactId, publicKey);
      this.saveContacts();
      return true;
    } catch (error) {
      console.error('Failed to add contact:', error);
      return false;
    }
  }

  // Encrypt message for a specific contact
  encryptMessage(message, contactId) {
    if (!this.keyPair) {
      throw new Error('No key pair available');
    }

    const contactPublicKey = this.contactKeys.get(contactId);
    if (!contactPublicKey) {
      throw new Error('Contact public key not found');
    }

    const nonce = nacl.randomBytes(24);
    const messageUint8 = decodeUTF8(message);
    
    const encrypted = nacl.box(
      messageUint8,
      nonce,
      contactPublicKey,
      this.keyPair.secretKey
    );

    return {
      encryptedMessage: encodeBase64(encrypted),
      nonce: encodeBase64(nonce),
      from: this.getPublicKey(),
      to: encodeBase64(contactPublicKey),
      timestamp: Date.now()
    };
  }

  // Decrypt received message
  decryptMessage(encryptedData) {
    if (!this.keyPair) {
      throw new Error('No key pair available');
    }

    try {
      const encrypted = decodeBase64(encryptedData.encryptedMessage);
      const nonce = decodeBase64(encryptedData.nonce);
      const senderPublicKey = decodeBase64(encryptedData.from);

      const decrypted = nacl.box.open(
        encrypted,
        nonce,
        senderPublicKey,
        this.keyPair.secretKey
      );

      if (!decrypted) {
        throw new Error('Failed to decrypt message');
      }

      return {
        message: encodeUTF8(decrypted),
        from: encryptedData.from,
        timestamp: encryptedData.timestamp,
        verified: true
      };
    } catch (error) {
      console.error('Failed to decrypt message:', error);
      return {
        message: '[Failed to decrypt message]',
        from: encryptedData.from,
        timestamp: encryptedData.timestamp,
        verified: false
      };
    }
  }

  // Generate message signature for authenticity
  signMessage(message) {
    const messageUint8 = decodeUTF8(message);
    const signature = nacl.sign.detached(messageUint8, this.keyPair.secretKey);
    return encodeBase64(signature);
  }

  // Verify message signature
  verifySignature(message, signatureBase64, publicKeyBase64) {
    try {
      const signature = decodeBase64(signatureBase64);
      const publicKey = decodeBase64(publicKeyBase64);
      const messageUint8 = decodeUTF8(message);
      
      return nacl.sign.detached.verify(messageUint8, signature, publicKey);
    } catch (error) {
      console.error('Failed to verify signature:', error);
      return false;
    }
  }

  // Save contacts to localStorage
  saveContacts() {
    const contacts = {};
    for (const [id, key] of this.contactKeys.entries()) {
      contacts[id] = encodeBase64(key);
    }
    localStorage.setItem('privachain_contacts', JSON.stringify(contacts));
  }

  // Load contacts from localStorage
  loadContacts() {
    try {
      const saved = localStorage.getItem('privachain_contacts');
      if (saved) {
        const contacts = JSON.parse(saved);
        for (const [id, keyBase64] of Object.entries(contacts)) {
          this.contactKeys.set(id, decodeBase64(keyBase64));
        }
      }
    } catch (error) {
      console.error('Failed to load contacts:', error);
    }
  }

  // Get all contacts
  getContacts() {
    const contacts = [];
    for (const [id, key] of this.contactKeys.entries()) {
      contacts.push({
        id,
        publicKey: encodeBase64(key)
      });
    }
    return contacts;
  }

  // Initialize crypto service
  initialize() {
    if (!this.loadKeyPair()) {
      this.generateKeyPair();
    }
    this.loadContacts();
  }

  // Generate contact invitation
  generateInvite() {
    return {
      publicKey: this.getPublicKey(),
      timestamp: Date.now(),
      type: 'privachain_contact_invite'
    };
  }

  // Accept contact invitation
  acceptInvite(invite, contactId) {
    if (invite.type !== 'privachain_contact_invite') {
      throw new Error('Invalid invite type');
    }
    
    return this.addContact(contactId, invite.publicKey);
  }
}

export const cryptoService = new CryptoService();