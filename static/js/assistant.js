/**
 * Assistant Module: Manages the assistant's state and interactions like activation, click-to-read, and drag.
 */
import { assistant, startButton, readableParagraphs, triggerRandomAnimation, highlightParagraph, enableAssistantDrag, setAssistantSleeping } from './ui.js';
import { fetchGreeting, fetchTtsAudio } from './api.js';
import { playAssistantSpeech, stopAssistantSpeech } from './speech.js';
import { showChatPopup } from './ui.js'; // Assuming chat popup UI logic is in ui.js
import { cleanupChat } from './chat.js'; // To stop listeners when opening chat

// --- State ---
let assistantIsActive = false;

// --- Initialization ---

/**
 * Initializes assistant interactions (button clicks, paragraph clicks, etc.).
 */
export function initializeAssistant() {
    console.log("Initializing Assistant Interactions...");

    // 1. Start Button Listener
    if (startButton) {
        startButton.addEventListener('click', activateAssistant);
    } else {
        console.error("CRITICAL: startButton element not found. Assistant cannot be activated.");
    }

    // 2. Paragraph Click-to-Read Listeners
    if (readableParagraphs.length > 0) {
        readableParagraphs.forEach(paragraph => {
            paragraph.addEventListener('mouseover', () => handleParagraphHover(paragraph, true));
            paragraph.addEventListener('mouseout', () => handleParagraphHover(paragraph, false));
            paragraph.addEventListener('click', () => handleParagraphClick(paragraph));
        });
    } else {
        console.warn("No elements found with class 'tutorial-paragraph'. Click-to-read feature inactive.");
    }

    // 3. Assistant Interaction Listeners
    if (assistant) {
        // Right-click to open chat popup
        assistant.addEventListener('contextmenu', handleAssistantRightClick);
        // Left-click for fun animation
        assistant.addEventListener('click', handleAssistantLeftClick);
        // Enable Drag and Drop
        enableAssistantDrag();
    } else {
        console.error("CRITICAL: assistant element not found. Core functionality unavailable.");
    }

    console.log("Assistant Interactions Initialized.");
}

// --- Event Handlers ---

/**
 * Activates the assistant, plays greeting, and disables start button.
 */
async function activateAssistant() {
    if (assistantIsActive) return;
    console.log("'Start to Learn' button clicked. Activating assistant...");

    setAssistantSleeping(false);
    if(startButton) startButton.disabled = true;
    assistantIsActive = true;

    // Fetch and play the greeting audio
    const greetingBlob = await fetchGreeting();
    if (greetingBlob) {
        playAssistantSpeech(greetingBlob, 'greeting');
    } else {
        console.error("Failed to get greeting audio.");
        // Handle error - maybe display a text message?
    }
    // Optionally trigger an entrance animation
    // triggerRandomAnimation();
}

/**
 * Handles hovering over a readable paragraph.
 * @param {HTMLElement} paragraph The paragraph element.
 * @param {boolean} isHovering True if mouse is over, false if out.
 */
function handleParagraphHover(paragraph, isHovering) {
    if (!assistantIsActive) return;
    highlightParagraph(paragraph, isHovering);
}

/**
 * Handles clicking on a readable paragraph to make the assistant speak it.
 * @param {HTMLElement} paragraph The paragraph element.
 */
async function handleParagraphClick(paragraph) {
    if (!assistantIsActive) {
        console.log("Paragraph clicked, but assistant is not active.");
        return;
    }
    const textToSpeak = paragraph.textContent?.trim();
    if (textToSpeak) {
        console.log("Readable paragraph clicked.");
        // Stop current speech before starting new one
        stopAssistantSpeech();
        // Fetch and play the new text
        const audioBlob = await fetchTtsAudio(textToSpeak);
        if (audioBlob instanceof Blob) {
            playAssistantSpeech(audioBlob, 'click');
        } else {
             console.error("Failed to get audio for paragraph click.", audioBlob?.error);
             // Maybe display error in chat?
        }
    } else {
        console.warn("Clicked paragraph has no text content.");
    }
}

/**
 * Handles right-clicking on the assistant to open the chat.
 * @param {Event} event The contextmenu event.
 */
function handleAssistantRightClick(event) {
    event.preventDefault(); // Prevent default browser context menu
    if (!assistantIsActive) return;
    console.log("Assistant right-clicked. Opening chat.");

    // Stop any ongoing speech/recording before opening chat
    cleanupChat(); // Use chat module's cleanup

    // Show the chat interface (assumes createChatPopup was called elsewhere)
    showChatPopup();
}

/**
 * Handles left-clicking on the assistant for a fun animation.
 * @param {Event} event The click event.
 */
function handleAssistantLeftClick(event) {
    // Check if the click was part of a drag - basic check
    // More robust check might involve comparing mouseup/mousedown positions
    // or checking if a drag flag is set by the drag handler

    if (!assistantIsActive) return;
    console.log("Assistant left-clicked.");

    // Optional: Prevent animation if speaking or listening?
    // const isSpeaking = assistant.classList.contains('is-speaking');
    // const isListening = assistant.classList.contains('is-listening');
    // if (isSpeaking || isListening) return;

    triggerRandomAnimation();
}

/**
 * Checks if the assistant is currently active.
 * @returns {boolean} True if active, false otherwise.
 */
export function isAssistantActive() {
    return assistantIsActive;
}

console.log("Assistant Module loaded.");
