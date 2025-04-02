import os
import traceback
from google.cloud import texttospeech
from google.cloud import speech
import google.generativeai as genai
from . import config # Use relative import within the package

# --- Initialize Google Cloud Clients ---
tts_client = None
speech_client = None

try:
    print("INFO: Attempting to initialize Google Cloud clients...")
    # Determine credentials path - prioritize environment variable
    credentials_path = config.GOOGLE_APPLICATION_CREDENTIALS
    use_default_creds = False

    if credentials_path and os.path.exists(credentials_path):
        print(f"INFO: Using credentials from GOOGLE_APPLICATION_CREDENTIALS: {credentials_path}")
        tts_client = texttospeech.TextToSpeechClient.from_service_account_json(credentials_path)
        speech_client = speech.SpeechClient.from_service_account_json(credentials_path)
    elif os.path.exists(config.DEFAULT_CREDENTIALS_PATH_ABSOLUTE):
        credentials_path = config.DEFAULT_CREDENTIALS_PATH_ABSOLUTE
        print(f"WARNING: GOOGLE_APPLICATION_CREDENTIALS not set or invalid. Using default credentials file: {credentials_path}")
        tts_client = texttospeech.TextToSpeechClient.from_service_account_json(credentials_path)
        speech_client = speech.SpeechClient.from_service_account_json(credentials_path)
    else:
        print("WARNING: No specific credentials file found. Attempting Application Default Credentials (ADC).")
        print("         Ensure ADC are configured (e.g., `gcloud auth application-default login`) or running in a GCP environment.")
        use_default_creds = True
        # This will raise google.auth.exceptions.DefaultCredentialsError if ADC are not found
        tts_client = texttospeech.TextToSpeechClient()
        speech_client = speech.SpeechClient()

    # Optional: Test credentials with a lightweight call (e.g., list voices)
    # print("INFO: Testing TTS client credentials...")
    # tts_client.list_voices(language_code='en-US')
    # print("INFO: TTS client test successful.")
    # print("INFO: Testing Speech client credentials...")
    # # speech_client.some_lightweight_call() # Find an appropriate lightweight call if needed
    # print("INFO: Speech client test successful.")

    print("INFO: Google TTS and Speech Clients initialized successfully.")

except Exception as e:
    print(f"FATAL ERROR initializing Google Cloud Clients: {e}")
    print(traceback.format_exc())
    print("        Check credentials configuration (GOOGLE_APPLICATION_CREDENTIALS, default file path, or Application Default Credentials).")
    # Keep clients as None, routes should handle this
    tts_client = None
    speech_client = None

# --- Initialize Gemini Client ---
model = None
chat_session = None

if config.GEMINI_API_KEY:
    try:
        print("INFO: Configuring Gemini API...")
        genai.configure(api_key=config.GEMINI_API_KEY)

        print("INFO: Initializing Gemini Model...")
        model = genai.GenerativeModel(
            model_name=config.GEMINI_MODEL_NAME,
            generation_config=config.GENERATION_CONFIG,
            system_instruction=config.GEMINI_SYSTEM_INSTRUCTION
        )

        print("INFO: Starting Gemini Chat Session...")
        # Initialize with an empty history for now
        chat_session = model.start_chat(history=[])
        print("INFO: Gemini Model and Chat Session initialized successfully.")

    except Exception as e:
        print(f"ERROR initializing Gemini Client: {e}")
        print(traceback.format_exc())
        # Keep model and chat_session as None
        model = None
        chat_session = None
else:
    print("WARNING: GEMINI_API_KEY not found. Gemini features will be unavailable.")

# --- TTS Synthesis Function ---
def synthesize_text(text):
    """Synthesizes speech from the input string of text using the initialized client."""
    if not tts_client:
        print("ERROR: synthesize_text called but TTS Client is not initialized.")
        raise ConnectionError("TTS Client not available") # Use a more specific error

    print(f"INFO: Synthesizing text: '{text[:50]}...'")
    synthesis_input = texttospeech.SynthesisInput(text=text)

    # Determine TTS audio encoding from config
    if config.TTS_AUDIO_ENCODING.upper() == 'MP3':
        audio_encoding_enum = texttospeech.AudioEncoding.MP3
        content_type = 'audio/mpeg'
    elif config.TTS_AUDIO_ENCODING.upper() == 'LINEAR16':
        audio_encoding_enum = texttospeech.AudioEncoding.LINEAR16
        content_type = 'audio/wav' # Or audio/l16; rate=... if needed
    # Add other encodings as needed
    else:
         print(f"WARNING: Unsupported TTS_AUDIO_ENCODING '{config.TTS_AUDIO_ENCODING}'. Defaulting to MP3.")
         audio_encoding_enum = texttospeech.AudioEncoding.MP3
         content_type = 'audio/mpeg'


    voice_params_tts = texttospeech.VoiceSelectionParams(
        language_code=config.TTS_LANGUAGE_CODE,
        name=config.TTS_VOICE_NAME
    )
    audio_config_tts = texttospeech.AudioConfig(
        audio_encoding=audio_encoding_enum
        # Add sample_rate_hertz if needed, especially for LINEAR16
    )

    try:
        response = tts_client.synthesize_speech(
            input=synthesis_input, voice=voice_params_tts, audio_config=audio_config_tts
        )
        print("INFO: TTS synthesis successful.")
        return response.audio_content, content_type
    except Exception as e:
        print(f"ERROR: Error during TTS synthesis: {e}")
        print(traceback.format_exc())
        raise # Re-raise the exception to be caught by the endpoint handler

# --- STT Recognition Function ---
def recognize_speech(audio_content, encoding):
    """Performs speech recognition on the provided audio content."""
    if not speech_client:
        print("ERROR: recognize_speech called but Speech Client is not initialized.")
        raise ConnectionError("Speech Client not available")

    print(f"INFO: Sending audio to Google STT (Encoding: {encoding.name})...")
    recognition_config = speech.RecognitionConfig(
        encoding=encoding,
        language_code=config.STT_LANGUAGE_CODE,
        enable_automatic_punctuation=config.STT_ENABLE_PUNCTUATION,
        # Consider adding model="latest_long" or other options if needed
    )
    recognition_audio = speech.RecognitionAudio(content=audio_content)

    try:
        stt_response = speech_client.recognize(config=recognition_config, audio=recognition_audio)
        print("INFO: Received STT response.")

        transcript = None
        confidence = 0.0 # Default confidence

        if stt_response.results and stt_response.results[0].alternatives:
            best_alternative = stt_response.results[0].alternatives[0]
            transcript = best_alternative.transcript.strip()
            confidence = best_alternative.confidence

            if not transcript:
                print("INFO: STT Result was empty after stripping whitespace.")
                transcript = None # Treat empty transcript as no result
            else:
                 print(f"INFO: STT Result: '{transcript}' (Confidence: {confidence:.2f})")
        else:
            print("INFO: STT Response contained no results (No speech detected?).")

        return transcript # Return transcript (or None)

    except Exception as e:
        print(f"ERROR: Error during STT recognition: {e}")
        print(traceback.format_exc())
        raise # Re-raise the exception

# --- Gemini Chat Function ---
def send_to_gemini(user_text):
    """Sends text to the initialized Gemini chat session and returns the reply."""
    if not chat_session:
        print("ERROR: send_to_gemini called but Gemini chat session not initialized.")
        raise ConnectionError("Chat service (Gemini) is not available.")

    if not user_text:
        print("WARN: send_to_gemini called with empty user_text.")
        # Decide how to handle this - raise error or return default?
        raise ValueError("Cannot send empty message to Gemini")

    print(f"INFO: Sending to Gemini: '{user_text[:100]}...'")
    try:
        gemini_response = chat_session.send_message(user_text)

        # Check for safety/blockage
        if gemini_response.parts:
            reply_text = gemini_response.text # .text combines parts
            print(f"INFO: Gemini API generated reply: {reply_text[:100]}...")
            return reply_text
        else:
            # Handle blocked response
            print("WARN: Gemini response was empty or potentially blocked.")
            # You could inspect gemini_response.prompt_feedback for reasons
            # print(f"DEBUG: Gemini prompt feedback: {gemini_response.prompt_feedback}")
            raise ValueError("Gemini response blocked or empty") # Raise specific error

    except Exception as e:
        print(f"ERROR: Error during Gemini API call: {e}")
        # Don't print full traceback here unless debugging, higher level should catch
        # traceback.print_exc()
        # Re-raise a potentially more specific error if possible
        raise ConnectionError(f"Gemini API call failed: {e}")

