![image](https://github.com/user-attachments/assets/af680ee0-a5d7-451e-b67a-f4f9dbf6c561) <br>
Welcome to Anon Chat! <br>
The new place for communication is open to everyone without registration, only on our CHAT page! (Web-Demo)<br> 
While it's a demo version, you can try to chat in it.<br>

# 🌐 Realtime Chat Web App

A lightweight, secure, and fully-featured real-time chat application built with Firebase Realtime Database and vanilla JavaScript. Designed for simplicity, privacy-first interaction, and cross-device synchronization.

---

## 📦 Project Overview

This is a client-side web-based chat system that allows users to:

- Send, edit, and delete messages
- Reply to messages
- Pin important messages
- React to messages with check/cross buttons
- Search through messages
- Change nickname, color theme, and chat title
- View online users
- Auto-clean old messages
- Use dark/light themes
- Store user identity via cookies
- Synchronize data across devices

All interactions are handled in real-time using Firebase, with security rules and input validation included.

---

## 📁 File Structure
/anon/ <br>
│ <br>
├── index.html # Main HTML file containing the chat UI layout <br>
├── style.css # CSS styles for chat interface (mobile & desktop) <br>
├── script.js # Core JavaScript logic and Firebase integration <br>
├── firebase-rules.json # Firebase Realtime Database security rules <br>
└── README.md # This file — project documentation <br>



---

## 🛠️ Technologies Used

- **Firebase Realtime Database** – For real-time message and presence sync
- **Vanilla JavaScript** – No frameworks, pure JS for performance and simplicity
- **HTML5 / CSS3** – Responsive UI design
- **Cookies + localStorage** – User persistence without login
- **Security Filters** – Input sanitization, XSS protection, and regex validation

---

## 🔒 Security Features

- All messages are sanitized before display
- Input validation (length, allowed characters)
- Cookie-based user identity (`agentId`) with expiry
- Firebase rules to restrict unauthorized access
- Prevention of injection attacks (XSS)
- Presence system with automatic timeout (60s)
- Message editing/deletion limited to original author

Example Firebase Rule:
```json
{
  "rules": {
    ".read": true,
    ".write": true,
    "messages": {
      "$messageId": {
        ".write": "$messageId === auth.uid || auth != null",
        ".read": true
      }
    },
    "users": {
      "$userId": {
        ".write": "$userId === auth.uid || auth != null",
        ".read": true
      }
    }
  }
}
```
<br>
# 1. 🚀 Deployment Instructions 
<br>
<code>git clone https://github.com/localhost-four/anon.git</code>
<br>
# 2. Replace Firebase config in script.js with your own credentials. 
<br>
# 3. Deploy to Firebase Hosting or any static hosting provider. 
<br>
