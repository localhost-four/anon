import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, set, push, onValue, remove, update, query, orderByKey, limitToLast, orderByChild, startAt, endAt } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@4.0.12/lib/marked.esm.js';

// ---
function showLinkWarning(url, callback) {
    if (document.querySelector('.link-warning-modal')) { return; }
    document.querySelectorAll('.link-warning-modal').forEach(modal => modal.remove());
    const modal = document.createElement('div');
    modal.className = 'link-warning-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Follow the link?</h3>
            <p>You are about to follow ${url.startsWith(window.location.origin) ? 'an internal' : 'an external'} via a link:</p> 
            <a href="${url}" target="_blank">${url}</a>
            <p>${url.startsWith(window.location.origin) ? 'This may be a link to a message!' : 'Make sure this is a safe resource!'}</p>
            <button id="confirm-link">Go</button>
            <button id="cancel-link">Cancel</button>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('confirm-link').addEventListener('click', () => {
        selfHeal('showLinkWarning', new Error(`Link confirmed: ${url}`));
        callback();
        modal.remove();
    });
    document.getElementById('cancel-link').addEventListener('click', () => {
        selfHeal('showLinkWarning', new Error(`Link cancelled: ${url}`));
        modal.remove();
        location.reload();
    });
}

function interceptLinkClicks() {
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && link.href) {
            e.preventDefault();
            // Логируем попытку перехода
            selfHeal('interceptLinkClicks', new Error(`Link clicked: ${link.href}`));
            // Проверяем валидность URL
            try {
                new URL(link.href, window.location.href);
                showLinkWarning(link.href, () => {
                    // Логируем успешное подтверждение
                    selfHeal('interceptLinkClicks', new Error(`Link confirmed: ${link.href}`));
                    window.open(link.href, '_blank');
                }, () => {
                    // Логируем отмену
                    selfHeal('interceptLinkClicks', new Error(`Link cancelled: ${link.href}`));
                });
            } catch (error) {
                console.error('Invalid URL:', link.href, error);
                selfHeal('interceptLinkClicks', error);
                alert('Invalid link URL.');
            }
        }
    });

    // Отслеживаем динамически добавленные ссылки
    const messagesDiv = document.getElementById('chat-messages');
    if (messagesDiv) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        node.querySelectorAll('a').forEach(link => {
                            link.addEventListener('click', (e) => {
                                e.preventDefault();
                                if (link.href) {
                                    selfHeal('interceptLinkClicks', new Error(`Dynamic link clicked: ${link.href}`));
                                    try {
                                        new URL(link.href, window.location.href);
                                        showLinkWarning(link.href, () => {
                                            selfHeal('interceptLinkClicks', new Error(`Dynamic link confirmed: ${link.href}`));
                                            window.open(link.href, '_blank');
                                        }, () => {
                                            selfHeal('interceptLinkClicks', new Error(`Dynamic link cancelled: ${link.href}`));
                                        });
                                    } catch (error) {
                                        console.error('Invalid dynamic URL:', link.href, error);
                                        selfHeal('interceptLinkClicks', error);
                                        alert('Invalid link URL.');
                                    }
                                }
                            });
                        });
                    }
                });
            });
        });
        observer.observe(messagesDiv, { childList: true, subtree: true });
    }
}

// -------------------------------

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

// -------------------------------

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
    div.innerHTML = html;

    const allowedTags = new Set(['p', 'b', 'i', 'u', 'em', 'strong', 'span', 'div', 'br', 'pre', 'code', 'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'table', 'tr', 'td', 'th']);
    const safeAttributes = new Set(['href', 'src', 'alt', 'title', 'class', 'style', 'data-type', 'loading']);
    const cssWhitelist = new Set(['color', 'background-color', 'font-size', 'font-weight', 'text-align', 'margin', 'padding', 'width', 'height', 'max-width', 'max-height', 'opacity', 'display', 'box-shadow']);
    const blockedEventAttributes = new Set(['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur']);

    // Кэш для проверенных URL
    const urlCache = JSON.parse(localStorage.getItem('urlCache') || '{}');

    // Удаляем опасные теги
    div.querySelectorAll('script, iframe, object, embed, link, meta').forEach(el => {
        console.log(`Removed unsafe tag: ${el.tagName}`);
        selfHeal('sanitizeHtml', new Error(`Removed unsafe tag: ${el.tagName}`));
        el.remove();
    });

    div.querySelectorAll('*').forEach(node => {
        const tagName = node.tagName.toLowerCase();
        if (!allowedTags.has(tagName)) {
            console.log(`Removed unsafe tag: ${tagName}`);
            selfHeal('sanitizeHtml', new Error(`Removed unsafe tag: ${tagName}`));
            node.replaceWith(document.createTextNode(node.textContent));
            return;
        }

        Array.from(node.attributes).forEach(attr => {
            const attrName = attr.name.toLowerCase();
            let shouldRemove = true;

            if (safeAttributes.has(attrName) || attrName.startsWith('data-')) {
                shouldRemove = false;
                if (blockedEventAttributes.has(attrName)) {
                    console.log(`Removed unsafe attribute: ${attrName}`);
                    selfHeal('sanitizeHtml', new Error(`Removed unsafe attribute: ${attrName}`));
                    shouldRemove = true;
                } else if (attrName === 'src' || attrName === 'href') {
                    if (!isSafeUrl(attr.value)) shouldRemove = true;
                } else if (attrName === 'style' && !validateStyles(attr.value)) {
                    shouldRemove = true;
                } else if (attrName === 'loading' && attr.value !== 'lazy' && attr.value !== 'eager') {
                    shouldRemove = true;
                } else if ((attrName === 'src' || attrName === 'href') && attr.value.length > 200) {
                    shouldRemove = true; // Ограничение длины атрибутов
                }
            }

            if (shouldRemove) node.removeAttribute(attr.name);
        });

        if (tagName === 'img') {
            const src = node.getAttribute('src');
            if (!src || !isSafeUrl(src)) {
                console.log(`Removed invalid image: ${src || 'no src'}`);
                selfHeal('sanitizeHtml', new Error(`Removed invalid image: ${src || 'no src'}`));
                node.remove();
            } else {
                if (!node.hasAttribute('alt')) node.setAttribute('alt', 'Image');
                if (!node.hasAttribute('loading')) node.setAttribute('loading', 'lazy');
                node.style.maxWidth = '100%';
                node.style.maxHeight = '300px';
                node.style.borderRadius = '8px';
                node.style.objectFit = 'contain';
            }
        }

        if (tagName === 'div' && node.getAttribute('data-type') === 'content-block') {
            if (!isSafeContentBlock(node)) {
                console.log('Removed unsafe content block');
                selfHeal('sanitizeHtml', new Error('Removed unsafe content block'));
                node.replaceWith(document.createTextNode(node.textContent));
            }
        }

        if (node.style) {
            const blockedProps = ['position', 'z-index', 'transform'];
            blockedProps.forEach(prop => node.style.removeProperty(prop));
        }
    });

    async function isSafeUrl(url) {
        try {
            // Проверяем кэш
            if (urlCache[url]) return urlCache[url];

            const parsed = new URL(url, window.location.href);
            if (!['https:', 'http:'].includes(parsed.protocol) || /^(javascript:|data:)/i.test(url)) {
                return false;
            }
            const response = await fetch(url, { method: 'HEAD' });
            const contentType = response.headers.get('content-type') || '';
            const isValid = contentType.startsWith('image/') && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(parsed.pathname);
            // Сохраняем в кэш
            urlCache[url] = isValid;
            localStorage.setItem('urlCache', JSON.stringify(urlCache));
            return isValid;
        } catch (error) {
            console.error(`Error checking URL ${url}:`, error);
            selfHeal('isSafeUrl', error);
            return false;
        }
    }

    function validateStyles(styles) {
        return styles.split(';').every(declaration => {
            const [prop, value] = declaration.split(':').map(s => s.trim());
            return prop && value && cssWhitelist.has(prop.toLowerCase()) &&
                !/expression|url\(|import|@import|javascript:/i.test(value);
        });
    }

    function isSafeContentBlock(node) {
        const allowedContentTags = new Set(['p', 'img', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'br', 'span', 'b', 'i', 'u', 'em', 'strong']);
        return Array.from(node.children).every(child => allowedContentTags.has(child.tagName.toLowerCase()));
    }

    return div.innerHTML;
}

async function validateText(text) {
    const blocked = ['script', 'eval', 'fetch', 'xmlhttp', 'document', 'window'];
    try {
        const sanitized = await sanitizeHtml(text);
        return text &&
            text.length <= 500 &&
            !blocked.some(word => text.toLowerCase().includes(word)) &&
            sanitized.length > 1; 
    } catch (error) {
        console.error('Error validating text:', error);
        selfHeal('validateText', error);
        return false;
    }
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
    messageDiv.style.minWidth = 'fit-content';
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

    const reactions = msg.reactions || { like: 0, check: 0, cross: 0 };
    const reactionsHtml = `
        <div class="reactions">
            <button class="reaction-btn like-btn" data-key="${key}" data-type="like">💕 ${reactions.like || 0}</button>
            <button class="reaction-btn check-btn" data-key="${key}" data-type="check">+ ${reactions.check || 0}</button>
            <button class="reaction-btn cross-btn" data-key="${key}" data-type="cross">- ${reactions.cross || 0}</button>
        </div>
    `;

    let textToDisplay;
    try {
        // Сначала рендерим Markdown, потом санитизируем
        const markdownRendered = renderMarkdown(msg.text);
        textToDisplay = isSearchResult && msg.searchTerm
            ? sanitizeHtml(markdownRendered).replace(new RegExp(`(${msg.searchTerm})`, 'gi'), '<span class="highlight">$1</span>')
            : `<div data-type="content-block">${sanitizeHtml(markdownRendered)}</div>`;
    } catch (error) {
        console.error('Error rendering message:', error);
        selfHeal('addMessageToDOM', error);
        textToDisplay = `<div data-type="content-block">${sanitizeHtml(msg.text)}</div>`;
    }

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
            <button class="message-action-btn share-btn" data-key="${key}">Share</button>
        </div>
    `;

    messageDiv.querySelector('.share-btn').addEventListener('click', () => shareMessage(msg.text, key));
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

    const lastMessages = document.querySelectorAll('.message');
    if (lastMessages.length > 0) {
        lastMessages[lastMessages.length - 1].scrollIntoView({ behavior: 'smooth' });
    }

    messageDiv.querySelectorAll('img[loading="lazy"]').forEach(img => {
        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    img.src = img.dataset.src || img.src;
                    img.classList.add('loaded');
                    observer.unobserve(img);
                }
            });
        });
        observer.observe(img);
    });
}

function shareMessage(text, key) {
    if (navigator.share) {
        navigator.share({
            title: 'Shared Message from Anon Chat',
            text: text.replace(/<[^>]+>/g, ''),
            url: `${window.location.origin}/#message-${key}`
        }).catch(err => console.error('Error sharing message:', err));
    } else {
        alert('Sharing is not supported in this browser.');
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

const rateLimit = {
    lastRequest: 0,
    requests: 0,
    check: function () {
        const now = Date.now();
        if (now - this.lastRequest > 60000) {
            this.requests = 0;
            this.lastRequest = now;
        }
        if (++this.requests > 30) {
            alert('Too many requests. Please wait.');
            return false;
        }
        return true;
    }
};

function renderMarkdown(text) {
    try {
        // Пропускаем Markdown, если есть HTML-теги
        if (/<[a-z][\s\S]*>/i.test(text)) {
            return text; // Возвращаем текст как есть для санитизации
        }
        const rendered = marked(text, {
            gfm: true,
            breaks: true,
            sanitize: false // Используем sanitizeHtml для фильтрации
        });
        return rendered;
    } catch (error) {
        console.error('Error rendering Markdown:', error);
        selfHeal('renderMarkdown', error);
        return text; // Возвращаем исходный текст при ошибке
    }
}

// Send message with HTML/MD support
function sendMessage() {
    if (!rateLimit.check()) return;
    if (!database || !messagesRef) return;
    const input = document.getElementById('message-input');
    if (!input) return;
    let text = input.value.trim();
    const replyTo = input.dataset.replyTo || null;
    const replyText = input.dataset.replyText || null;
    if (validateText(text.replace(/<[^>]+>/g, '')) && text.length >= 2) {
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
                reactions: { like: 0, check: 0, cross: 0 },
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

                onlineUsers.forEach(([id, user]) => {
                    try {
                        const nickname = user.nickname || id.split('_')[0];
                        document.querySelectorAll(`.message-sender:contains("${nickname}")`).forEach(el => {
                            el.classList.add('online-user');
                            el.title = 'Online now';
                        });
                    } catch { null; }
                });

                if (onlineCount > 1) {
                    setTimeout(() => {
                        remove(usersRef).catch(e => console.log('Cleanup skipped:', e));
                    }, 5000); // Задержка для следующего обновления статуса
                } else {
                    try {
                        Object.entries(users).forEach(([id, user]) => {
                            if (Date.now() - user.lastActive > 30 * 60 * 1000) {
                                remove(ref(database, `users/${id}`));
                            }
                        });
                    } catch { null; }
                }
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

document.getElementById('chat-title').textContent = localStorage.getItem('chat-title') || 'Anon Chat';

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

function addCharCounter() {
    const input = document.getElementById('message-input');
    const counter = document.createElement('div');
    counter.id = 'char-counter';
    counter.className = 'char-counter';
    input.parentNode.insertBefore(counter, input.nextSibling);
    updateCharCounter(input);

    input.addEventListener('input', () => updateCharCounter(input));
    input.addEventListener('keyup', () => updateCharCounter(input));
}

function updateCharCounter(input) {
    const maxLength = 500;
    // Учитываем полный текст, включая теги
    let currentLength = input.value.length;
    const counter = document.getElementById('char-counter');
    if (counter) {
        // Проверяем наличие HTML-тегов
        const hasHtml = /<[a-z][\s\S]*>/i.test(input.value);
        counter.textContent = `${currentLength}/${maxLength}${hasHtml ? ' (HTML)' : ''}`;
        counter.className = 'char-counter';
        if (currentLength > maxLength * 0.8) counter.classList.add('warning');
        if (currentLength > maxLength * 0.95) counter.classList.add('error');
        if (currentLength === 0) counter.classList.add('empty');
        if (currentLength > maxLength) {
            input.value = input.value.slice(0, maxLength);
            counter.classList.add('pulse');
            setTimeout(() => counter.classList.remove('pulse'), 500);
        }
    }
}

// Initialize system
document.addEventListener("DOMContentLoaded", () => {
    syncTheme();
    addCharCounter();
    updateOnlineStatus();
    optimizeDatabase();
    setInterval(() => interceptLinkClicks(), 500);
});
