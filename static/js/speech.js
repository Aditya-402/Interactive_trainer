/**
 * Speech Module: Handles Text-to-Speech (TTS) playback and Speech-to-Text (STT) using Web Speech API.
 */
import { setAssistantSpeaking, setAssistantListening, setVoiceButtonRecording } from './ui.js';

// --- State Variables ---
const assistantAudio = new Audio(); // Audio element for playing TTS
let currentAudioSource = null; // Tracks the source of the currently playing/last played audio
let browserSpeechRecognition = null; // Instance for Web Speech API recognition
let isBrowserListening = false; // Flag for Web Speech API listening state
let onBrowserSpeechResultCallback = null; // Callback for when STT gets a result
let onBrowserSpeechErrorCallback = null; // Callback for STT errors

// --- TTS Playback ---

/**
 * Plays the provided audio blob using the assistant's audio element.
 * @param {Blob} audioBlob The audio data to play.
 * @param {string} source A label identifying the source of the audio (e.g., 'greeting', 'chat-reply').
 */
export function playAssistantSpeech(audioBlob, source = 'unknown') {
    stopAssistantSpeech(); // Ensure any previous playback is stopped cleanly
    try {
        const audioUrl = URL.createObjectURL(audioBlob);
        currentAudioSource = source;
        assistantAudio.src = audioUrl;

        assistantAudio.play()
            .then(() => {
                console.log(`Assistant playing audio [Source: ${source}]`);
                setAssistantSpeaking(true);
            })
            .catch(e => {
                console.error("Error starting audio playback:", e);
                cleanupAudioPlayback(); // Clean up if play fails
            });

        // Event listener for when playback finishes naturally
        assistantAudio.onended = () => {
            console.log(`Assistant finished speaking [Source: ${currentAudioSource}].`);
            cleanupAudioPlayback();
        };

        // Event listener for errors during playback
        assistantAudio.onerror = (e) => {
            console.error("Error during assistant audio playback:", e);
            cleanupAudioPlayback(); // Clean up on error too
        };

    } catch (error) {
        console.error("Error setting up audio playback (e.g., creating Object URL):", error);
        cleanupAudioPlayback(); // Ensure cleanup happens
    }
}

/**
 * Stops the assistant's audio playback immediately and cleans up resources.
 */
export function stopAssistantSpeech() {
    if (!assistantAudio.paused) {
        console.log(`Stopping assistant speech [Source: ${currentAudioSource}].`);
        assistantAudio.pause();
        // Cleanup is called directly as 'onended' might not fire reliably when paused manually.
    }
    // Always call cleanup to handle potential lingering states or URLs
    cleanupAudioPlayback();
}

/**
 * Resets audio element state, revokes object URLs, and updates UI.
 * Private helper function.
 */
function cleanupAudioPlayback() {
    const currentSrc = assistantAudio.src;
    if (currentSrc && currentSrc.startsWith('blob:')) {
        URL.revokeObjectURL(currentSrc);
    }
    assistantAudio.removeAttribute('src');
    assistantAudio.load(); // Reset the media element state
    currentAudioSource = null;
    setAssistantSpeaking(false); // Ensure UI state is reset

    // Remove event listeners
    assistantAudio.onended = null;
    assistantAudio.onerror = null;
}

// --- Web Speech API (STT) ---

/**
 * Checks if the browser supports the Web Speech API.
 * @returns {boolean} True if supported, false otherwise.
 */
export function isWebSpeechApiSupported() {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

/**
 * Sets the callbacks for STT results and errors.
 * @param {function(string): void} onResult Callback function for successful recognition.
 * @param {function(string): void} onError Callback function for recognition errors.
 */
export function setBrowserSpeechCallbacks(onResult, onError) {
    onBrowserSpeechResultCallback = onResult;
    onBrowserSpeechErrorCallback = onError;
}

/**
 * Starts listening for speech using the Web Speech API.
 */
export function startBrowserListening() {
    if (isBrowserListening || !isWebSpeechApiSupported()) return;
    stopAssistantSpeech(); // Stop assistant if it's talking

    console.log("Starting browser speech recognition...");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    browserSpeechRecognition = new SpeechRecognition();
    browserSpeechRecognition.lang = 'en-US'; // Set language
    browserSpeechRecognition.interimResults = false; // We only want final results
    browserSpeechRecognition.maxAlternatives = 1; // Get the best result

    isBrowserListening = true;
    setVoiceButtonRecording(true); // Update UI
    setAssistantListening(true);

    browserSpeechRecognition.onresult = (event) => {
        // Get the last final transcript
        const transcript = event.results[event.results.length - 1][0].transcript.trim();
        console.log("Browser STT Result:", transcript);
        if (onBrowserSpeechResultCallback) {
            onBrowserSpeechResultCallback(transcript);
        }
    };

    browserSpeechRecognition.onerror = (event) => {
        console.error("Browser speech recognition error:", event.error);
        let errorMsg = "Sorry, a voice recognition error occurred.";
        if (event.error === 'no-speech') {
            errorMsg = "I didn't detect any speech. Please try again.";
        } else if (event.error === 'audio-capture') {
            errorMsg = "I couldn't access the microphone. Please check permissions.";
        } else if (event.error === 'not-allowed') {
            errorMsg = "Microphone access was denied. Please enable it in your browser settings.";
        }
        if (onBrowserSpeechErrorCallback) {
            onBrowserSpeechErrorCallback(errorMsg);
        }
         // Stop listening cleanly after an error
         cleanupBrowserListening(false); // Let onend handle full cleanup if it fires
    };

    browserSpeechRecognition.onend = () => {
        console.log("Browser speech recognition ended.");
        // This fires after result, error, or manual stop.
        // Ensure cleanup happens regardless of the reason for ending.
        cleanupBrowserListening(false); // Don't try to stop the instance again
    };

    try {
        browserSpeechRecognition.start(); // Start listening
    } catch (e) {
         console.error("Error starting SpeechRecognition:", e);
         if (onBrowserSpeechErrorCallback) {
            onBrowserSpeechErrorCallback("Failed to start voice recognition.");
         }
         cleanupBrowserListening(false);
    }
}

/**
 * Stops the Web Speech API from listening.
 */
export function stopBrowserListening() {
    if (!isBrowserListening) return;
    console.log("Attempting to stop browser speech recognition...");
    cleanupBrowserListening(true); // Request instance stop and cleanup state
}

/**
 * Cleans up the browser speech recognition state and UI.
 * Private helper function.
 * @param {boolean} attemptStopInstance - Whether to try calling .stop() on the recognition instance.
 */
function cleanupBrowserListening(attemptStopInstance = true) {
     if (!isBrowserListening && !browserSpeechRecognition) return; // Already clean

    if (browserSpeechRecognition && attemptStopInstance) {
        try {
            browserSpeechRecognition.stop(); // Attempt to stop the instance
            console.log("Called browserSpeechRecognition.stop()");
        } catch (e) {
            // Ignore errors if already stopped or in a bad state
            console.warn("Error trying to stop SpeechRecognition instance (may be normal if already stopped):", e);
        }
    }

    isBrowserListening = false;
    // Nullify the instance and callbacks *after* potential onend
    // Delay slightly to ensure onend has a chance to fire and reference callbacks?
    // Or rely on onend to handle the final cleanup?
    // Let's clear them here for robustness in case onend doesn't fire.
    browserSpeechRecognition = null;
    // onBrowserSpeechResultCallback = null; // Keep callbacks for potential re-use?
    // onBrowserSpeechErrorCallback = null;

    setVoiceButtonRecording(false); // Update UI
    setAssistantListening(false);
}

/**
 * Checks if the browser STT is currently active.
 * @returns {boolean} True if listening, false otherwise.
 */
export function isBrowserListeningActive() {
    return isBrowserListening;
}

console.log("Speech Module loaded.");
