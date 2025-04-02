import os
from dotenv import load_dotenv

# Load environment variables from .env file located in the project root
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env') # Go up one level from server/
load_dotenv(dotenv_path=dotenv_path)

# --- Environment Detection ---
# Determine the environment (e.g., 'development', 'production')
# Default to 'development' if not set
FLASK_ENV = os.getenv('FLASK_ENV', 'development')
IS_PRODUCTION = FLASK_ENV == 'production'
DEBUG_MODE = not IS_PRODUCTION

# --- API Keys ---
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GOOGLE_APPLICATION_CREDENTIALS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") # Path to service account key

# --- Google Cloud Settings ---
# Fallback credentials path (relative to project root)
# Use sparingly, prefer GOOGLE_APPLICATION_CREDENTIALS env var
DEFAULT_CREDENTIALS_PATH_RELATIVE = "chitti-452110-92aed650ac65.json" # Adjust if needed
DEFAULT_CREDENTIALS_PATH_ABSOLUTE = os.path.join(os.path.dirname(dotenv_path), DEFAULT_CREDENTIALS_PATH_RELATIVE)

# TTS Configuration
TTS_LANGUAGE_CODE = "en-US"
# Consider making voice name configurable via env var too
TTS_VOICE_NAME = "en-US-Wavenet-F" # or "en-US-Standard-F"
TTS_AUDIO_ENCODING = "MP3" # 'MP3' or 'LINEAR16' etc.

# STT Configuration
STT_LANGUAGE_CODE = "en-US"
STT_ENABLE_PUNCTUATION = True

# --- Gemini AI Settings ---
GEMINI_MODEL_NAME = "gemini-1.5-pro"
GEMINI_SYSTEM_INSTRUCTION = "You are a helpful assistant that provides detailed, reasoned responses. Please provide thoughtful and well-explained answers to user queries in not more than 50 words."
# Generation parameters - could also be environment variables if needed
GENERATION_CONFIG = {
    "temperature": 1,
    "top_p": 0.95,
    "top_k": 40,
    "max_output_tokens": 8192, # Be mindful of cost/limits
    "response_mime_type": "text/plain",
}

# --- Flask & CORS Settings ---
SERVER_PORT = int(os.getenv('PORT', 5001)) # Use PORT env var if available (common for deployment)
SERVER_HOST = '0.0.0.0' if IS_PRODUCTION else '127.0.0.1'

# Configure CORS origins based on environment
if IS_PRODUCTION:
    # Be restrictive in production! List specific allowed frontend domains.
    # Example: CORS_ORIGINS = ["https://your-frontend-domain.com"]
    CORS_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "*").split(',') # Allow specific origins via env var, fallback to '*' cautiously
    print(f"INFO: Production CORS Origins: {CORS_ORIGINS}")
else:
    # Allow typical development server origins
    CORS_ORIGINS = ["http://127.0.0.1:5500", "http://localhost:5500"] # Add others if needed (e.g., different ports)
    print(f"INFO: Development CORS Origins: {CORS_ORIGINS}")


# --- Validation and Logging ---
def validate_config():
    """Performs basic validation of critical configurations."""
    valid = True
    if not GEMINI_API_KEY:
        print("FATAL ERROR: GEMINI_API_KEY not found in environment variables or .env file.")
        valid = False

    # Check if Google credentials are likely available
    if not GOOGLE_APPLICATION_CREDENTIALS and not os.path.exists(DEFAULT_CREDENTIALS_PATH_ABSOLUTE):
         print("WARNING: GOOGLE_APPLICATION_CREDENTIALS environment variable not set, and default credentials file not found.")
         print(f"         Attempting default application credentials, but specific service account is recommended.")
         # This isn't fatal, as default creds *might* work, but warn the user.
    elif GOOGLE_APPLICATION_CREDENTIALS and not os.path.exists(GOOGLE_APPLICATION_CREDENTIALS):
         print(f"WARNING: GOOGLE_APPLICATION_CREDENTIALS is set to '{GOOGLE_APPLICATION_CREDENTIALS}', but the file does not exist.")
         # Also not fatal, default creds might still work.
    return valid

print(f"INFO: Running in {FLASK_ENV} mode.")
if not validate_config() and IS_PRODUCTION:
     # Optional: Force exit in production if critical config is missing
     # print("ERROR: Exiting due to missing critical configuration in production.")
     # exit(1)
     pass # Allow running even with missing config for now, but logged errors/warnings

