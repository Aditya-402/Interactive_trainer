/**
 * Configuration constants for the frontend.
 */

// Centralized backend URL
export const backendUrl = 'http://127.0.0.1:5000';

// Recording duration limit in milliseconds
export const recordingTimeoutDuration = 7000; // 7 seconds

// Minimum audio blob size to consider valid (bytes)
export const minAudioBlobSize = 1000;

console.log(`Configuration loaded. Backend URL: ${backendUrl}`);
