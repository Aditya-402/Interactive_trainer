/**
 * API Module: Handles all communication with the backend server.
 */
import { backendUrl } from './config.js';

/**
 * Fetches the initial greeting audio from the backend.
 * @returns {Promise<Blob|null>} A promise that resolves with the audio blob or null on error.
 */
export async function fetchGreeting() {
    console.log("Fetching greeting audio from API...");
    try {
        const response = await fetch(`${backendUrl}/api/greet`, { method: 'POST' });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
            console.error(`Error fetching greeting: ${response.status} ${response.statusText}`, errorData);
            return null;
        }
        const audioBlob = await response.blob();
        if (audioBlob.size === 0) {
             console.error("Received empty audio blob for greeting.");
             return null;
        }
        console.log(`Received greeting audio blob, size: ${audioBlob.size}`);
        return audioBlob;
    } catch (error) {
        console.error('Network error or issue fetching greeting:', error);
        return null;
    }
}

/**
 * Fetches Text-to-Speech audio for the given text from the backend.
 * @param {string} text The text to synthesize.
 * @returns {Promise<Blob|null>} A promise that resolves with the audio blob or null on error.
 */
export async function fetchTtsAudio(text) {
    if (!text) {
        console.warn('fetchTtsAudio called with empty text');
        return null;
    }
    console.log(`Fetching TTS audio from API for text: "${text.substring(0, 30)}..."`);
    try {
        const response = await fetch(`${backendUrl}/api/speak`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Failed to parse error response" }));
            console.error(`Error fetching TTS audio: ${response.status} ${response.statusText}`, errorData);
            // Propagate error details if possible
            return { error: errorData.error || `HTTP ${response.status}` };
        }
        const audioBlob = await response.blob();
         if (audioBlob.size === 0) {
             console.error("Received empty audio blob for TTS.");
             return { error: "Empty audio received from server" };
         }
         console.log(`Received TTS audio blob, size: ${audioBlob.size}`);
        return audioBlob;
    } catch (error) {
        console.error('Network error or issue fetching TTS audio:', error);
        return { error: "Network error fetching audio" };
    }
}

/**
 * Sends text to the backend chat endpoint.
 * @param {string} text The user's text message.
 * @returns {Promise<{reply_text: string}|{error: string}>} Promise resolving to {reply_text: ...} or {error: ...}
 */
export async function sendTextToChat(text) {
    console.log(`Sending text message to chat API: ${text.substring(0, 50)}...`);
    try {
        const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text })
        });

        const data = await response.json(); // Attempt to parse JSON regardless of status

        if (!response.ok) {
            console.error(`Error sending text chat: ${response.status} ${response.statusText}`, data);
            return { error: data.error || `Request failed with status ${response.status}` };
        }

        console.log("Received chat reply (text input):", data.reply_text);
        return data; // Should contain { reply_text: "..." }

    } catch (error) {
        console.error("Network error or issue sending text chat message:", error);
        return { error: "Network error connecting to chat server." };
    }
}

/**
 * Sends an audio blob to the backend chat endpoint.
 * @param {Blob} audioBlob The user's recorded audio.
 * @returns {Promise<{reply_text: string}|{error: string}>} Promise resolving to {reply_text: ...} or {error: ...}
 */
export async function sendAudioBlobToChat(audioBlob) {
    if (!audioBlob || audioBlob.size === 0) {
        console.warn("sendAudioBlobToChat called with empty blob.");
        return { error: "Cannot send empty audio recording." };
    }
    console.log(`Sending audio blob to chat API, size: ${audioBlob.size}, type: ${audioBlob.type}`);

    const formData = new FormData();
    let filename = 'user_speech.webm'; // Default filename
    if (audioBlob.type.includes('ogg')) filename = 'user_speech.ogg';
    else if (audioBlob.type.includes('wav')) filename = 'user_speech.wav';
    // Add more mime type checks if needed
    formData.append('audio_blob', audioBlob, filename);

    try {
        const response = await fetch(`${backendUrl}/api/chat`, {
            method: 'POST',
            body: formData // Content-Type automatically set to multipart/form-data by fetch
        });

        const data = await response.json(); // Attempt to parse JSON regardless of status

        if (!response.ok) {
            console.error(`Error sending audio chat: ${response.status} ${response.statusText}`, data);
            return { error: data.error || `Audio processing failed with status ${response.status}` };
        }

        console.log("Received chat reply (audio input):", data.reply_text);
        return data; // Should contain { reply_text: "..." }

    } catch (error) {
        console.error('Network error or issue sending audio chat:', error);
        return { error: "Network error sending audio to chat server." };
    }
}

/**
 * Sends a user's query to the chapter-specific assistant endpoint.
 * @param {number} chapterNumber The chapter number context.
 * @param {string} query The user's text query.
 * @returns {Promise<object>} Promise resolving to the response JSON (e.g., { reply: "..." }) or an error object ({ error: "..." }).
 */
export async function sendQueryToChapterAssistant(chapterNumber, query) {
    const url = `${backendUrl}/api/ask_chapter_assistant/${chapterNumber}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: query }),
        });

        if (!response.ok) {
            let errorMsg = `HTTP error! status: ${response.status}`;
            try {
                const errData = await response.json();
                errorMsg += `: ${errData.error || errData.reply || 'Unknown error'}`;
            } catch (jsonError) {
                // Ignore if response body is not JSON
            }
            console.error("Error sending query to chapter assistant:", errorMsg);
            return { error: errorMsg };
        }

        const data = await response.json();
        return data; // Expected format: { reply: "..." }

    } catch (error) {
        console.error("Network error sending query to chapter assistant:", error);
        return { error: `Network error: ${error.message}` };
    }
}

console.log("API Module loaded.");
