/**
 * UI Module: Handles DOM element interactions, UI updates, animations, and chat popup.
 */

// --- DOM Elements (exported for use in other modules) ---
export const assistant = document.getElementById('tutor-assistant');
export const startButton = document.getElementById('start-learn-btn');
export const readableParagraphs = document.querySelectorAll('.tutorial-paragraph');
export const waveSound = document.getElementById('assistant-sound'); // Sound for animation gestures
export const processingIndicator = document.getElementById('processing-status'); // Get status indicator

// Chat popup elements - initialized when popup is created
export let chatPopup = null;
export let chatLogDiv = null;
export let chatInput = null;
export let chatSendBtn = null;
export let chatVoiceBtn = null;
export let chatCloseBtn = null;
export let chatDownloadBtn = null;

// --- Status Indicator Control ---
export function showProcessingIndicator() {
    if (processingIndicator) {
        processingIndicator.classList.add('visible');
    }
}

export function hideProcessingIndicator() {
    if (processingIndicator) {
        processingIndicator.classList.remove('visible');
    }
}

// --- Assistant Visual State ---
export function setAssistantSpeaking(isSpeaking) {
    if (!assistant) return;
    if (isSpeaking) {
        assistant.classList.add('is-speaking');
        assistant.classList.remove('is-listening'); // Cannot listen while speaking
    } else {
        assistant.classList.remove('is-speaking');
    }
}

export function setAssistantListening(isListening) {
    if (!assistant) return;
    if (isListening) {
        assistant.classList.add('is-listening');
        assistant.classList.remove('is-speaking'); // Cannot speak while listening (usually)
    } else {
        assistant.classList.remove('is-listening');
    }
}

export function setAssistantSleeping(isSleeping) {
    if (!assistant) return;
    if (isSleeping) {
        assistant.classList.add('assistant-sleeping');
        assistant.classList.remove('is-speaking', 'is-listening');
    } else {
        assistant.classList.remove('assistant-sleeping');
    }
}

// --- Assistant Animations ---
function playSoundEffect() {
    if (waveSound) {
        try {
            waveSound.currentTime = 0; // Rewind to start
            waveSound.play().catch(err => console.error("Sound effect playback error:", err));
        } catch (err) {
            console.error("Error playing sound effect:", err);
        }
    }
}

export function triggerRandomAnimation() {
    if (!assistant) return;
    const animations = ['is-waving', 'is-bouncing', 'is-spinning'];
    // Remove any existing animation classes first
    animations.forEach(animClass => assistant.classList.remove(animClass));

    const randomClass = animations[Math.floor(Math.random() * animations.length)];
    console.log("Triggering random animation:", randomClass);
    assistant.classList.add(randomClass);
    playSoundEffect(); // Play sound with animation

    // Remove the class after the animation duration (adjust time if needed)
    setTimeout(() => {
        if (assistant) assistant.classList.remove(randomClass);
    }, 1000); // Match duration in CSS or slightly longer
}


// --- Chat Popup Modal ---
export function createChatPopup() {
    if (chatPopup) return; // Already created

    console.log("Creating chat popup...");
    chatPopup = document.createElement('div');
    chatPopup.id = "chat-popup";
    chatPopup.innerHTML = `
        <div class="chat-header">
            <span>Chat with Assistant</span>
            <div class="chat-header-btns">
                <button id="chat-download-btn" title="Download Log">💾</button>
                <button id="chat-close-btn" title="Close Chat">X</button>
            </div>
        </div>
        <div id="chat-log" class="chat-log">
            <!-- Chat messages will appear here -->
        </div>
        <div class="chat-footer">
            <button id="chat-voice-btn" class="voice-btn" title="Send Voice Message"></button> <!-- Microphone emoji -->
            <input type="text" id="chat-input" placeholder="Type your message..." />
            <button id="chat-send-btn" class="send-btn" title="Send Message">Send</button>
        </div>
    `;
    document.body.appendChild(chatPopup);

    // Get popup child elements after creation
    chatLogDiv = document.getElementById('chat-log');
    chatInput = document.getElementById('chat-input');
    chatSendBtn = document.getElementById('chat-send-btn');
    chatVoiceBtn = document.getElementById('chat-voice-btn');
    chatCloseBtn = document.getElementById('chat-close-btn');
    chatDownloadBtn = document.getElementById('chat-download-btn');

    console.log("Chat popup created.");
}

export function showChatPopup() {
    if (!chatPopup) {
        console.error("Cannot show chat popup, it has not been created.");
        return; // Or create it implicitly?
    }
    console.log("Showing chat popup.");
    chatPopup.style.display = 'flex'; // Use flex to manage layout
    if (chatInput) chatInput.focus();
}

export function hideChatPopup() {
    if (chatPopup) {
        console.log("Hiding chat popup.");
        chatPopup.style.display = 'none';
        // Ensure voice button state is reset if chat is hidden during recording
        setVoiceButtonRecording(false);
    }
}

/**
 * Appends a formatted message to the chat log UI.
 * @param {string} sender "User" or "Assistant".
 * @param {string} message The message text.
 */
export function appendChatMessageUI(sender, message) {
    if (!chatLogDiv) {
        console.error("Chat log div not found, cannot append message.");
        return;
    }
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message');
    // Add sender-specific class for styling
    messageDiv.classList.add(sender.toLowerCase()); // Add 'user' or 'assistant' class
    messageDiv.textContent = message;
    chatLogDiv.appendChild(messageDiv);

    // Auto-scroll to the bottom
    chatLogDiv.scrollTop = chatLogDiv.scrollHeight;
}

export function getChatInputMessage() {
    return chatInput ? chatInput.value.trim() : '';
}

export function clearChatInput() {
    if (chatInput) {
        chatInput.value = '';
    }
}

export function setVoiceButtonRecording(isRecording) {
    if (chatVoiceBtn) {
        if (isRecording) {
            chatVoiceBtn.classList.add('is-recording');
        } else {
            chatVoiceBtn.classList.remove('is-recording');
        }
    }
}

export function disableVoiceButton(disabled = true) {
     if(chatVoiceBtn) chatVoiceBtn.disabled = disabled;
}

// --- Paragraph Highlighting ---
export function highlightParagraph(paragraph, highlight = true) {
    if (paragraph) {
        if (highlight) {
            paragraph.classList.add('highlighted-paragraph');
        } else {
            paragraph.classList.remove('highlighted-paragraph');
        }
    }
}

// --- Assistant Drag and Drop ---
let isDragging = false;
let dragStartX, dragStartY, initialLeft, initialTop;

function onMouseMove(e) {
    if (!isDragging || !assistant) return;
    let dx = e.clientX - dragStartX;
    let dy = e.clientY - dragStartY;

    let newLeft = initialLeft + dx;
    let newTop = initialTop + dy;

    const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
    const assistantRect = assistant.getBoundingClientRect();

    newLeft = Math.max(0, Math.min(newLeft, vw - assistantRect.width));
    newTop = Math.max(0, Math.min(newTop, vh - assistantRect.height));

    assistant.style.left = newLeft + 'px';
    assistant.style.top = newTop + 'px';
}

function onMouseUp(e) {
    if (e.button !== 0 || !isDragging) return;
    isDragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    console.log("Assistant drag ended.");
}

export function enableAssistantDrag() {
    if (!assistant) return;

    assistant.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const styles = window.getComputedStyle(assistant);
        initialLeft = parseFloat(styles.left);
        initialTop = parseFloat(styles.top);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        console.log("Assistant drag started.");
    });

    // Prevent default browser drag behavior
    assistant.addEventListener('dragstart', (e) => e.preventDefault());
}

console.log("UI Module loaded.");
