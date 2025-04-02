/**
 * Chat Module: Manages chat interactions, conversation log, and coordinates input/output.
 */
import {
    showProcessingIndicator,
    hideProcessingIndicator,
    appendChatMessageUI,
    getChatInputMessage,
    clearChatInput,
    setVoiceButtonRecording,
    disableVoiceButton,
    hideChatPopup, // Import hideChatPopup
    // Import references to the chat UI elements created in ui.js
    chatInput,
    chatSendBtn,
    chatVoiceBtn,
    chatCloseBtn,
    chatDownloadBtn
} from './ui.js';
import { sendTextToChat, sendAudioBlobToChat, fetchTtsAudio } from './api.js';
import { playAssistantSpeech, stopAssistantSpeech, isWebSpeechApiSupported, startBrowserListening, stopBrowserListening, isBrowserListeningActive, setBrowserSpeechCallbacks } from './speech.js';
import { isMediaRecorderSupported, startRecording, stopRecording, isRecordingActive, setRecorderCallbacks } from './recorder.js';

// --- State Variables ---
let conversationLog = []; // Stores { sender: string, message: string } objects
let isChatInitialized = false;

// --- Initialization ---

/**
 * Initializes the chat module, setting up callbacks for speech/recorder and attaching listeners to chat UI.
 */
export function initializeChat() {
    if (isChatInitialized) return;
    console.log("Initializing Chat Module...");

    // Setup callbacks for Web Speech API
    if (isWebSpeechApiSupported()) {
        setBrowserSpeechCallbacks(handleBrowserSpeechResult, handleSpeechError);
    } else {
        console.log("Web Speech API not supported.");
    }

    // Setup callbacks for MediaRecorder
    if (isMediaRecorderSupported()) {
        setRecorderCallbacks(handleRecordingComplete, handleSpeechError); // Use same error handler for simplicity
    } else {
        console.log("MediaRecorder not supported.");
    }

    // Disable voice button if neither method is supported
    // Need to check if chatVoiceBtn exists yet - do this after attaching listeners?
    const neitherVoiceSupported = !isWebSpeechApiSupported() && !isMediaRecorderSupported();

    // Attach listeners to Chat Popup Elements (assuming createChatPopup was called before this)
    // Add checks to ensure elements exist before attaching listeners
    if (chatCloseBtn) {
        chatCloseBtn.addEventListener('click', handleChatClose);
    } else {
        console.error("Chat close button not found during initialization.");
    }
    if (chatDownloadBtn) {
        chatDownloadBtn.addEventListener('click', downloadConversation);
    } else {
        console.error("Chat download button not found during initialization.");
    }
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', handleTextInputSend);
    } else {
        console.error("Chat send button not found during initialization.");
    }
    if (chatInput) {
        chatInput.addEventListener('keydown', handleChatInputKeydown);
    } else {
        console.error("Chat input field not found during initialization.");
    }
    if (chatVoiceBtn) {
        chatVoiceBtn.addEventListener('click', handleVoiceInputClick);
        if (neitherVoiceSupported) {
            console.warn("No voice input method supported. Disabling voice button.");
            disableVoiceButton(true);
        }
    } else {
        console.error("Chat voice button not found during initialization.");
    }

    isChatInitialized = true;
    console.log("Chat Module Initialized (including UI listeners).");
}

// --- Message Handling ---

/**
 * Appends a message to the UI and the internal log.
 * @param {string} sender "User" or "Assistant".
 * @param {string} message The message content.
 */
function appendMessage(sender, message) {
    if (!message) return; // Don't add empty messages
    appendChatMessageUI(sender, message);
    conversationLog.push({ sender, message });
}

/**
 * Handles the user clicking the "Send" button or pressing Enter.
 */
export function handleTextInputSend() {
    const message = getChatInputMessage();
    if (message) {
        console.log("Sending text message:", message);
        clearChatInput();
        appendMessage("User", message);
        processUserMessage(message); // Send text to backend
    }
}

/**
* Handles keydown events in the chat input field (e.g., Enter key).
* @param {KeyboardEvent} event
*/
function handleChatInputKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); // Prevent default newline behavior
        handleTextInputSend();
    }
}

/**
 * Handles the user clicking the voice input button.
 */
export function handleVoiceInputClick() {
    console.log("Voice button clicked.");

    if (isBrowserListeningActive()) {
        stopBrowserListening();
    } else if (isRecordingActive()) {
        stopRecording();
    } else {
        // Prioritize Web Speech API
        if (isWebSpeechApiSupported()) {
            startBrowserListening();
        } else if (isMediaRecorderSupported()) {
            startRecording();
        } else {
            alert("Sorry, your browser doesn't support voice input.");
        }
    }
}

/**
* Handles the user clicking the chat close button.
*/
function handleChatClose() {
    console.log("Chat close button clicked.");
    hideChatPopup();
    // Optionally add cleanup specific to closing the chat
    cleanupChat(); // Stop any active listeners/recorders
}

// --- Backend Interaction ---

/**
 * Processes a user's text message, sends it to the backend, and handles the response.
 * @param {string} textMessage The user's message.
 */
async function processUserMessage(textMessage) {
    stopAssistantSpeech(); // Stop any current playback
    showProcessingIndicator();
    const response = await sendTextToChat(textMessage);
    hideProcessingIndicator();

    if (response.error) {
        appendMessage("Assistant", `Sorry, something went wrong: ${response.error}`);
        // Optionally try to speak the error message?
        // speakText(`Sorry, something went wrong: ${response.error}`, 'chat-error');
    } else if (response.reply_text) {
        appendMessage("Assistant", response.reply_text);
        speakText(response.reply_text, 'chat-reply'); // Speak the reply
    } else {
        appendMessage("Assistant", "I received an empty response. Not sure what to say!");
        // speakText("I received an empty response. Not sure what to say!", 'chat-fallback-empty');
    }
}

/**
 * Processes a user's audio message, sends it to the backend, and handles the response.
 * @param {Blob} audioBlob The user's recorded audio.
 */
async function processUserAudio(audioBlob) {
    stopAssistantSpeech();
    showProcessingIndicator();
    const response = await sendAudioBlobToChat(audioBlob);
    hideProcessingIndicator();

    if (response.error) {
        appendMessage("Assistant", `Sorry, I had trouble understanding the audio: ${response.error}`);
        // speakText(`Sorry, I had trouble understanding the audio: ${response.error}`, 'chat-error-audio');
    } else if (response.reply_text) {
        // Note: We don't have the STT transcript to display for the user's turn.
        // The backend would need to return it if we wanted to show it.
        appendMessage("Assistant", response.reply_text);
        speakText(response.reply_text, 'chat-reply-audio'); // Speak the reply
    } else {
        appendMessage("Assistant", "I processed the audio but didn't get a clear response back.");
        // speakText("I processed the audio but didn't get a clear response back.", 'chat-fallback-empty-audio');
    }
}

// --- Speech/Recorder Callbacks ---

/**
 * Callback for when the Web Speech API successfully recognizes speech.
 * @param {string} transcript The recognized text.
 */
function handleBrowserSpeechResult(transcript) {
    if (transcript) {
        appendMessage("User", transcript); // Show the recognized text
        processUserMessage(transcript); // Process the text as if typed
    } else {
        appendMessage("Assistant", "I didn't quite catch that. Could you try again?");
        // speakText("I didn't quite catch that. Could you try again?", 'chat-stt-empty');
    }
}

/**
 * Callback for when the MediaRecorder finishes recording.
 * @param {Blob} audioBlob The recorded audio blob.
 */
function handleRecordingComplete(audioBlob) {
    console.log("Recording complete, processing audio blob.");
    processUserAudio(audioBlob); // Send the blob to the backend
}

/**
 * Generic callback for errors from Web Speech API or MediaRecorder.
 * @param {string} errorMessage The error message.
 */
function handleSpeechError(errorMessage) {
    appendMessage("Assistant", errorMessage);
    // Optionally speak the error?
    // speakText(errorMessage, 'chat-error-speech');
    // Ensure UI state is reset
    setVoiceButtonRecording(false); // Redundant? cleanup should handle this
}

// --- TTS Helper ---

/**
 * Fetches and plays TTS audio for the given text.
 * Includes error handling and updates chat UI if TTS fails.
 * @param {string} text Text to speak.
 * @param {string} source Source identifier for logging.
 */
async function speakText(text, source) {
    if (!text) return;

    // showProcessingIndicator(); // Optionally show indicator during TTS fetch?
    const result = await fetchTtsAudio(text);
    // hideProcessingIndicator();

    if (result instanceof Blob) {
        playAssistantSpeech(result, source);
    } else if (result && result.error) {
        // TTS fetch failed, show error in chat
        console.error(`Failed to fetch TTS for ${source}: ${result.error}`);
        appendMessage("Assistant", `(Sorry, I couldn't speak that: ${result.error})`);
    } else {
         // Unexpected issue
         console.error(`Unexpected result from fetchTtsAudio for ${source}`);
         appendMessage("Assistant", `(Sorry, an unexpected error occurred trying to speak.)`);
    }
}

// --- Conversation Log Download ---

/**
 * Downloads the current conversation log as a text file.
 */
export function downloadConversation() {
    if (conversationLog.length === 0) {
        console.log("Conversation log is empty.");
        alert("Chat log is empty.");
        return;
    }
    console.log("Downloading conversation log...");
    const logText = conversationLog.map(entry => `${entry.sender}: ${entry.message}`).join("\n");
    const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `conversation_log_${timestamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Download initiated.");
}

/**
 * Cleans up chat state, stopping any active listeners or recorders.
 * Called when closing the chat popup or unloading the page.
 */
export function cleanupChat() {
    console.log("Cleaning up chat state...");
    if (isBrowserListeningActive()) {
        stopBrowserListening();
    }
    if (isRecordingActive()) {
        stopRecording();
    }
    stopAssistantSpeech();
    hideProcessingIndicator(); // Ensure indicator is hidden
}

console.log("Chat Module loaded.");
