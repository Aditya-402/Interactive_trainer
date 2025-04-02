// Wait for the HTML document to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // --- Get DOM Elements ---
    console.log("DOM Content Loaded. Initializing script...");
    const startButton = document.getElementById('start-learn-btn');
    const assistant = document.getElementById('tutor-assistant');
    const readableParagraphs = document.querySelectorAll('.tutorial-paragraph');
    const waveSound = document.getElementById('assistant-sound'); // Sound for animation gestures
    const processingIndicator = document.getElementById('processing-status'); // Get status indicator
    const backendUrl = 'http://127.0.0.1:5001'; // Centralized backend URL

    console.log(`Backend URL set to: ${backendUrl}`);
    console.log("Start button found:", !!startButton);
    console.log("Assistant element found:", !!assistant);
    console.log(`Found ${readableParagraphs.length} readable paragraphs.`);
    console.log("Processing indicator found:", !!processingIndicator);

    // --- State Variables ---
    let assistantIsActive = false;
    const assistantAudio = new Audio(); // For all assistant speech playback
    let currentAudioSource = null; // Tracks what triggered speech (e.g., 'greeting', 'click', 'chat-reply')
    let mediaRecorder = null; // For recording audio via MediaRecorder API
    let audioChunks = []; // Stores recorded audio data chunks
    let isRecording = false; // Flag for MediaRecorder recording state
    let recordingTimeout = null; // Timeout ID for automatic recording stop
    let browserSpeechRecognition = null; // Instance for Web Speech API recognition
    let isBrowserListening = false; // Flag for Web Speech API listening state

    // Conversation log array to store messages (sender + message)
    let conversationLog = [];

    // --- Chat Popup Elements (initialized when popup is created) ---
    let chatPopup = null;
    let chatLogDiv = null;
    let chatInput = null;
    let chatSendBtn = null;
    let chatVoiceBtn = null;
    let chatCloseBtn = null;
    let chatDownloadBtn = null;

    // --- Status Indicator Control ---
    function showProcessingIndicator() {
        if (processingIndicator) {
            processingIndicator.classList.add('visible');
        }
    }
    function hideProcessingIndicator() {
        if (processingIndicator) {
            processingIndicator.classList.remove('visible');
        }
    }


    // --- Chat Popup Modal ---
    function createChatPopup() {
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

        // Attach event listeners to popup elements
        chatCloseBtn.addEventListener('click', hideChatPopup);
        chatDownloadBtn.addEventListener('click', downloadConversation);
        chatSendBtn.addEventListener('click', handleSendButtonClick);
        chatInput.addEventListener('keydown', handleChatInputKeydown);
        chatVoiceBtn.addEventListener('click', handleVoiceButtonClick);

        console.log("Chat popup created and listeners attached.");
    }

    function showChatPopup() {
        if (!assistantIsActive) return; // Don't show if assistant isn't active
        if (!chatPopup) createChatPopup(); // Create if it doesn't exist
        console.log("Showing chat popup.");
        chatPopup.style.display = 'flex'; // Use flex to manage layout
        // Optionally focus the input field
        if (chatInput) chatInput.focus();
        // Optionally add an opening animation/transition if defined in CSS
    }

    function hideChatPopup() {
        if (chatPopup) {
            console.log("Hiding chat popup.");
            chatPopup.style.display = 'none';
            // Stop any ongoing recording if the popup is closed
            if (isRecording) stopRecording();
            if (isBrowserListening) stopBrowserListening();
            // Hide processing indicator if chat is closed
            hideProcessingIndicator();
        }
    }

    // Append a message to the chat log DIV and the conversationLog array.
    function appendChatMessage(sender, message) {
        if (!chatLogDiv) {
            console.error("Chat log div not found, cannot append message.");
            return;
        }
        console.log(`Appending message - Sender: ${sender}, Message: ${message.substring(0, 50)}...`);
        const msgElem = document.createElement('p');
        msgElem.classList.add('chat-message');
        msgElem.classList.add(sender === "User" ? 'user-message' : 'assistant-message');
        // Use textContent to prevent XSS vulnerabilities
        msgElem.textContent = message; // Prefix is handled by CSS ::before
        chatLogDiv.appendChild(msgElem);
        // Scroll to the bottom of the chat log
        chatLogDiv.scrollTop = chatLogDiv.scrollHeight;
        // Add to the downloadable log array
        conversationLog.push(sender + ": " + message);
    }

    // Download conversation log as a text file.
    function downloadConversation() {
        if (conversationLog.length === 0) {
            console.log("Conversation log is empty, nothing to download.");
            return;
        }
        console.log("Preparing conversation log for download...");
        const logText = conversationLog.join("\n");
        const blob = new Blob([logText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        a.download = `conversation_log_${timestamp}.txt`;
        document.body.appendChild(a); // Append anchor to body
        a.click(); // Simulate click to trigger download
        document.body.removeChild(a); // Clean up anchor
        URL.revokeObjectURL(url); // Release object URL
        console.log("Download initiated.");
    }

    // --- Text Chat Input Handling ---
    function handleSendButtonClick() {
        if (!chatInput) return;
        const message = chatInput.value.trim();
        if (message) {
            console.log("Send button clicked, message:", message);
            appendChatMessage("User", message); // Show user message immediately
            sendChatMessage(message, 'chat-type'); // Send text to backend
            chatInput.value = ""; // Clear input field
        } else {
            console.log("Send button clicked, but message is empty.");
        }
    }

    function handleChatInputKeydown(event) {
        if (event.key === 'Enter' && !event.shiftKey) { // Send on Enter, allow Shift+Enter for newline
            event.preventDefault(); // Prevent default newline behavior
            console.log("Enter key pressed in chat input.");
            handleSendButtonClick(); // Trigger send action
        }
    }

    // --- Voice Chat Handling ---
    function handleVoiceButtonClick() {
        console.log("Voice button clicked.");
        // Priority 1: Use Web Speech API if available
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            if (isBrowserListening) {
                stopBrowserListening();
            } else {
                startBrowserListening();
            }
        }
        // Priority 2: Fallback to MediaRecorder
        else if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            if (isRecording) {
                stopRecording(); // If already recording, stop it
            } else {
                setupMediaRecorderAndRecord(); // Otherwise, start recording
            }
        }
        // No voice input method available
        else {
            console.warn("Neither Web Speech API nor MediaRecorder seem to be supported.");
            alert("Sorry, your browser doesn't support voice input features needed for this chat.");
            // Optionally disable the voice button
            if(chatVoiceBtn) chatVoiceBtn.disabled = true;
        }
    }

    // --- Web Speech API Implementation ---
    function startBrowserListening() {
        if (isBrowserListening) return;
        stopAssistantSpeech(); // Stop assistant if it's talking

        console.log("Starting browser speech recognition...");
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        browserSpeechRecognition = new SpeechRecognition();
        browserSpeechRecognition.lang = 'en-US'; // Set language
        browserSpeechRecognition.interimResults = false; // We only want final results
        browserSpeechRecognition.maxAlternatives = 1; // Get the best result

        isBrowserListening = true;
        if (chatVoiceBtn) chatVoiceBtn.classList.add('is-recording'); // Visual feedback
        if (assistant) assistant.classList.add('is-listening');

        browserSpeechRecognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.trim(); // Get the last final transcript
            console.log("Browser STT Result:", transcript);
            if (transcript) {
                appendChatMessage("User", transcript);
                sendChatMessage(transcript, 'chat-voice-browser'); // Send transcribed text
            } else {
                console.log("Browser STT returned empty transcript.");
                appendChatMessage("Assistant", "I didn't quite catch that. Could you try again?");
                // Optionally play a sound/message indicating nothing was heard
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
             // Append and optionally speak the error
            appendChatMessage("Assistant", errorMsg);
            // Consider if you want the assistant to speak this error: fetchAndPlayText(errorMsg, 'error-stt');
        };

        browserSpeechRecognition.onend = () => {
            console.log("Browser speech recognition ended.");
            // This 'onend' fires even after a result or error, so cleanup happens here
            stopBrowserListening(false); // Call cleanup without explicitly stopping recognition again
        };

        browserSpeechRecognition.start(); // Start listening
    }

    function stopBrowserListening(stopRecognitionInstance = true) {
        if (!isBrowserListening) return;
        console.log("Stopping browser speech recognition...");
        if (browserSpeechRecognition && stopRecognitionInstance) {
            try {
                 browserSpeechRecognition.stop(); // Attempt to stop the instance
            } catch (e) {
                console.warn("Error trying to stop SpeechRecognition instance:", e);
            }
        }
        isBrowserListening = false;
        browserSpeechRecognition = null; // Release the instance
        if (chatVoiceBtn) chatVoiceBtn.classList.remove('is-recording');
        if (assistant) assistant.classList.remove('is-listening');
    }

    // --- MediaRecorder Implementation ---
    async function setupMediaRecorderAndRecord() {
        if (isRecording) {
            console.warn("Already recording with MediaRecorder.");
            return;
        }
        stopAssistantSpeech(); // Stop assistant if speaking

        // Check for prior MediaRecorder instance state
         if (mediaRecorder && (mediaRecorder.state === "recording" || mediaRecorder.state === "paused")) {
            console.log("MediaRecorder already exists and seems active. Attempting to stop first.");
            try {
                mediaRecorder.stop(); // Ensure it's stopped before creating a new one
            } catch (e) { console.warn("Error stopping previous recorder:", e); }
            // Reset state variables related to old recorder if necessary
            isRecording = false;
            audioChunks = [];
        }

        try {
            console.log("Requesting microphone access for MediaRecorder...");
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log("Microphone access granted.");

            // Determine preferred MIME type
            const mimeTypes = [
                'audio/webm;codecs=opus', // Preferred
                'audio/ogg;codecs=opus',
                'audio/webm',
                'audio/ogg',
                'audio/wav', // Less common for recording, but possible
                // 'audio/mp4', // Sometimes supported
            ];
            let selectedMimeType = '';
            for (const type of mimeTypes) {
                if (MediaRecorder.isTypeSupported(type)) {
                    selectedMimeType = type;
                    break;
                }
            }
            if (!selectedMimeType) {
                 // Fallback to default if none of the preferred types are supported
                 console.warn("Preferred MIME types not supported, using browser default.");
                 selectedMimeType = undefined; // Let the browser decide
            }
            console.log("Using MediaRecorder mimeType:", selectedMimeType || 'Browser Default');
            const options = selectedMimeType ? { mimeType: selectedMimeType } : {};

            mediaRecorder = new MediaRecorder(stream, options);

            // --- MediaRecorder Event Handlers ---
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    // console.log(`Data available, size: ${event.data.size}`);
                    audioChunks.push(event.data);
                } else {
                     console.log("Data available event with zero size chunk received.");
                }
            };

            mediaRecorder.onstop = () => {
                console.log("MediaRecorder stopped event fired.");
                // Stop the tracks on the stream to release the microphone indicator
                stream.getTracks().forEach(track => track.stop());

                if (assistant) assistant.classList.remove('is-listening');
                if (chatVoiceBtn) chatVoiceBtn.classList.remove('is-recording'); // Ensure visual feedback stops
                isRecording = false; // Update state *before* processing

                if (audioChunks.length === 0) {
                    console.warn("No audio data recorded (audioChunks is empty).");
                    appendChatMessage("Assistant", "I didn't hear anything. Could you try speaking again?");
                    // Optionally play this message: fetchAndPlayText("I didn't hear anything. Could you try speaking again?", 'chat-fallback-noaudio');
                    return;
                }

                // Create Blob from chunks using the determined mimeType
                const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' }); // Use actual mimetype if known
                console.log(`Created audio blob, size: ${audioBlob.size}, type: ${audioBlob.type}`);
                audioChunks = []; // Clear chunks for next recording

                if (audioBlob.size < 1000) { // Threshold for potentially empty/noise recording (adjust as needed)
                     console.warn(`Recorded audio blob size (${audioBlob.size} bytes) seems too small. Might be noise or silence.`);
                     appendChatMessage("Assistant", "Hmm, I might not have caught that clearly. Please try speaking a bit louder or longer.");
                    // Optionally play: fetchAndPlayText("Hmm, I might not have caught that clearly. Please try speaking a bit louder or longer.", 'chat-fallback-shortaudio');
                } else {
                    sendAudioToChat(audioBlob); // Send the valid audio blob
                }
            };

            mediaRecorder.onerror = (event) => {
                console.error("MediaRecorder error:", event.error);
                 // Stop the tracks on the stream
                stream.getTracks().forEach(track => track.stop());
                if (isRecording) { // Ensure state is reset even on error
                    isRecording = false;
                    if (assistant) assistant.classList.remove('is-listening');
                    if (chatVoiceBtn) chatVoiceBtn.classList.remove('is-recording');
                     if (recordingTimeout) clearTimeout(recordingTimeout);
                     recordingTimeout = null;
                }
                appendChatMessage("Assistant", "There was an issue with the microphone recording.");
                // Optionally play: fetchAndPlayText("There was an issue with the microphone recording.", 'chat-fallback-micerror');
            };

            // --- Start Recording ---
            audioChunks = []; // Clear previous chunks
            mediaRecorder.start();
            isRecording = true;
            console.log("MediaRecorder recording started...");
            if (assistant) assistant.classList.add('is-listening');
            if (chatVoiceBtn) chatVoiceBtn.classList.add('is-recording'); // Visual feedback

            // Set timeout to automatically stop recording after a duration
            if (recordingTimeout) clearTimeout(recordingTimeout);
            recordingTimeout = setTimeout(() => {
                console.log("Recording timeout reached (7 seconds).");
                stopRecording(); // Automatically stop recording
            }, 7000); // 7 seconds recording limit

        } catch (err) {
            console.error('Error accessing microphone or setting up MediaRecorder:', err);
            let alertMsg = 'Could not access microphone.';
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                alertMsg = 'Microphone access denied. Please allow microphone access in your browser settings and refresh the page.';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                 alertMsg = 'No microphone found. Please ensure it is connected and enabled.';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                alertMsg = 'Microphone is already in use or cannot be accessed. Please check if another application is using it.';
            }
            alert(alertMsg); // Inform user via alert
             // Ensure state is clean
             isRecording = false;
             if (assistant) assistant.classList.remove('is-listening');
             if (chatVoiceBtn) chatVoiceBtn.classList.remove('is-recording');
        }
    }

    function stopRecording() {
        if (!isRecording || !mediaRecorder || mediaRecorder.state !== 'recording') {
            // console.warn("Stop recording called but not actively recording.");
            return; // Not recording or recorder not ready
        }
        console.log("Stopping MediaRecorder recording...");
        if (recordingTimeout) {
            clearTimeout(recordingTimeout); // Clear the auto-stop timeout
            recordingTimeout = null;
        }
        try {
            mediaRecorder.stop(); // This will trigger the 'onstop' event handler
            // State updates (isRecording=false, class removals) are handled in 'onstop'
        } catch (error) {
            console.error("Error stopping MediaRecorder:", error);
            // Force state cleanup in case 'onstop' doesn't fire
            isRecording = false;
            if (assistant) assistant.classList.remove('is-listening');
            if (chatVoiceBtn) chatVoiceBtn.classList.remove('is-recording');
            // Release stream tracks? Handled in onstop/onerror now.
        }
    }


    // --- API Interaction ---

    // Sends TEXT to the backend chat endpoint
    async function sendChatMessage(text, source = 'unknown') {
        console.log(`Sending text message to API [Source: ${source}]: ${text.substring(0, 50)}...`);
        stopAssistantSpeech(); // Ensure assistant isn't speaking while processing/waiting
        showProcessingIndicator(); // Show status

        try {
            const response = await fetch(`${backendUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Unknown server error" }));
                console.error(`Error fetching chat response: ${response.status} ${response.statusText}`, errorData);
                const errorMsg = errorData.error || `Request failed with status ${response.status}`;
                appendChatMessage("Assistant", `Sorry, something went wrong: ${errorMsg}`);
                // Optionally play: fetchAndPlayText(`Sorry, something went wrong: ${errorMsg}`, 'chat-error');
                // RETURN added here to prevent further processing on error
                return;
            }

            const data = await response.json();
            const replyText = data.reply_text;
            console.log("Received text reply from API:", replyText);

            if (replyText) {
                appendChatMessage("Assistant", replyText);
                // Now, fetch and play the audio version of the reply
                // We wait for fetchAndPlayText to complete before hiding the indicator
                // NOTE: fetchAndPlayText is async but we don't await it here,
                // so the indicator might hide before speech starts.
                // If precise timing is needed, fetchAndPlayText would need restructuring
                // or a callback/promise to signal completion.
                fetchAndPlayText(replyText, 'chat-reply');
            } else {
                 console.warn("Received empty reply_text from backend.");
                 appendChatMessage("Assistant", "I received an empty response. Not sure what to say!");
                 // Optionally play: fetchAndPlayText("I received an empty response. Not sure what to say!", 'chat-fallback-empty');
            }

        } catch (error) {
            console.error("Network error or issue sending chat message:", error);
            appendChatMessage("Assistant", "Sorry, I couldn't connect to the server. Please check your connection.");
            // Optionally play: fetchAndPlayText("Sorry, I couldn't connect to the server. Please check your connection.", 'chat-error-network');
        } finally {
             // Hide indicator regardless of success or error AFTER fetch attempt
             hideProcessingIndicator();
        }
    }

    // Sends AUDIO BLOB to the backend chat endpoint
    async function sendAudioToChat(audioBlob) {
        if (!audioBlob || audioBlob.size === 0) {
            console.warn("Attempted to send empty audio blob.");
            appendChatMessage("Assistant", "It seems the recording was empty. Please try speaking again.");
            // Optionally play: fetchAndPlayText("It seems the recording was empty. Please try speaking again.", 'chat-fallback-emptyblob');
            return;
        }
        console.log(`Sending audio blob to chat API, size: ${audioBlob.size}, type: ${audioBlob.type}`);
        stopAssistantSpeech(); // Ensure assistant isn't speaking
        showProcessingIndicator(); // Show status

        const formData = new FormData();
        // Determine a reasonable filename based on MIME type for the backend
        let filename = 'user_speech.webm';
        if (audioBlob.type.includes('ogg')) filename = 'user_speech.ogg';
        else if (audioBlob.type.includes('wav')) filename = 'user_speech.wav';
        // Add more as needed
        formData.append('audio_blob', audioBlob, filename);

        try {
            const response = await fetch(`${backendUrl}/api/chat`, {
                method: 'POST',
                body: formData // Body is FormData, Content-Type is set automatically by fetch for FormData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: "Unknown server error during audio processing" }));
                console.error(`Error fetching chat response for audio: ${response.status} ${response.statusText}`, errorData);
                 const errorMsg = errorData.error || `Request failed with status ${response.status}`;
                appendChatMessage("Assistant", `Sorry, I had trouble understanding the audio: ${errorMsg}`);
                // Optionally play: fetchAndPlayText(`Sorry, I had trouble understanding the audio: ${errorMsg}`, 'chat-error-audio');
                // RETURN added here
                return;
            }

            const data = await response.json();
            const replyText = data.reply_text;
            console.log("Received text reply from API (after audio submission):", replyText);

            if (replyText) {
                // Since the user spoke, we should display *their* interpreted speech first if possible?
                // The current backend doesn't return the STT result, only the Gemini reply.
                // If needed, the backend would have to return both.
                // For now, just show the assistant's reply.
                appendChatMessage("Assistant", replyText);
                // Fetch and play the audio version of the reply (see note in sendChatMessage about timing)
                fetchAndPlayText(replyText, 'chat-reply-audio');
            } else {
                console.warn("Received empty reply_text from backend after audio submission.");
                appendChatMessage("Assistant", "I processed the audio but didn't get a clear response back.");
                 // Optionally play: fetchAndPlayText("I processed the audio but didn't get a clear response back.", 'chat-fallback-empty-audio');
            }

        } catch (error) {
            console.error('Network error or issue sending chat audio:', error);
            appendChatMessage("Assistant", "Sorry, there was a network problem sending the audio. Please try again.");
             // Optionally play: fetchAndPlayText("Sorry, there was a network problem sending the audio. Please try again.", 'chat-error-network-audio');
        } finally {
             // Hide indicator regardless of success or error AFTER fetch attempt
            hideProcessingIndicator();
        }
    }


    // --- Assistant Speech Helper Functions ---

    // Fetches TTS audio for the initial greeting message
    async function fetchAndPlayGreeting() {
        if (!assistantAudio.paused) {
            console.log("Assistant is already speaking, skipping greeting.");
            return;
        }
        console.log("Fetching greeting audio...");
        // showProcessingIndicator(); // Optionally show indicator for greeting fetch
        try {
            const response = await fetch(`${backendUrl}/api/greet`, { method: 'POST' });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`Error fetching greeting: ${response.status} ${response.statusText}`, errorData);
                // Handle error - maybe display text error, don't play audio
                return; // RETURN added
            }
            const audioBlob = await response.blob();
             if (audioBlob.size > 0) {
                 playAssistantSpeech(audioBlob, 'greeting');
             } else {
                 console.error("Received empty audio blob for greeting.");
             }
        } catch (error) {
            console.error('Network error or issue fetching greeting:', error);
        } finally {
            // hideProcessingIndicator(); // Hide indicator if shown
        }
    }

    // Fetches TTS audio for arbitrary text
    async function fetchAndPlayText(text, source = 'click') {
         if (!text) {
             console.warn(`fetchAndPlayText called with empty text [Source: ${source}]`);
             return;
         }
        console.log(`Fetching text audio for [${source}]: "${text.substring(0, 30)}..."`);
        stopAssistantSpeech(); // Stop current speech before fetching new one
        // Consider showing indicator here ONLY if source is chat reply?
        // if (source.startsWith('chat-reply')) showProcessingIndicator(); // Indicator specifically for TTS fetch

        try {
            const response = await fetch(`${backendUrl}/api/speak`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`Error fetching text speech (${source}): ${response.status} ${response.statusText}`, errorData);
                // Handle error - maybe show text error in chat if applicable?
                if (source.startsWith('chat')) {
                    appendChatMessage("Assistant", `(Sorry, I couldn't speak that response: ${errorData.error || response.statusText})`);
                }
                return; // RETURN added
            }
            const audioBlob = await response.blob();
             if (audioBlob.size > 0) {
                playAssistantSpeech(audioBlob, source);
            } else {
                 console.error(`Received empty audio blob for text (${source}).`);
                 if (source.startsWith('chat')) {
                     appendChatMessage("Assistant", "(Sorry, there was an issue generating the audio for that response.)");
                 }
            }
        } catch (error) {
            console.error(`Network error or issue fetching ${source} text speech:`, error);
            if (source.startsWith('chat')) {
                appendChatMessage("Assistant", "(Network error prevented me from speaking that response.)");
            }
        } finally {
            // Hide TTS-specific indicator if it was shown
            // if (source.startsWith('chat-reply')) hideProcessingIndicator();
            // NOTE: The main processing indicator is hidden in sendChatMessage/sendAudioToChat
        }
    }

    // Plays the provided audio blob using the assistant's audio element
    function playAssistantSpeech(audioBlob, source = 'unknown') {
        stopAssistantSpeech(); // Ensure any previous playback is stopped cleanly
        try {
            const audioUrl = URL.createObjectURL(audioBlob);
            currentAudioSource = source; // Track the source
            assistantAudio.src = audioUrl;
            assistantAudio.play()
                .then(() => {
                    console.log(`Assistant playing audio [Source: ${source}], URL: ${audioUrl.substring(0, 50)}...`);
                    if (assistant) assistant.classList.add('is-speaking');
                })
                .catch(e => {
                    console.error("Error starting audio playback:", e);
                    cleanupAudio(); // Clean up if play fails
                });

            // Event listener for when playback finishes naturally
            assistantAudio.onended = () => {
                console.log(`Assistant finished speaking [Source: ${currentAudioSource}].`);
                cleanupAudio();
            };

            // Event listener for errors during playback
            assistantAudio.onerror = (e) => {
                console.error("Error during assistant audio playback:", e);
                cleanupAudio(); // Clean up on error too
            };

        } catch (error) {
            console.error("Error setting up audio playback (e.g., creating Object URL):", error);
            cleanupAudio(); // Ensure cleanup happens
        }
    }

    // Stops the assistant's audio playback and cleans up resources
    function stopAssistantSpeech() {
        if (!assistantAudio.paused) {
            console.log(`Stopping assistant speech [Source: ${currentAudioSource}].`);
            assistantAudio.pause();
            // Note: onended event might not fire reliably when paused manually,
            // so cleanup is called directly here.
        }
         // Always call cleanup to handle potential lingering states or URLs
        cleanupAudio();
    }

    // Resets audio element state and revokes object URLs
    function cleanupAudio() {
        const currentSrc = assistantAudio.src;
        if (currentSrc && currentSrc.startsWith('blob:')) {
            URL.revokeObjectURL(currentSrc);
            // console.log("Revoked Object URL:", currentSrc.substring(0, 50) + "...");
        }
        assistantAudio.removeAttribute('src'); // Remove src attribute
        assistantAudio.load(); // Reset the media element state
        currentAudioSource = null; // Clear the source tracker
        if (assistant) assistant.classList.remove('is-speaking'); // Ensure visual state is reset

         // Remove event listeners to prevent memory leaks if added dynamically (though here they are reused)
         assistantAudio.onended = null;
         assistantAudio.onerror = null;
    }

     // --- Utility and Event Listeners ---

    // Function to play a short sound effect (e.g., for clicks)
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

    // Function to trigger a random animation on the assistant
    function triggerRandomAnimation() {
        if (!assistant) return;
         const animations = ['is-waving', 'is-bouncing', 'is-spinning']; // Removed 'assistant-surprised' as it changes mouth permanently
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


    // --- Global Event Listeners Setup ---

    // 1. Start Button Listener
    if (startButton) {
        startButton.addEventListener('click', () => {
            console.log("'Start to Learn' button clicked.");
            if (assistantIsActive) return; // Prevent multiple activations

            if (assistant) assistant.classList.remove('assistant-sleeping');
            startButton.disabled = true;
            assistantIsActive = true;
            fetchAndPlayGreeting(); // Play the initial greeting sound
            // Optionally trigger an entrance animation
            // triggerRandomAnimation(); // e.g., a little wave on entry
        });
    } else {
        console.error("CRITICAL: startButton element not found. Assistant cannot be activated.");
    }

    // 2. Paragraph Click-to-Read Listeners
    if (readableParagraphs.length > 0) {
        readableParagraphs.forEach(paragraph => {
            // Highlight on hover
            paragraph.addEventListener('mouseover', () => {
                if (!assistantIsActive) return;
                paragraph.classList.add('highlighted-paragraph');
            });
            paragraph.addEventListener('mouseout', () => {
                paragraph.classList.remove('highlighted-paragraph');
            });
            // Speak on click
            paragraph.addEventListener('click', () => {
                if (!assistantIsActive) {
                    console.log("Paragraph clicked, but assistant is not active.");
                    return;
                }
                const textToSpeak = paragraph.textContent?.trim();
                if (textToSpeak) {
                    console.log("Readable paragraph clicked.");
                    fetchAndPlayText(textToSpeak, 'click');
                } else {
                     console.warn("Clicked paragraph has no text content.");
                }
            });
        });
    } else {
        console.warn("No elements found with class 'tutorial-paragraph'. Click-to-read feature inactive.");
    }

    // 3. Assistant Interaction Listeners
    if (assistant) {
        // Right-click to open chat popup
        assistant.addEventListener('contextmenu', (event) => {
            event.preventDefault(); // Prevent default browser context menu
            console.log("Assistant right-clicked.");
            if (!assistantIsActive) return;
            // Stop any ongoing recording/listening before opening chat
            if (isRecording) stopRecording();
            if (isBrowserListening) stopBrowserListening();
            // Show the chat interface
            showChatPopup();
        });

        // Left-click for fun animation
        assistant.addEventListener('click', (event) => {
             // Ensure click isn't part of a drag - might need more complex logic if drag is added
            console.log("Assistant left-clicked.");
            if (!assistantIsActive) return;

             // Don't trigger animation if chat is open? Or allow it? User choice.
             // if (chatPopup && chatPopup.style.display !== 'none') return;

             // Don't trigger if currently speaking or listening?
             // if (assistant.classList.contains('is-speaking') || assistant.classList.contains('is-listening')) return;

            triggerRandomAnimation();
        });

        // --- Drag and Drop Functionality ---
        let isDragging = false;
        let dragStartX, dragStartY, initialLeft, initialTop;

        assistant.addEventListener('mousedown', (e) => {
            // Only respond to left mouse button (button 0)
            if (e.button !== 0) return;
            // Prevent triggering text selection during drag
            e.preventDefault();

            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
             // Get initial position using computed style for robustness
            const styles = window.getComputedStyle(assistant);
            initialLeft = parseFloat(styles.left);
            initialTop = parseFloat(styles.top);
            // Add a class to indicate dragging state, e.g., for cursor style
            // assistant.classList.add('is-dragging');
             // Attach move and up listeners to the document to capture events outside the element
             document.addEventListener('mousemove', onMouseMove);
             document.addEventListener('mouseup', onMouseUp);
            console.log("Assistant drag started.");
        });

        function onMouseMove(e) {
            if (!isDragging) return;
             // Calculate the distance moved
            let dx = e.clientX - dragStartX;
            let dy = e.clientY - dragStartY;

            // Calculate new position, constrained within viewport bounds
            let newLeft = initialLeft + dx;
            let newTop = initialTop + dy;

            // Get viewport dimensions
            const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
            const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
            const assistantRect = assistant.getBoundingClientRect(); // Use current rect for width/height

            // Constrain left/right edges
            newLeft = Math.max(0, Math.min(newLeft, vw - assistantRect.width));
            // Constrain top/bottom edges
            newTop = Math.max(0, Math.min(newTop, vh - assistantRect.height));


            // Apply the new position
            assistant.style.left = newLeft + 'px';
            assistant.style.top = newTop + 'px';
        }

        function onMouseUp(e) {
            if (e.button !== 0 || !isDragging) return; // Only react to left button mouseup when dragging

            isDragging = false;
            // assistant.classList.remove('is-dragging');
            // Remove the global listeners
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            console.log("Assistant drag ended.");
        }
         // Prevent default drag behavior which can interfere
         assistant.addEventListener('dragstart', (e) => e.preventDefault());


    } else {
        console.error("CRITICAL: assistant element not found. Core functionality unavailable.");
    }

    // 4. Window Unload Listener
    window.addEventListener('beforeunload', () => {
        console.log("Window unloading. Cleaning up resources...");
        stopAssistantSpeech();
        if (isRecording) {
            // Note: Stopping MediaRecorder might be asynchronous and may not complete
            // before the page unloads fully. Best effort cleanup.
            stopRecording();
        }
         if (isBrowserListening) {
            stopBrowserListening();
        }
        // Revoke any lingering object URLs (though cleanupAudio should handle most)
        if (assistantAudio && assistantAudio.src && assistantAudio.src.startsWith('blob:')) {
             URL.revokeObjectURL(assistantAudio.src);
        }
        // Hide processing indicator on unload
        hideProcessingIndicator();
    });

    console.log("Script initialization finished.");
}); // End of DOMContentLoaded

console.log("script.js file parsed (DOMContentLoaded listener attached).");