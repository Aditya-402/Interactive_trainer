import os
from flask import Flask, jsonify, make_response, request
from google.cloud import texttospeech
from google.cloud import speech
from flask_cors import CORS
import traceback  # For detailed error logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import and configure Gemini API
import google.generativeai as genai
gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key:
    print("FATAL ERROR: GEMINI_API_KEY not found in environment variables.")
    # Optionally, exit or raise an error if the key is critical for startup
    # exit(1) # Uncomment to force exit if key is missing
else:
    genai.configure(api_key=gemini_api_key)

# Configure the Gemini generation parameters
generation_config = {
    "temperature": 1,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 8192,
    "response_mime_type": "text/plain",
}

# Create the Gemini model and start a chat session.
# We initialize the conversation with a system prompt to encourage detailed reasoning.
model = None
chat_session = None
try:
    if gemini_api_key: # Only initialize if API key was found
        model = genai.GenerativeModel(
            model_name="gemini-1.5-pro",
            generation_config=generation_config,
            system_instruction="You are a helpful assistant that provides detailed, reasoned responses. Please provide thoughtful and well-explained answers to user queries in not more than 50 words."
        )
        chat_session = model.start_chat(history=[
        ])
        print("Gemini Model and Chat Session initialized successfully.")
    else:
        print("Skipping Gemini initialization due to missing API key.")
except Exception as e:
    print(f"ERROR initializing Gemini Model: {e}")
    traceback.print_exc()


app = Flask(__name__)
# Allow requests specifically from your frontend's origin during development
CORS(app, resources={r"/api/*": {"origins": "http://127.0.0.1:5500"}})

# --- Initialize Google Cloud Clients ---
# Use environment variable first, then hardcoded path as fallback
credentials_path_env = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
credentials_path_hardcoded = r"chitti-452110-92aed650ac65.json" # Adjust as needed

tts_client = None
speech_client = None
try:
    print("Attempting to load Google Cloud credentials...")
    if credentials_path_env and os.path.exists(credentials_path_env):
        print(f"Using credentials from GOOGLE_APPLICATION_CREDENTIALS: {credentials_path_env}")
        tts_client = texttospeech.TextToSpeechClient()
        speech_client = speech.SpeechClient()
    elif os.path.exists(credentials_path_hardcoded):
         print(f"GOOGLE_APPLICATION_CREDENTIALS not set or invalid. Using credentials from hardcoded path: {credentials_path_hardcoded}")
         tts_client = texttospeech.TextToSpeechClient.from_service_account_json(credentials_path_hardcoded)
         speech_client = speech.SpeechClient.from_service_account_json(credentials_path_hardcoded)
    else:
         print("No valid credentials found via environment variable or hardcoded path. Attempting default application credentials.")
         # This might work if running on GCP or if gcloud auth application-default login was used
         tts_client = texttospeech.TextToSpeechClient()
         speech_client = speech.SpeechClient()

    # Test credentials by making a small, inexpensive call if needed (optional)
    # e.g., list voices for TTS
    # tts_client.list_voices()
    print("Google TTS Client initialized successfully.")
    print("Google Speech Client initialized successfully.")
except Exception as e:
    print(f"FATAL Error initializing Google Cloud Client: {e}")
    print(traceback.format_exc())
    print("Please ensure credentials are set correctly (GOOGLE_APPLICATION_CREDENTIALS env var, hardcoded path, or gcloud default).")
    if tts_client is None: print("TTS Client FAILED initialization.")
    if speech_client is None: print("Speech Client FAILED initialization.")
    # Depending on criticality, you might want to prevent the app from running
    # exit(1)

# --- Voice & Audio Configuration ---
voice_params = texttospeech.VoiceSelectionParams(
    language_code="en-US",
    name="en-US-Wavenet-F" # Example Wavenet voice
    # You might want to try standard voices if Wavenet causes issues or cost concerns
    # name="en-US-Standard-F"
)
audio_config_tts = texttospeech.AudioConfig(
    audio_encoding=texttospeech.AudioEncoding.MP3
)
stt_language_code = "en-US"

def synthesize_text(text):
    """Synthesizes speech from the input string of text."""
    if not tts_client:
         print("ERROR: synthesize_text called but TTS Client is not initialized.")
         raise Exception("TTS Client not initialized")

    print(f"Synthesizing text: '{text[:50]}...'")
    synthesis_input = texttospeech.SynthesisInput(text=text)

    try:
        response = tts_client.synthesize_speech(
            input=synthesis_input, voice=voice_params, audio_config=audio_config_tts
        )
        print("TTS synthesis successful.")
        return response.audio_content
    except Exception as e:
        print(f"Error during TTS synthesis: {e}")
        print(traceback.format_exc())
        raise # Re-raise the exception to be caught by the endpoint handler

# --- API Endpoint for Greeting ---
@app.route('/api/greet', methods=['POST'])
def get_greeting_speech():
    if not tts_client:
         print("ERROR in /api/greet: TTS Client not available")
         return jsonify({"error": "Backend TTS service not available"}), 503
    try:
        greeting_text = "Hello! I'm active now. Click on any paragraph to hear it read aloud, or right-click me to chat."
        audio_content = synthesize_text(greeting_text)
        flask_response = make_response(audio_content)
        flask_response.headers['Content-Type'] = 'audio/mpeg'
        return flask_response
    except Exception as e:
        print(f"ERROR in /api/greet: {e}")
        # traceback.print_exc() # Already printed in synthesize_text if it failed there
        return jsonify({"error": f"TTS Synthesis failed: {str(e)}"}), 500

# --- API Endpoint for Specific Text (Paragraph Click) ---
@app.route('/api/speak', methods=['POST'])
def speak_text():
    if not tts_client:
         print("ERROR in /api/speak: TTS Client not available")
         return jsonify({"error": "Backend TTS service not available"}), 503
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            print("ERROR in /api/speak: Missing 'text' in request")
            return jsonify({"error": "Missing 'text' in request body"}), 400

        text_to_speak = data['text'].strip()
        if not text_to_speak:
             print("ERROR in /api/speak: 'text' is empty")
             return jsonify({"error": "'text' cannot be empty"}), 400

        audio_content = synthesize_text(text_to_speak)
        flask_response = make_response(audio_content)
        flask_response.headers['Content-Type'] = 'audio/mpeg'
        return flask_response
    except Exception as e:
        print(f"ERROR in /api/speak: {e}")
        # traceback.print_exc() # Already printed in synthesize_text if it failed there
        return jsonify({"error": f"TTS Synthesis failed: {str(e)}"}), 500

# --- API Endpoint for Chat ---
@app.route('/api/chat', methods=['POST'])
def handle_chat():
    # Check if Gemini is available first
    if not chat_session:
        print("ERROR in /api/chat: Gemini chat session not initialized.")
        return jsonify({"error": "Chat service (Gemini) is not available."}), 503

    user_text = None
    stt_failed_or_empty = False

    # Scenario 1: Text input via JSON
    if request.is_json:
        data = request.get_json()
        if data and 'text' in data:
            user_text = data['text'].strip()
            if not user_text:
                print("ERROR in /api/chat (JSON): 'text' cannot be empty")
                return jsonify({"error": "'text' cannot be empty"}), 400
            print(f"Received text query: '{user_text}'")
        else:
             print("ERROR in /api/chat (JSON): Invalid JSON or missing 'text' field")
             return jsonify({"error": "Invalid JSON or missing 'text' field"}), 400

    # Scenario 2: Audio input via FormData
    elif 'audio_blob' in request.files:
        if not speech_client:
            print("ERROR in /api/chat (audio): Speech Client not available")
            return jsonify({"error": "Backend STT service not available"}), 503

        audio_file = request.files['audio_blob']
        audio_content = audio_file.read()
        print(f"Received audio blob via /api/chat, size: {len(audio_content)} bytes, filename: {audio_file.filename}, mimetype: {audio_file.mimetype}")

        if len(audio_content) == 0:
            print("ERROR in /api/chat (audio): Received empty audio file")
            return jsonify({"error": "Received empty audio file"}), 400

        # Determine encoding based on MIME type or filename extension
        encoding = speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED
        # Prefer mimetype if available and informative
        if audio_file.mimetype:
            if 'webm' in audio_file.mimetype and 'opus' in audio_file.mimetype:
                 encoding = speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
            elif 'ogg' in audio_file.mimetype and 'opus' in audio_file.mimetype:
                 encoding = speech.RecognitionConfig.AudioEncoding.OGG_OPUS
            elif 'wav' in audio_file.mimetype:
                 encoding = speech.RecognitionConfig.AudioEncoding.LINEAR16 # Assuming WAV is Linear16
            elif 'mp3' in audio_file.mimetype:
                 encoding = speech.RecognitionConfig.AudioEncoding.MP3
            # Add more mimetypes as needed
        # Fallback to filename if mimetype wasn't useful
        if encoding == speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED and audio_file.filename:
             if audio_file.filename.lower().endswith('.webm'):
                 encoding = speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
             elif audio_file.filename.lower().endswith('.ogg'):
                 encoding = speech.RecognitionConfig.AudioEncoding.OGG_OPUS
             elif audio_file.filename.lower().endswith('.wav'):
                 encoding = speech.RecognitionConfig.AudioEncoding.LINEAR16
             elif audio_file.filename.lower().endswith('.mp3'):
                 encoding = speech.RecognitionConfig.AudioEncoding.MP3

        if encoding == speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED:
             print("WARNING in /api/chat (audio): Could not determine audio encoding from mimetype or filename. Using ENCODING_UNSPECIFIED.")
             # Consider returning an error or making a best guess
             # return jsonify({"error": "Could not determine audio encoding. Please provide WEBM/Opus or OGG/Opus."}), 400

        recognition_config = speech.RecognitionConfig(
            encoding=encoding,
            language_code=stt_language_code,
            enable_automatic_punctuation=True,
            # Consider adding model="latest_long" or other options if needed
        )
        recognition_audio = speech.RecognitionAudio(content=audio_content)

        stt_response_text = "[STT Failed or No Speech Detected]"
        try:
            print(f"Sending audio to Google STT (Encoding: {encoding.name})...")
            stt_response = speech_client.recognize(config=recognition_config, audio=recognition_audio)
            print("Received STT response.")
            if stt_response.results and stt_response.results[0].alternatives:
                user_text = stt_response.results[0].alternatives[0].transcript.strip()
                if not user_text:
                    print("STT Result was empty after stripping whitespace.")
                    stt_response_text = "[Empty Transcription]"
                    stt_failed_or_empty = True
                else:
                    stt_response_text = user_text # Keep for logging
                    print(f"STT Result: '{stt_response_text}'")
            else:
                print("STT Response contained no results (No speech detected?).")
                stt_response_text = "[No Speech Detected]"
                stt_failed_or_empty = True
        except Exception as e:
            print(f"ERROR during STT recognition: {e}")
            traceback.print_exc()
            stt_response_text = "[STT Error]"
            stt_failed_or_empty = True

        # If STT failed or produced no text, use the placeholder message for Gemini
        if stt_failed_or_empty:
            user_text = stt_response_text

    # Scenario 3: Neither JSON nor audio_blob provided
    else:
         print("ERROR in /api/chat: Request is not JSON and 'audio_blob' file part is missing.")
         return jsonify({"error": "Request must contain JSON with 'text' or an 'audio_blob' file part"}), 400

    # --- Call Gemini API ---
    reply_text = "Sorry, I encountered an issue generating a response." # Default error reply
    try:
        # Only send to Gemini if we have some user text (even if it's an STT error message)
        if user_text:
            print(f"Sending to Gemini: '{user_text[:100]}...'")
            # Make sure chat_session is valid before sending
            if chat_session:
                gemini_response = chat_session.send_message(user_text)
                # Add basic check for response safety/blockage if needed
                if gemini_response.parts:
                    reply_text = gemini_response.text # .text combines parts automatically
                    print(f"Gemini API generated reply: {reply_text}")
                else:
                    # Handle cases where the response might have been blocked
                    print("WARN: Gemini response was empty or potentially blocked.")
                    # Access prompt_feedback if needed: print(gemini_response.prompt_feedback)
                    reply_text = "I cannot provide a response to that query."
            else:
                 print("ERROR: Cannot send message, Gemini chat session is not initialized.")
                 # Reply text remains the default error message
        else:
             # This case should theoretically not be reached due to prior checks
             print("ERROR: No user_text available to send to Gemini.")
             reply_text = "Sorry, I didn't receive any input to process."

    except Exception as e:
        print(f"ERROR during Gemini API call: {e}")
        traceback.print_exc()
        reply_text = "Sorry, I had trouble thinking about that. Could you please try again?"

    # Return the text reply from Gemini (or error message)
    return jsonify({"reply_text": reply_text})

# --- Run the Flask Development Server ---
if __name__ == '__main__':
    # Check if clients are initialized before starting
    if tts_client and speech_client and chat_session:
        print("All clients initialized successfully.")
    else:
        print("WARNING: One or more clients (TTS, Speech, Gemini) failed to initialize. Some functionality may be unavailable.")

    print("Starting Flask server...")
    # Use host='0.0.0.0' to make it accessible on the network if needed,
    # otherwise default '127.0.0.1' is fine for local development.
    app.run(debug=True, port=5001) # debug=True is helpful for development