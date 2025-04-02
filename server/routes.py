import traceback
from flask import Blueprint, jsonify, make_response, request, render_template, abort
from google.cloud import speech # For encoding enums
from . import clients # Import initialized clients and functions
from . import config # Import configuration

# Create a Blueprint for API routes
api_bp = Blueprint('api', __name__, url_prefix='/api')

# --- Helper Functions ---

def make_error_response(message, status_code):
    """Creates a standardized JSON error response."""
    print(f"ERROR ({status_code}): {message}") # Log the error server-side
    response = jsonify({"error": message})
    response.status_code = status_code
    return response

def get_stt_encoding(mimetype, filename):
    """Determines the STT encoding enum based on MIME type or filename."""
    encoding = speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED

    if mimetype:
        mimetype_lower = mimetype.lower()
        if 'webm' in mimetype_lower and ('opus' in mimetype_lower or 'vorbis' in mimetype_lower): # Handle webm variations
             encoding = speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
        elif 'ogg' in mimetype_lower and ('opus' in mimetype_lower or 'vorbis' in mimetype_lower): # Handle ogg variations
             encoding = speech.RecognitionConfig.AudioEncoding.OGG_OPUS
        elif 'wav' in mimetype_lower:
             encoding = speech.RecognitionConfig.AudioEncoding.LINEAR16 # Common assumption for WAV
        elif 'mp3' in mimetype_lower:
             encoding = speech.RecognitionConfig.AudioEncoding.MP3
        elif 'flac' in mimetype_lower:
             encoding = speech.RecognitionConfig.AudioEncoding.FLAC
        # Add more supported types from https://cloud.google.com/speech-to-text/docs/encoding
        # e.g., AMR, AMR_WB, MULAW, SPEEX_WITH_HEADER_BYTE

    # Fallback to filename if mimetype didn't determine encoding
    if encoding == speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED and filename:
        filename_lower = filename.lower()
        if filename_lower.endswith('.webm'):
            encoding = speech.RecognitionConfig.AudioEncoding.WEBM_OPUS
        elif filename_lower.endswith(('.ogg', '.opus')):
             encoding = speech.RecognitionConfig.AudioEncoding.OGG_OPUS
        elif filename_lower.endswith('.wav'):
             encoding = speech.RecognitionConfig.AudioEncoding.LINEAR16
        elif filename_lower.endswith('.mp3'):
             encoding = speech.RecognitionConfig.AudioEncoding.MP3
        elif filename_lower.endswith('.flac'):
             encoding = speech.RecognitionConfig.AudioEncoding.FLAC

    if encoding == speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED:
        print(f"WARNING: Could not determine audio encoding from mimetype ('{mimetype}') or filename ('{filename}'). Using ENCODING_UNSPECIFIED.")
        # Depending on requirements, might want to return an error instead

    return encoding


# --- API Endpoints ---

@api_bp.route('/greet', methods=['POST'])
def get_greeting_speech():
    """Endpoint to get synthesized speech for a standard greeting."""
    if not clients.tts_client:
        return make_error_response("Backend TTS service not available", 503) # Service Unavailable
    try:
        # Consider making the greeting text configurable
        greeting_text = "Hello! I'm active now. Click on any paragraph to hear it read aloud, or right-click me to chat."
        audio_content, content_type = clients.synthesize_text(greeting_text)

        flask_response = make_response(audio_content)
        flask_response.headers['Content-Type'] = content_type
        return flask_response
    except ConnectionError as e: # Catch error from synthesize_text if client was missing
         return make_error_response(str(e), 503)
    except Exception as e:
        # Log the full error for debugging
        print(f"ERROR in /api/greet: {e}")
        traceback.print_exc()
        return make_error_response(f"TTS Synthesis failed: {str(e)}", 500) # Internal Server Error

@api_bp.route('/speak', methods=['POST'])
def speak_text():
    """Endpoint to synthesize speech for provided text."""
    if not clients.tts_client:
        return make_error_response("Backend TTS service not available", 503)

    data = request.get_json()
    if not data or 'text' not in data:
        return make_error_response("Missing 'text' in request body", 400) # Bad Request

    text_to_speak = data['text'].strip()
    if not text_to_speak:
        return make_error_response("'text' cannot be empty", 400)

    try:
        audio_content, content_type = clients.synthesize_text(text_to_speak)
        flask_response = make_response(audio_content)
        flask_response.headers['Content-Type'] = content_type
        return flask_response
    except ConnectionError as e:
         return make_error_response(str(e), 503)
    except Exception as e:
        print(f"ERROR in /api/speak: {e}")
        traceback.print_exc()
        return make_error_response(f"TTS Synthesis failed: {str(e)}", 500)

@api_bp.route('/chat', methods=['POST'])
def handle_chat():
    """Handles chat requests (text or audio) and interacts with STT/Gemini."""
    user_text = None
    stt_transcript = None # Store the actual STT result separately
    is_audio_input = False

    # Scenario 1: Text input via JSON
    if request.is_json:
        data = request.get_json()
        if data and 'text' in data:
            user_text = data['text'].strip()
            if not user_text:
                return make_error_response("'text' cannot be empty", 400)
            print(f"INFO: Received text query: '{user_text[:100]}...'")
        else:
            return make_error_response("Invalid JSON or missing 'text' field", 400)

    # Scenario 2: Audio input via FormData
    elif 'audio_blob' in request.files:
        is_audio_input = True
        if not clients.speech_client:
            return make_error_response("Backend STT service not available", 503)

        audio_file = request.files['audio_blob']
        audio_content = audio_file.read()
        print(f"INFO: Received audio blob, size: {len(audio_content)} bytes, filename: {audio_file.filename}, mimetype: {audio_file.mimetype}")

        if len(audio_content) == 0:
            return make_error_response("Received empty audio file", 400)

        # Determine encoding
        encoding = get_stt_encoding(audio_file.mimetype, audio_file.filename)
        if encoding == speech.RecognitionConfig.AudioEncoding.ENCODING_UNSPECIFIED:
            # Decide whether to reject or proceed with UNSPECIFIED
             return make_error_response("Could not determine audio encoding. Please provide WEBM/Opus, OGG/Opus, WAV, MP3, or FLAC.", 415) # Unsupported Media Type


        try:
            stt_transcript = clients.recognize_speech(audio_content, encoding)
            if stt_transcript:
                user_text = stt_transcript # Use transcript as input for Gemini
            else:
                 # Handle no speech detected or empty transcript - send a specific message to Gemini
                 user_text = "[No speech detected or transcription empty]"
                 print("WARN: STT returned no usable transcript.")

        except ConnectionError as e:
             return make_error_response(str(e), 503)
        except Exception as e:
            print(f"ERROR during STT processing in /api/chat: {e}")
            traceback.print_exc()
            # Send a generic error message to Gemini in this case
            user_text = "[Speech recognition error occurred]"
            # Optionally return an error directly to the user instead:
            # return make_error_response(f"STT processing failed: {str(e)}", 500)

    # Scenario 3: Neither JSON nor audio_blob provided
    else:
        return make_error_response("Request must contain JSON with 'text' or an 'audio_blob' file part", 400)

    # --- Call Gemini API ---
    if not clients.chat_session:
        return make_error_response("Chat service (Gemini) is not available.", 503)

    reply_text = "Sorry, I encountered an issue generating a response." # Default
    try:
        # Send the derived user_text (either original text, STT result, or error placeholder)
        reply_text = clients.send_to_gemini(user_text)

        # Prepare response - include STT transcript if audio was input
        response_data = {"reply_text": reply_text}
        if is_audio_input:
            response_data["stt_transcript"] = stt_transcript # Include what the STT heard (even if None)

        return jsonify(response_data)

    except ConnectionError as e:
        return make_error_response(str(e), 503) # Gemini unavailable
    except ValueError as e: # Specific errors from send_to_gemini (e.g., blocked)
         print(f"WARN: Gemini refused request or returned empty: {e}")
         # Return a user-friendly message reflecting the issue
         # Avoid echoing the exact internal error message to the client
         return make_error_response("I cannot provide a response to that query.", 400) # Bad request (e.g., inappropriate content)
    except Exception as e: # Catch other unexpected errors from Gemini call
        print(f"ERROR during Gemini API call in /api/chat: {e}")
        traceback.print_exc()
        # Use a generic error message
        return make_error_response("Sorry, I had trouble processing that request. Please try again.", 500)


# Create a Blueprint for serving HTML files (non-API routes)
html_bp = Blueprint('html', __name__)

# --- HTML Serving Routes ---

@html_bp.route('/')
def index():
    """Serves the main index.html page."""
    return render_template('index.html')

@html_bp.route('/chapter<int:chapter_num>')
def chapter(chapter_num):
    """Serves chapter pages (chapter1.html, chapter2.html, etc.)."""
    # Validate chapter number if necessary (e.g., ensure it's within a known range)
    valid_chapters = [1, 2, 3, 4] # Example list
    if chapter_num not in valid_chapters:
        abort(404) # Not Found if chapter doesn't exist

    template_name = f'chapter{chapter_num}.html'
    # render_template automatically looks in the 'templates' folder
    return render_template(template_name)

# You could add more specific routes if needed, e.g., /about, /contact

