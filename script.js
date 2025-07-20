import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, set, push, onValue, remove, update, query, orderByKey, limitToLast, orderByChild, startAt, endAt } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: window.REACT_APP_API_KEY,
    authDomain: window.REACT_APP_AUTH_DOMAIN,
    databaseURL: window.REACT_APP_URL,
    projectId: window.REACT_APP_PROJECT_ID,
    storageBucket: window.REACT_APP_STORAGE_BUCKET,
    messagingSenderId: window.REACT_APP_MESSAGING_SENDER_ID,
    appId: window.REACT_APP_APP_ID
};

// Validate Firebase configuration
function validateFirebaseConfig(config) {
    const requiredKeys = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    for (const key of requiredKeys) {
        if (!config[key] || config[key].includes('window.REACT_APP_')) {
            throw new Error(`Missing or invalid Firebase config key: ${key}`);
        }
    }
}

// Initialize Firebase with error handling and recovery
let app, database;
try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
} catch (error) {
    console.error('Firebase initialization error:', error);
    alert('Failed to initialize Firebase. Attempting recovery...');
    // Attempt recovery with default config or local storage fallback
    const cachedConfig = localStorage.getItem('firebaseConfig');
    if (cachedConfig) {
        try {
            app = initializeApp(JSON.parse(cachedConfig));
            database = getDatabase(app);
        } catch (recoveryError) {
            console.error('Recovery failed:', recoveryError);
            alert('Recovery failed. Please reload or check network.');
        }
    }
}

// Database references with validation
const messagesRef = database ? ref(database, 'messages') : null;
const usersRef = database ? ref(database, 'users') : null;

// Single cookie-based user identity
let userIdentity = getCookie('userIdentity') || generateUserIdentity();
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    return parts.length === 2 ? parts.pop().split(';').shift() : null;
}
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value}; expires=${date.toUTCString()}; SameSite=Strict; Secure`;
}
function generateUserIdentity() {
    const deviceId = generateDeviceId();
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB'];
    const color = colors[Math.floor(Math.random() * colors.length)].replace('#', '');
    const identity = `${deviceId.substring(0, 32)}_${color}`;
    setCookie('userIdentity', identity, 365); // Persist for 1 year
    return identity;
}
function generateDeviceId() {
    return crypto.getRandomValues(new Uint32Array(4)).join('').substring(0, 32);
}

// User state management
let nickname = localStorage.getItem('nickname') || userIdentity.split('_')[0].substring(0, 10);
let userColor = `#${userIdentity.split('_')[1]}`;
let theme = localStorage.getItem('theme') || 'light';
let retentionDays = 6; // Configurable message retention period

// Utility functions
function escapeHtml(unsafe) {
    return unsafe.replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
}
function sanitizeHtml(html) {
    const div = document.createElement('div');
    div.innerHTML = escapeHtml(html);
    // Remove script tags and unsafe attributes
    div.querySelectorAll('*').forEach(node => {
        node.removeAttribute('onerror');
        node.removeAttribute('onload');
        if (node.tagName.toLowerCase() === 'script') node.remove();
    });
    return div.innerHTML;
}
function validateText(text) {
    const regex = /^[a-zA-Z0-9\s.,!?]+$/;
    return text && text.length <= 1000 && regex.test(text) && !text.includes('127.0.0.1') && !text.includes('local');
}
function validateNickname(nick) {
    const regex = /^[a-zA-Z0-9_]{3,20}$/;
    return nick && regex.test(nick);
}
function formatDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (new Date(today.setDate(today.getDate() - 1)).toDateString() === date.toDateString()) return 'Yesterday';
    return date.toLocaleDateString();
}

// Message rendering with HTML/MD support
function addMessageToDOM(key, msg, prepend = false, isSearchResult = false) {
    if (!document.getElementById('chat-messages') || !database) return;
    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.id = key;
    messageDiv.className = `message ${msg.pinned ? 'pinned' : ''} ${msg.replyTo ? 'reply' : ''}`;
    messageDiv.style.borderLeft = `4px solid ${msg.color || userColor}`;

    // Date separator
    if (!prepend && !isSearchResult) {
        const messages = messagesDiv.children;
        let lastDate = null;
        if (messages.length > 0) {
            const lastMessage = Array.from(messages).find(el => el.classList.contains('message'));
            if (lastMessage) lastDate = formatDate(parseInt(lastMessage.id.split('-')[1] || 0));
        }
        if (formatDate(msg.timestamp) !== lastDate) {
            const separator = document.createElement('div');
            separator.className = 'date-separator';
            separator.textContent = formatDate(msg.timestamp);
            messagesDiv.appendChild(separator);
        }
    }

    let replyHtml = '';
    if (msg.replyTo) replyHtml = `<div class="reply-preview" data-reply-id="${msg.replyTo}">Replying to: ${sanitizeHtml(msg.replyText || 'Message')}</div>`;

    const reactions = msg.reactions || { check: 0, cross: 0 };
    const reactionsHtml = `
        <div class="reactions">
            <button class="reaction-btn check-btn" data-key="${key}" data-type="check">✅ ${reactions.check || 0}</button>
            <button class="reaction-btn cross-btn" data-key="${key}" data-type="cross">❌ ${reactions.cross || 0}</button>
        </div>
    `;

    const textToDisplay = isSearchResult && msg.searchTerm
        ? sanitizeHtml(msg.text).replace(new RegExp(`(${msg.searchTerm})`, 'gi'), '<span class="highlight">$1</span>')
        : sanitizeHtml(msg.text);

    messageDiv.innerHTML = `
        <div class="message-sender" style="color: ${msg.color || userColor}">${escapeHtml(msg.nickname || nickname)}</div>
        ${replyHtml}
        <div class="message-text">${textToDisplay}${msg.edited ? ' <span style="font-style: italic; color: #888;">(edited)</span>' : ''}</div>
        ${reactionsHtml}
        <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
        <div class="message-actions">
            <button class="message-action-btn edit-btn" data-key="${key}">Edit</button>
            <button class="message-action-btn delete-btn" data-key="${key}">Delete</button>
            <button class="message-action-btn pin-btn" data-key="${key}" data-pinned="${msg.pinned}">${msg.pinned ? 'Unpin' : 'Pin'}</button>
            <button class="message-action-btn reply-btn" data-key="${key}" data-text="${escapeHtml(msg.text)}">Reply</button>
        </div>
    `;

    messageDiv.querySelector('.edit-btn').addEventListener('click', () => editMessage(key));
    messageDiv.querySelector('.delete-btn').addEventListener('click', () => deleteMessage(key));
    messageDiv.querySelector('.pin-btn').addEventListener('click', () => msg.pinned ? unpinMessage(key) : pinMessage(key));
    messageDiv.querySelector('.reply-btn').addEventListener('click', () => replyToMessage(key, msg.text));
    messageDiv.querySelectorAll('.reaction-btn').forEach(btn => btn.addEventListener('click', (e) => toggleReaction(key, e.target.dataset.type)));
    if (msg.replyTo) messageDiv.querySelector('.reply-preview').addEventListener('click', () => scrollToMessage(msg.replyTo));

    if (prepend) messagesDiv.prepend(messageDiv);
    else {
        messagesDiv.appendChild(messageDiv);
        if (!isSearchResult) messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

function scrollToMessage(key) {
    const messageDiv = document.getElementById(key);
    if (messageDiv) {
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageDiv.classList.add('highlight-message');
        setTimeout(() => messageDiv.classList.remove('highlight-message'), 2000);
    }
}

function updatePinnedMessages() {
    if (!document.getElementById('pinned-messages') || !database) return;
    const pinnedMessagesDiv = document.getElementById('pinned-messages');
    pinnedMessagesDiv.innerHTML = '';
    onValue(query(messagesRef, orderByChild('pinned'), startAt(true), limitToLast(5)), (snapshot) => {
        const pinnedMessages = [];
        snapshot.forEach(childSnapshot => {
            const msg = childSnapshot.val();
            const pinnedMessageDiv = document.createElement('span');
            pinnedMessageDiv.className = 'pinned-message';
            const shortText = msg.text.length > 50 ? `${sanitizeHtml(msg.text.substring(0, 50))}...` : sanitizeHtml(msg.text);
            pinnedMessageDiv.innerHTML = `<span style="color: ${msg.color || userColor}">${escapeHtml(msg.nickname || nickname)}: ${shortText}</span>`;
            pinnedMessageDiv.addEventListener('click', () => scrollToMessage(childSnapshot.key));
            pinnedMessages.push(pinnedMessageDiv);
        });
        if (pinnedMessages.length > 0) {
            const wrapper = document.createElement('div');
            wrapper.className = 'pinned-messages-wrapper';
            pinnedMessages.forEach(div => wrapper.appendChild(div));
            pinnedMessagesDiv.appendChild(wrapper);
        }
    }, { onlyOnce: true });
}

// Load messages with pagination
let lastMessageKey = null;
let isLoading = false;
async function loadMessages() {
    if (!database || !messagesRef || isLoading) return;
    isLoading = true;
    try {
        const queryRef = lastMessageKey
            ? query(messagesRef, orderByKey(), endAt(lastMessageKey), limitToLast(30))
            : query(messagesRef, orderByKey(), limitToLast(30));
        onValue(queryRef, (snapshot) => {
            const messages = snapshot.val();
            if (messages) {
                const messageKeys = Object.keys(messages).reverse();
                messageKeys.forEach((key) => {
                    if (!document.getElementById(key)) addMessageToDOM(key, messages[key], true);
                });
                lastMessageKey = messageKeys[0];
            }
            isLoading = false;
        }, { onlyOnce: true });
    } catch (error) {
        console.error('Error loading messages:', error);
        selfHeal('loadMessages', error);
        isLoading = false;
    }
}

function handleScroll() {
    const messagesDiv = document.getElementById('chat-messages');
    if (messagesDiv && messagesDiv.scrollTop === 0 && !isLoading) loadMessages();
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    if (!database) return;
    const sendButton = document.getElementById('send-btn');
    const inputField = document.getElementById('message-input');
    const searchButton = document.getElementById('search-btn');
    const settingsButton = document.getElementById('settings-btn');
    const clearButton = document.getElementById('clear-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const messagesDiv = document.getElementById('chat-messages');

    if (sendButton) sendButton.addEventListener('click', sendMessage);
    if (inputField) inputField.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());
    if (searchButton) searchButton.addEventListener('click', toggleSearch);
    if (settingsButton) settingsButton.addEventListener('click', openSettings);
    if (clearButton) clearButton.addEventListener('click', clearChat);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if (messagesDiv) messagesDiv.addEventListener('scroll', handleScroll);

    loadMessages();
    updatePinnedMessages();
    syncTheme();
    updateOnlineStatus();
    optimizeDatabase();
});

// Send message with HTML/MD support
function sendMessage() {
    if (!database || !messagesRef) return;
    const input = document.getElementById('message-input');
    if (!input) return;
    let text = input.value.trim();
    const replyTo = input.dataset.replyTo || null;
    const replyText = input.dataset.replyText || null;
    if (validateText(text.replace(/<[^>]+>/g, ''))) {
        text = sanitizeHtml(text); // Allow HTML/MD but sanitize
        try {
            const newMessageRef = push(messagesRef);
            set(newMessageRef, {
                author: userIdentity,
                nickname: nickname,
                text: text,
                color: userColor,
                timestamp: Date.now(),
                edited: false,
                pinned: false,
                reactions: { check: 0, cross: 0 },
                replyTo: replyTo,
                replyText: replyText
            });
            input.value = '';
            input.dataset.replyTo = '';
            input.dataset.replyText = '';
            input.placeholder = 'Type a message...';
        } catch (error) {
            console.error('Error sending message:', error);
            selfHeal('sendMessage', error);
            alert('Failed to send message.');
        }
    } else {
        alert('Invalid message. Use only letters, numbers, spaces, and basic punctuation (HTML tags allowed).');
    }
}

// Real-time message updates
if (messagesRef) {
    onValue(messagesRef, (snapshot) => {
        if (!database || !document.getElementById('chat-messages')) return;
        const messagesDiv = document.getElementById('chat-messages');
        messagesDiv.innerHTML = '';
        const messages = snapshot.val();
        if (messages) {
            const messageKeys = Object.keys(messages).sort((a, b) => parseInt(b.split('-')[1]) - parseInt(a.split('-')[1]));
            messageKeys.forEach((key) => addMessageToDOM(key, messages[key]));
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        updatePinnedMessages();
    }, { onlyOnce: false });
}

// Edit message
function editMessage(key) {
    if (!database || !messagesRef) return;
    const messageDiv = document.getElementById(key);
    if (!messageDiv) return;
    const currentText = messageDiv.querySelector('.message-text').textContent.replace(' (edited)', '');
    const newText = prompt('Edit message:', currentText);
    if (newText && validateText(newText.replace(/<[^>]+>/g, '')) && confirm('Edit this message?')) {
        try {
            update(ref(database, `messages/${key}`), {
                text: sanitizeHtml(newText),
                timestamp: Date.now(),
                edited: true
            });
        } catch (error) {
            console.error('Error editing message:', error);
            selfHeal('editMessage', error);
            alert('Failed to edit message.');
        }
    }
}

// Delete message
function deleteMessage(key) {
    if (!database || !messagesRef || !confirm('Delete this message?')) return;
    try {
        remove(ref(database, `messages/${key}`));
        const messageDiv = document.getElementById(key);
        if (messageDiv) messageDiv.remove();
    } catch (error) {
        console.error('Error deleting message:', error);
        selfHeal('deleteMessage', error);
        alert('Failed to delete message.');
    }
}

// Pin/Unpin message
function pinMessage(key) {
    if (!database || !messagesRef) return;
    try {
        update(ref(database, `messages/${key}`), { pinned: true });
    } catch (error) {
        console.error('Error pinning message:', error);
        selfHeal('pinMessage', error);
        alert('Failed to pin message.');
    }
}
function unpinMessage(key) {
    if (!database || !messagesRef) return;
    try {
        update(ref(database, `messages/${key}`), { pinned: false });
    } catch (error) {
        console.error('Error unpinning message:', error);
        selfHeal('unpinMessage', error);
        alert('Failed to unpin message.');
    }
}

// Reply to message
function replyToMessage(key, text) {
    const input = document.getElementById('message-input');
    if (input) {
        input.dataset.replyTo = key;
        input.dataset.replyText = text;
        input.placeholder = `Replying to: ${sanitizeHtml(text).substring(0, 20)}...`;
        input.focus();
    }
}

// Toggle reaction
function toggleReaction(key, type) {
    if (!database || !messagesRef) return;
    try {
        onValue(ref(database, `messages/${key}`), (snapshot) => {
            const msg = snapshot.val();
            const reactions = msg.reactions || { check: 0, cross: 0 };
            const userReactions = JSON.parse(localStorage.getItem(`reactions_${key}`) || '{}');
            if (userReactions[type]) {
                reactions[type] = Math.max((reactions[type] || 0) - 1, 0);
                delete userReactions[type];
            } else {
                reactions[type] = (reactions[type] || 0) + 1;
                userReactions[type] = true;
            }
            localStorage.setItem(`reactions_${key}`, JSON.stringify(userReactions));
            update(ref(database, `messages/${key}`), { reactions });
        }, { onlyOnce: true });
    } catch (error) {
        console.error('Error toggling reaction:', error);
        selfHeal('toggleReaction', error);
        alert('Failed to toggle reaction.');
    }
}

// Search messages with auto-clear
function toggleSearch() {
    if (!database || !messagesRef) return;
    const searchTerm = prompt('Enter search:');
    if (searchTerm && validateText(searchTerm.replace(/<[^>]+>/g, ''))) {
        try {
            const searchQuery = query(messagesRef, orderByChild('text'));
            onValue(searchQuery, (snapshot) => {
                const messagesDiv = document.getElementById('chat-messages');
                if (messagesDiv) {
                    messagesDiv.innerHTML = '';
                    snapshot.forEach(childSnapshot => {
                        const msg = childSnapshot.val();
                        if (msg.text.toLowerCase().includes(searchTerm.toLowerCase())) {
                            addMessageToDOM(childSnapshot.key, { ...msg, searchTerm }, true, true);
                        }
                    });
                }
            }, { onlyOnce: true });
            // Auto-clear after 5 seconds
            setTimeout(() => loadMessages(), 5000);
        } catch (error) {
            console.error('Error searching messages:', error);
            selfHeal('toggleSearch', error);
            alert('Failed to search messages.');
        }
    }
}

// Clear chat and all data
function clearChat() {
    if (!database || !messagesRef || !confirm('Clear all messages and user data?')) return;
    try {
        remove(messagesRef);
        remove(usersRef);
        const messagesDiv = document.getElementById('chat-messages');
        const pinnedMessagesDiv = document.getElementById('pinned-messages');
        if (messagesDiv) messagesDiv.innerHTML = '';
        if (pinnedMessagesDiv) pinnedMessagesDiv.innerHTML = '';
        localStorage.clear(); // Reset local state
        document.cookie = 'userIdentity=; Max-Age=0'; // Clear cookie
        location.reload();
    } catch (error) {
        console.error('Error clearing chat:', error);
        selfHeal('clearChat', error);
        alert('Failed to clear chat.');
    }
}

// Automated cleanup
function optimizeDatabase() {
    if (!database || !messagesRef || !usersRef) return;
    try {
        // Clean old messages
        const retentionThreshold = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
        const cleanupQuery = query(messagesRef, orderByChild('timestamp'), endAt(retentionThreshold));
        onValue(cleanupQuery, (snapshot) => {
            snapshot.forEach(childSnapshot => remove(childSnapshot.ref));
        }, { onlyOnce: true });

        // Clean inactive users (30 days inactivity)
        const inactiveThreshold = Date.now() - (30 * 24 * 60 * 60 * 1000);
        onValue(usersRef, (snapshot) => {
            snapshot.forEach(childSnapshot => {
                const user = childSnapshot.val();
                if (user.lastActive < inactiveThreshold) remove(childSnapshot.ref);
            });
        }, { onlyOnce: true });
    } catch (error) {
        console.error('Error optimizing database:', error);
        selfHeal('optimizeDatabase', error);
    }
    setInterval(optimizeDatabase, 24 * 60 * 60 * 1000); // Run daily
}

// Online status with device info
function updateOnlineStatus() {
    if (!database || !usersRef) return;
    try {
        const safeUserId = userIdentity.replace(/[#$.\[\]]/g, '_');
        const deviceInfo = {
            platform: navigator.platform,
            userAgent: navigator.userAgent.substring(0, 50)
        };
        set(ref(database, `users/${safeUserId}`), {
            lastActive: Date.now(),
            online: true,
            nickname: nickname,
            color: userColor,
            deviceInfo: deviceInfo,
            hasSentMessage: true
        });
        onValue(usersRef, (snapshot) => {
            const users = snapshot.val();
            if (users) {
                const onlineUsers = Object.entries(users)
                    .filter(([_, user]) => user.online && user.hasSentMessage && (Date.now() - user.lastActive) < 60000)
                    .sort((a, b) => b[1].lastActive - a[1].lastActive);
                const onlineCount = onlineUsers.length;
                const lastThree = onlineUsers.slice(0, 3).map(([_, user]) => (user.nickname || user.id.split('_')[0].substring(0, 10)).substring(0, 10)).join(', ');
                const onlineStatusDiv = document.getElementById('online-status');
                if (onlineStatusDiv) onlineStatusDiv.textContent = `Online: ${onlineCount}${lastThree ? ` (${lastThree})` : ''}`;
            }
        });
    } catch (error) {
        console.error('Error updating online status:', error);
        selfHeal('updateOnlineStatus', error);
    }
}
setInterval(() => {
    if (!database || !usersRef) return;
    try {
        const safeUserId = userIdentity.replace(/[#$.\[\]]/g, '_');
        update(ref(database, `users/${safeUserId}`), { lastActive: Date.now() });
        updateOnlineStatus();
    } catch (error) {
        console.error('Error updating online status interval:', error);
        selfHeal('updateOnlineStatusInterval', error);
    }
}, 30000);

// Theme handling
function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    document.body.classList.toggle('dark-theme', theme === 'dark');
    localStorage.setItem('theme', theme);
}

function syncTheme() {
    document.body.classList.toggle('dark-theme', theme === 'dark');
}

// Settings with device adaptation
function openSettings() {
    if (!database) return;
    const newTitle = prompt('Enter new chat title:', document.getElementById('chat-title')?.textContent || 'Anon Chat');
    if (newTitle && validateText(newTitle.replace(/<[^>]+>/g, ''))) {
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) chatTitle.textContent = newTitle;
        localStorage.setItem('chat-title', newTitle);
    }
    const newNickname = prompt('Enter new nickname (3-20 characters, letters, numbers, underscores):', nickname);
    if (newNickname && validateNickname(newNickname)) {
        nickname = newNickname;
        localStorage.setItem('nickname', nickname);
        const safeUserId = userIdentity.replace(/[#$.\[\]]/g, '_');
        update(ref(database, `users/${safeUserId}`), { nickname });
    }
    const newColor = prompt('Enter new color (e.g., #FF6B6B):', userColor);
    if (newColor && /^#([0-9A-F]{3}){1,2}$/i.test(newColor)) {
        userColor = newColor;
        const newIdentity = `${userIdentity.split('_')[0]}_${newColor.replace('#', '')}`;
        setCookie('userIdentity', newIdentity, 365);
        userIdentity = newIdentity;
        location.reload();
    }
    // Adapt UI based on device
    if (navigator.userAgent.includes('Mobile') || navigator.userAgent.includes('Ang')) {
        document.body.classList.add('mobile-view');
    } else {
        document.body.classList.remove('mobile-view');
    }
}

// Autonomous self-healing and optimization
function selfHeal(functionName, error) {
    console.log(`Self-healing triggered for ${functionName}: ${error.message}`);
    // Log error to local storage for analysis
    const errorLog = localStorage.getItem('errorLog') || '[]';
    localStorage.setItem('errorLog', JSON.stringify([...JSON.parse(errorLog), { timestamp: Date.now(), function: functionName, error: error.message }]));
    // Retry critical operations
    if (functionName === 'sendMessage' || functionName === 'loadMessages') {
        setTimeout(() => {
            if (functionName === 'sendMessage') sendMessage();
            if (functionName === 'loadMessages') loadMessages();
        }, 5000);
    }
    // Update security rules dynamically if needed
    optimizeSecurityRules();
}

function optimizeSecurityRules() {
    // Simulate dynamic rule update (requires Firebase admin SDK in production)
    const securityRules = {
        rules: {
            messages: {
                ".read": "auth != null",
                ".write": "auth != null",
                "$messageId": {
                    ".validate": "newData.hasChildren(['author', 'text', 'timestamp', 'color']) && newData.child('author').val().length <= 50 && newData.child('text').val().length <= 1000 && newData.child('text').val().matches(/^[a-zA-Z0-9\\s.,!?]+$/i) && !newData.child('text').val().contains('127.0.0.1') && !newData.child('text').val().contains('local')"
                }
            },
            users: {
                ".read": "auth != null",
                ".write": "auth != null",
                "$userId": {
                    ".validate": "newData.hasChildren(['lastActive', 'online']) && (!newData.hasChild('nickname') || newData.child('nickname').val().matches(/^[a-zA-Z0-9_]{3,20}$/))"
                }
            }
        }
    };
    // In production, use Firebase Admin SDK to push rules
    console.log('Proposed security rules:', securityRules);
}

// Initialize system
syncTheme();
updateOnlineStatus();
optimizeDatabase();
