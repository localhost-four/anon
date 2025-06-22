import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, set, push, onValue, remove, update, query, orderByKey, limitToLast, orderByChild, startAt, endAt } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';

// Настройки Firebase
const firebaseConfig = {
	apiKey: window.REACT_APP_API_KEY,
	authDomain: window.REACT_APP_AUTH_DOMAIN,
    databaseURL: window.REACT_APP_URL,
	projectId: window.REACT_APP_PROJECT_ID,
	storageBucket: window.REACT_APP_STORAGE_BUCKET,
	messagingSenderId: window.REACT_APP_MESSAGING_SENDER_ID,
	appId: window.REACT_APP_APP_ID,
};

// Initialize Firebase
let app, database;
try {
    app = initializeApp(firebaseConfig);
    database = getDatabase(app);
} catch (error) {
    console.error('Firebase initialization error:', error);
    alert('Failed to connect to server. Please check configuration.');
}

// Database references
const messagesRef = database ? ref(database, 'messages') : null;
const usersRef = database ? ref(database, 'users') : null;

// Agent identification
let agentId = getCookie('agentId') || generateAgentId();
let nickname = localStorage.getItem('nickname') || agentId.split('_')[1];
document.cookie = `agentId=${agentId}; max-age=86400; SameSite=Strict; Secure`;

// Utility functions
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    return parts.length === 2 ? parts.pop().split(';').shift() : null;
}

function generateAgentId() {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEEAD', '#D4A5A5', '#9B59B6', '#3498DB'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];
    return `agent_${Math.random().toString(36).substr(2, 9)}_${randomColor}`;
}

function escapeHtml(unsafe) {
    return unsafe.replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[match]));
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
    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (new Date(today.setDate(today.getDate() - 1)).toDateString() === date.toDateString()) {
        return 'Yesterday';
    }
    return date.toLocaleDateString();
}

// Message rendering
function addMessageToDOM(key, msg, prepend = false, isSearchResult = false) {
    if (!document.getElementById('chat-messages') || !database) return;
    const messagesDiv = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.id = key;
    messageDiv.className = `message ${msg.pinned ? 'pinned' : ''} ${msg.replyTo ? 'reply' : ''}`;
    messageDiv.style.borderLeft = `4px solid ${msg.author.split('_')[2]}`;

    // Add date separator only for the first message of the day
    if (!prepend && !isSearchResult) {
        const messages = messagesDiv.children;
        let lastDate = null;
        if (messages.length > 0) {
            const lastMessage = Array.from(messages).find(el => el.classList.contains('message'));
            if (lastMessage) {
                const lastTimestamp = parseInt(lastMessage.id.split('-')[1] || 0);
                lastDate = formatDate(lastTimestamp);
            }
        }
        if (formatDate(msg.timestamp) !== lastDate) {
            const separator = document.createElement('div');
            separator.className = 'date-separator';
            separator.textContent = formatDate(msg.timestamp);
            messagesDiv.appendChild(separator);
        }
    }

    let replyHtml = '';
    if (msg.replyTo) {
        replyHtml = `<div class="reply-preview" data-reply-id="${msg.replyTo}">Replying to: ${escapeHtml(msg.replyText || 'Message')}</div>`;
    }

    const reactions = msg.reactions || { check: 0, cross: 0 };
    const reactionsHtml = `
    <div class="reactions">
      <button class="reaction-btn check-btn" data-key="${key}" data-type="check">✅ ${reactions.check || 0}</button>
      <button class="reaction-btn cross-btn" data-key="${key}" data-type="cross">❌ ${reactions.cross || 0}</button>
    </div>
  `;

    const textToDisplay = isSearchResult && msg.searchTerm
        ? msg.text.replace(new RegExp(`(${msg.searchTerm})`, 'gi'), '<span class="highlight">$1</span>')
        : escapeHtml(msg.text);

    messageDiv.innerHTML = `
    <div class="message-sender" style="color: ${msg.author.split('_')[2]}">${escapeHtml(msg.nickname || msg.author.split('_')[1])}</div>
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

    // Add event listeners
    messageDiv.querySelector('.edit-btn').addEventListener('click', () => editMessage(key));
    messageDiv.querySelector('.delete-btn').addEventListener('click', () => deleteMessage(key));
    messageDiv.querySelector('.pin-btn').addEventListener('click', () => msg.pinned ? unpinMessage(key) : pinMessage(key));
    messageDiv.querySelector('.reply-btn').addEventListener('click', () => replyToMessage(key, msg.text));
    messageDiv.querySelectorAll('.reaction-btn').forEach(btn => btn.addEventListener('click', (e) => toggleReaction(key, e.target.dataset.type)));
    if (msg.replyTo) {
        messageDiv.querySelector('.reply-preview').addEventListener('click', () => scrollToMessage(msg.replyTo));
    }

    if (prepend) {
        messagesDiv.prepend(messageDiv);
    } else {
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
            const shortText = msg.text.length > 50 ? `${escapeHtml(msg.text.substring(0, 50))}...` : escapeHtml(msg.text);
            pinnedMessageDiv.innerHTML = `<span style="color: ${msg.author.split('_')[2]}">${escapeHtml(msg.nickname || msg.author.split('_')[1])}: ${shortText}</span>`;
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
                    if (!document.getElementById(key)) {
                        addMessageToDOM(key, messages[key], true);
                    }
                });
                lastMessageKey = messageKeys[0];
            }
            isLoading = false;
        }, { onlyOnce: true });
    } catch (error) {
        console.error('Error loading messages:', error);
        isLoading = false;
    }
}

// Scroll handler for pagination
function handleScroll() {
    const messagesDiv = document.getElementById('chat-messages');
    if (messagesDiv && messagesDiv.scrollTop === 0 && !isLoading) {
        loadMessages();
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    if (!database) return;
    const sendButton = document.getElementById('send-btn');
    const inputField = document.getElementById('message-input');
    const searchButton = document.getElementById('search-btn');
    const clearSearchButton = document.getElementById('clear-search-btn');
    const settingsButton = document.getElementById('settings-btn');
    const clearButton = document.getElementById('clear-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const messagesDiv = document.getElementById('chat-messages');

    if (sendButton) sendButton.addEventListener('click', sendMessage);
    if (inputField) inputField.addEventListener('keypress', (e) => e.key === 'Enter' && sendMessage());
    if (searchButton) searchButton.addEventListener('click', toggleSearch);
    if (clearSearchButton) clearSearchButton.addEventListener('click', () => {
        if (messagesRef) loadMessages();
    });
    if (settingsButton) settingsButton.addEventListener('click', openSettings);
    if (clearButton) clearButton.addEventListener('click', clearChat);
    if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
    if (messagesDiv) messagesDiv.addEventListener('scroll', handleScroll);

    loadMessages();
    updatePinnedMessages();
    syncTheme();
    updateOnlineStatus();
});

// Send message
function sendMessage() {
    if (!database || !messagesRef) return;
    const input = document.getElementById('message-input');
    if (!input) return;
    const text = input.value.trim();
    const replyTo = input.dataset.replyTo || null;
    const replyText = input.dataset.replyText || null;
    if (validateText(text)) {
        try {
            const newMessageRef = push(messagesRef);
            set(newMessageRef, {
                author: agentId,
                nickname: nickname,
                text: text,
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
            alert('Failed to send message.');
        }
    } else {
        alert('Invalid message. Use only letters, numbers, spaces, and basic punctuation.');
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
            const messageKeys = Object.keys(messages).sort();
            messageKeys.forEach((key) => {
                addMessageToDOM(key, messages[key]);
            });
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
    if (newText && validateText(newText) && confirm('Edit this message?')) {
        try {
            update(ref(database, `messages/${key}`), {
                text: newText,
                timestamp: Date.now(),
                edited: true
            });
        } catch (error) {
            console.error('Error editing message:', error);
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
        alert('Failed to delete message.');
    }
}

// Pin message
function pinMessage(key) {
    if (!database || !messagesRef) return;
    try {
        update(ref(database, `messages/${key}`), { pinned: true });
    } catch (error) {
        console.error('Error pinning message:', error);
        alert('Failed to pin message.');
    }
}

// Unpin message
function unpinMessage(key) {
    if (!database || !messagesRef) return;
    try {
        update(ref(database, `messages/${key}`), { pinned: false });
    } catch (error) {
        console.error('Error unpinning message:', error);
        alert('Failed to unpin message.');
    }
}

// Reply to message
function replyToMessage(key, text) {
    const input = document.getElementById('message-input');
    if (input) {
        input.dataset.replyTo = key;
        input.dataset.replyText = text;
        input.placeholder = `Replying to: ${text.substring(0, 20)}...`;
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
        alert('Failed to toggle reaction.');
    }
}

// Search messages
function toggleSearch() {
    if (!database || !messagesRef) return;
    const searchTerm = prompt('Enter search term:');
    if (searchTerm && validateText(searchTerm)) {
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
                const clearSearchButton = document.getElementById('clear-search-btn');
                if (clearSearchButton) clearSearchButton.style.display = 'inline-block';
            }, { onlyOnce: true });
        } catch (error) {
            console.error('Error searching messages:', error);
            alert('Failed to search messages.');
        }
    }
}

// Clear chat
function clearChat() {
    if (!database || !messagesRef || !confirm('Clear all messages?')) return;
    try {
        remove(messagesRef);
        const messagesDiv = document.getElementById('chat-messages');
        const pinnedMessagesDiv = document.getElementById('pinned-messages');
        if (messagesDiv) messagesDiv.innerHTML = '';
        if (pinnedMessagesDiv) pinnedMessagesDiv.innerHTML = '';
    } catch (error) {
        console.error('Error clearing chat:', error);
        alert('Failed to clear chat.');
    }
}

// Weekly cleanup
setInterval(() => {
    if (!database || !messagesRef) return;
    try {
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const cleanupQuery = query(messagesRef, orderByChild('timestamp'), endAt(oneWeekAgo));
        onValue(cleanupQuery, (snapshot) => {
            snapshot.forEach(childSnapshot => {
                remove(childSnapshot.ref);
            });
        }, { onlyOnce: true });
    } catch (error) {
        console.error('Error cleaning old messages:', error);
    }
}, 24 * 60 * 60 * 1000);

// Online status
function updateOnlineStatus() {
    if (!database || !usersRef) return;
    try {
        // Заменяем # на _ в agentId для создания валидного пути
        const safeAgentId = agentId.replace('#', '_');
        set(ref(database, `users/${safeAgentId}`), {
            lastActive: Date.now(),
            online: true,
            nickname: nickname,
            hasSentMessage: true
        });
        onValue(usersRef, (snapshot) => {
            const users = snapshot.val();
            if (users) {
                const onlineUsers = Object.entries(users)
                    .filter(([_, user]) => user.online && user.hasSentMessage && (Date.now() - user.lastActive) < 60000)
                    .sort((a, b) => b[1].lastActive - a[1].lastActive);
                const onlineCount = onlineUsers.length;
                const lastThree = onlineUsers
                    .slice(0, 3)
                    .map(([_, user]) => (user.nickname || user.id?.split('_')[1] || 'User').substring(0, 10))
                    .join(', ');
                const onlineStatusDiv = document.getElementById('online-status');
                if (onlineStatusDiv) {
                    onlineStatusDiv.textContent = `Online: ${onlineCount}${lastThree ? ` (${lastThree})` : ''}`;
                }
            }
        });
    } catch (error) {
        console.error('Error updating online status:', error);
    }
}

setInterval(() => {
    if (!database || !usersRef) return;
    try {
        update(ref(database, `users/${agentId}`), { lastActive: Date.now() });
        updateOnlineStatus();
    } catch (error) {
        console.error('Error updating online status interval:', error);
    }
}, 30000);

// Theme handling
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    localStorage.setItem('theme', document.body.classList.contains('dark-theme') ? 'dark' : 'light');
}

function syncTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') document.body.classList.add('dark-theme');
}

// Settings
function openSettings() {
    if (!database) return;
    const newTitle = prompt('Enter new chat title:', document.getElementById('chat-title').textContent);
    if (newTitle && validateText(newTitle)) {
        const chatTitle = document.getElementById('chat-title');
        if (chatTitle) chatTitle.textContent = newTitle;
        localStorage.setItem('chat-title', newTitle);
    }
    const newNickname = prompt('Enter new nickname (3-20 characters, letters, numbers, underscores):', nickname);
    if (newNickname && validateNickname(newNickname)) {
        nickname = newNickname;
        localStorage.setItem('nickname', newNickname);
        update(ref(database, `users/${agentId}`), { nickname: newNickname });
    }
    const newColor = prompt('Enter new color (e.g., #FF6B6B):', agentId.split('_')[2]);
    if (newColor && /^#([0-9A-F]{3}){1,2}$/i.test(newColor)) {
        const newAgentId = `agent_${agentId.split('_')[1]}_${newColor}`;
        document.cookie = `agentId=${newAgentId}; max-age=86400; SameSite=Strict; Secure`;
        agentId = newAgentId;
        location.reload();
    }
}
