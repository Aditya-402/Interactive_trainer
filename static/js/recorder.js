/**
 * Recorder Module: Handles audio recording using the MediaRecorder API.
 */
import { recordingTimeoutDuration, minAudioBlobSize } from './config.js';
import { setAssistantListening, setVoiceButtonRecording } from './ui.js';
import { stopAssistantSpeech } from './speech.js';

// --- State Variables ---
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingTimeout = null;
let onRecordingCompleteCallback = null; // Callback when recording stops and provides blob
let onRecordingErrorCallback = null; // Callback for recording errors

/**
 * Checks if the MediaRecorder API is likely supported.
 * @returns {boolean} True if supported, false otherwise.
 */
export function isMediaRecorderSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
}

/**
 * Sets the callbacks for recording completion and errors.
 * @param {function(Blob): void} onComplete Callback function receiving the audio blob.
 * @param {function(string): void} onError Callback function for recording errors.
 */
export function setRecorderCallbacks(onComplete, onError) {
    onRecordingCompleteCallback = onComplete;
    onRecordingErrorCallback = onError;
}

/**
 * Initializes MediaRecorder, requests microphone access, and starts recording.
 */
export async function startRecording() {
    if (isRecording || !isMediaRecorderSupported()) {
        console.warn("Cannot start recording. Already recording or MediaRecorder not supported.");
        return;
    }
    stopAssistantSpeech(); // Stop assistant playback

    // Clean up any previous instance cautiously
    if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
        console.log("Attempting to stop previous MediaRecorder instance before starting new one.");
        try { mediaRecorder.stop(); } catch (e) { console.warn("Error stopping previous recorder:", e); }
        // Reset state fully before proceeding
        cleanupRecordingState(false); // Don't trigger callbacks for this internal cleanup
    }

    try {
        console.log("Requesting microphone access for MediaRecorder...");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log("Microphone access granted.");

        // Determine preferred MIME type
        const mimeTypes = [
            'audio/webm;codecs=opus', 'audio/ogg;codecs=opus',
            'audio/webm', 'audio/ogg', 'audio/wav'
        ];
        const selectedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
        console.log("Using MediaRecorder mimeType:", selectedMimeType || 'Browser Default');
        const options = selectedMimeType ? { mimeType: selectedMimeType } : {};

        mediaRecorder = new MediaRecorder(stream, options);

        // --- MediaRecorder Event Handlers ---
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            console.log("MediaRecorder stopped event fired.");
            // Stop the tracks to release the microphone indicator/resource
            stream.getTracks().forEach(track => track.stop());

            const currentIsRecording = isRecording; // Capture state before cleanup
            cleanupRecordingState(false); // Clean state *before* processing blob/callbacks

            if (!currentIsRecording) {
                 console.warn("MediaRecorder.onstop fired but state was already not recording.");
                 return; // Avoid double processing if stopRecording was called rapidly
            }

            if (audioChunks.length === 0) {
                console.warn("No audio data recorded (audioChunks is empty).");
                if (onRecordingErrorCallback) {
                    onRecordingErrorCallback("I didn't hear anything. Could you try speaking again?");
                }
                return;
            }

            // Create Blob from chunks
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
            console.log(`Created audio blob, size: ${audioBlob.size}, type: ${audioBlob.type}`);
            audioChunks = []; // Clear chunks immediately

            if (audioBlob.size < minAudioBlobSize) {
                console.warn(`Recorded audio blob size (${audioBlob.size} bytes) is below threshold.`);
                 if (onRecordingErrorCallback) {
                    onRecordingErrorCallback("Hmm, I might not have caught that clearly. Please try speaking louder or longer.");
                }
            } else if (onRecordingCompleteCallback) {
                onRecordingCompleteCallback(audioBlob); // Send valid blob to callback
            }
        };

        mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder error:", event.error);
            stream.getTracks().forEach(track => track.stop()); // Ensure tracks are stopped
            const wasRecording = isRecording;
            cleanupRecordingState(false); // Clean up state

            if (wasRecording && onRecordingErrorCallback) {
                onRecordingErrorCallback("There was an issue with the microphone recording.");
            }
        };

        // --- Start Recording ---
        audioChunks = []; // Clear previous chunks
        mediaRecorder.start();
        isRecording = true;
        console.log("MediaRecorder recording started...");
        setAssistantListening(true);
        setVoiceButtonRecording(true); // Update UI

        // Set timeout to automatically stop recording
        clearTimeout(recordingTimeout); // Clear any previous timeout
        recordingTimeout = setTimeout(() => {
            console.log(`Recording timeout reached (${recordingTimeoutDuration / 1000} seconds).`);
            if (isRecording) { // Check state before stopping
               stopRecording();
            }
        }, recordingTimeoutDuration);

    } catch (err) {
        console.error('Error accessing microphone or setting up MediaRecorder:', err);
        let userMessage = 'Could not access microphone.';
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            userMessage = 'Microphone access denied. Please allow it in your browser settings.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            userMessage = 'No microphone found. Please ensure it is connected.';
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
            userMessage = 'Microphone is already in use or cannot be accessed.';
        }
        alert(userMessage); // Inform user directly for critical errors
        if(onRecordingErrorCallback) {
            onRecordingErrorCallback(userMessage); // Also inform chat if possible
        }
        cleanupRecordingState(false); // Ensure state is clean after failure
    }
}

/**
 * Stops the MediaRecorder recording.
 * The actual processing and callback invocation happens in the `onstop` event handler.
 */
export function stopRecording() {
    if (!isRecording || !mediaRecorder || mediaRecorder.state !== 'recording') {
        return; // Not recording or recorder not ready
    }
    console.log("Stopping MediaRecorder recording...");
    try {
        mediaRecorder.stop(); // This triggers the 'onstop' event
        // State updates are primarily handled in 'onstop' and 'onerror' for consistency
        // But we clear the timeout here
        clearTimeout(recordingTimeout);
        recordingTimeout = null;
    } catch (error) {
        console.error("Error stopping MediaRecorder:", error);
        // Force cleanup as a fallback if .stop() fails catastrophically
        cleanupRecordingState(true); // Trigger error callback if we force cleanup
    }
}

/**
 * Cleans up recording state variables and UI elements.
 * Private helper function.
 * @param {boolean} triggerErrorCallback - If true, call the error callback during cleanup.
 */
function cleanupRecordingState(triggerErrorCallback = false) {
    const wasRecording = isRecording; // Check state *before* changing it

    isRecording = false;
    clearTimeout(recordingTimeout);
    recordingTimeout = null;
    audioChunks = [];
    // Don't nullify mediaRecorder here, onstop/onerror might still need it briefly?
    // mediaRecorder = null; // Let's keep it until a new one is created

    setAssistantListening(false);
    setVoiceButtonRecording(false);

    if (triggerErrorCallback && wasRecording && onRecordingErrorCallback) {
        onRecordingErrorCallback("Recording stopped due to an unexpected error.");
    }
}

/**
 * Checks if the MediaRecorder is currently active.
 * @returns {boolean} True if recording, false otherwise.
 */
export function isRecordingActive() {
    return isRecording;
}

console.log("Recorder Module loaded.");
