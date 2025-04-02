import os
from flask import Flask
from flask_cors import CORS
from . import config # Import unified configuration
from .routes import api_bp, html_bp # Import blueprints

def create_app():
    """Factory function to create and configure the Flask application."""
    app = Flask(__name__,
                template_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates'), # Point to root/templates
                static_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), 'static') # Point to root/static
                )

    # --- Configuration ---
    # Basic Flask settings from config
    app.config['DEBUG'] = config.DEBUG_MODE
    # Add any other Flask specific config if needed (e.g., SECRET_KEY for sessions)
    # app.config['SECRET_KEY'] = config.FLASK_SECRET_KEY

    print(f"INFO: Flask App Paths - Templates: {app.template_folder}, Static: {app.static_folder}")


    # --- CORS ---
    # Apply CORS settings based on config
    CORS(app, resources={r"/api/*": {"origins": config.CORS_ORIGINS}})
    print(f"INFO: CORS enabled for /api/* origins: {config.CORS_ORIGINS}")

    # --- Blueprints ---
    # Register API and HTML routes
    app.register_blueprint(api_bp)
    app.register_blueprint(html_bp)
    print("INFO: Registered API and HTML blueprints.")

    # --- Check Client Initialization ---
    # (Optional) Add a startup check or health endpoint later if needed
    # to confirm external clients are connected. For now, rely on logs.
    from . import clients # Import here to check status after init
    if not clients.tts_client: print("STARTUP WARNING: TTS Client is not initialized.")
    if not clients.speech_client: print("STARTUP WARNING: Speech Client is not initialized.")
    if not clients.chat_session: print("STARTUP WARNING: Gemini Chat Session is not initialized.")


    return app

# --- Main Execution ---
if __name__ == '__main__':
    # Validate essential config before trying to run
    if not config.validate_config():
         print("ERROR: Critical configuration missing. Please check .env file and environment variables.")
         # Decide if you want to exit or try running anyway
         # exit(1)

    print("INFO: Creating Flask application...")
    flask_app = create_app()

    print(f"INFO: Starting Flask server on {config.SERVER_HOST}:{config.SERVER_PORT}...")
    # Use host/port from config, debug mode is set via app.config['DEBUG']
    flask_app.run(host=config.SERVER_HOST, port=config.SERVER_PORT)

