# Interactive Trainer Application

This project is an interactive web-based tutorial application featuring a digital assistant.

## Features

*   Chapter-based tutorial content.
*   Sidebar navigation.
*   Digital assistant that can read tutorial paragraphs aloud (Text-to-Speech).
*   (Planned) Chat interaction with the assistant (Speech-to-Text and backend integration).

## Setup

1.  **Prerequisites:**
    *   Python 3.x
    *   pip (Python package installer)
    *   Google Cloud SDK (for TTS/STT API access)
    *   Credentials for Google Cloud TTS/STT APIs (place the `.json` key file in the root directory and update `.env` or `server/config.py`). **Do not commit the key file to Git.**

2.  **Installation:**
    ```bash
    # Clone the repository (if you haven't already)
    # git clone <repository-url>
    cd Interactive_trainer

    # Create and activate a virtual environment (recommended)
    python -m venv venv
    # On Windows
    .\venv\Scripts\activate
    # On macOS/Linux
    # source venv/bin/activate

    # Install dependencies
    pip install -r requirements.txt
    ```

3.  **Configuration:**
    *   Create a `.env` file in the root directory (or configure `server/config.py`) with your Google Cloud Project ID and the path to your service account key file:
        ```env
        GOOGLE_APPLICATION_CREDENTIALS="path/to/your/chitti-xxxx.json"
        GOOGLE_PROJECT_ID="your-gcp-project-id"
        ```

4.  **Running the Application:**
    ```bash
    flask run
    ```
    The application will be available at `http://127.0.0.1:5000`.

## Project Structure

*   `server/`: Contains the Flask backend code (app setup, routes, API clients).
*   `static/`: Contains static assets (CSS, JavaScript, images, sounds).
    *   `css/`: Stylesheets.
    *   `js/`: Frontend JavaScript modules (UI interaction, API calls, assistant logic).
    *   `sounds/`: Sound effects.
*   `templates/`: HTML templates for different pages/chapters.
*   `venv/`: Python virtual environment (if created).
*   `.gitignore`: Specifies intentionally untracked files that Git should ignore.
*   `requirements.txt`: Lists Python dependencies.
*   `README.md`: This file.

## Contributing

(Add contribution guidelines if applicable)

## License

(Specify the license for your project, e.g., MIT License)
