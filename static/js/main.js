/**
 * Main Application Entry Point
 */
import { createChatPopup } from './ui.js';
import { initializeChat } from './chat.js';
import { initializeAssistant } from './assistant.js';

/**
 * Initializes the entire application once the DOM is fully loaded.
 */
function initializeApp() {
    console.log("DOM fully loaded. Initializing application...");

    // 1. Create Chat Popup Structure (UI element selection happens on import)
    createChatPopup(); // Create the chat popup structure in the DOM

    // 2. Initialize Chat System (sets up speech/recorder callbacks)
    initializeChat();

    // 3. Initialize Assistant Interactions (start button, paragraph clicks, drag, etc.)
    initializeAssistant();

    console.log("Application Initialized Successfully.");
}

// --- Wait for the DOM to be ready before initializing --- //

if (document.readyState === 'loading') {
    // Loading hasn't finished yet
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    // `DOMContentLoaded` has already fired
    initializeApp();
}

console.log("Main Module loaded.");
