# GenAIGenesis - Voice-Controlled Web Page Agent

A voice-interactive system that allows users to analyze web pages and interact with page elements using voice commands.

## Architecture Overview

The system is built with a frontend-backend architecture using an agent-based design:

### Frontend (Chrome Extension)
- **Content Script**: Runs on web pages to capture page content and process voice commands
- **Background Script**: Handles communication with the backend server
- **UI Components**: Provides visual feedback and voice output to the user

### Backend (FastAPI Server)
- **WebPageAgent**: Analyzes web pages and processes voice commands
- **ModelService**: Interfaces with AI models for content analysis
- **API Endpoints**: Provides HTTP and WebSocket endpoints for frontend communication

### Data Flow
1. User activates the assistant and speaks a command
2. Content Script captures audio and performs speech recognition
3. Command is sent to the Backend through the Background Script
4. WebPageAgent processes the command and returns a response
5. Content Script executes any required actions on the page
6. Feedback is provided to the user via voice and UI

## Key Components

### WebPageAgent
- Analyzes web page content to identify interactive elements
- Processes voice commands in the context of the current page
- Extracts information from HTML using pattern matching
- Connects to AI models for advanced analysis when available

### Voice Interaction
- Recognizes wake phrases to activate the assistant
- Processes natural language commands
- Supports commands for page analysis and element interaction
- Provides voice feedback for actions

### Page Analysis
- Extracts HTML, text, and screenshot from the current page
- Identifies interactive elements like buttons, links, and input fields
- Generates a list of possible actions based on the page content
- Summarizes the page content and purpose

## Data Structures

### PageContent
- `html`: HTML content of the page
- `text`: Text content of the page
- `url`: URL of the page
- `screenshot`: Base64-encoded screenshot (optional)

### ElementInfo
- `element_type`: Type of element (button, input, link, etc.)
- `text`: Text content of the element
- `id`: ID attribute of the element
- `css_selector`: CSS selector for the element

### ActionItem
- `description`: Description of the action
- `action_type`: Type of action (click, input, etc.)
- `target_element`: Target element selector
- `element_info`: Information about the target element

## Supported Commands

- **Page Analysis**: "What's on this page?", "Describe this page"
- **Element Interaction**: "Click the login button", "Enter 'example' in the search field"
- **Assistant Control**: "Hey assistant", "Goodbye assistant"

## Setup and Installation

### Frontend
1. Load the extension in Chrome developer mode
2. Navigate to a web page
3. Press the space key or say "Hey assistant" to activate

### Backend
1. Install Python dependencies: `pip install -r requirements.txt`
2. Run the server: `python -m uvicorn main:app --reload`

## Implementation Details

- Speech recognition uses Web Speech API when available
- Page analysis uses regex patterns to extract elements
- WebSocket provides real-time communication
- HTTP endpoints serve as a fallback for WebSocket
- AI model integration is pluggable through ModelService
