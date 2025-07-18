🚀 AI Content Assistant 🚀
An intelligent web application powered by the Google Gemini 1.5 Flash model. This tool serves as a powerful productivity assistant, capable of analyzing content from multiple sources—including text, website URLs, and images—to provide you with concise summaries, actionable tasks, and insightful next steps.

The backend is built with Node.js/Express and is ready for deployment on services like Render, while the frontend is a clean, responsive vanilla JS application.

✨ Key Features
✨ Multi-Modal Input: Process content from pasted text, live website URLs, or directly from uploaded images (e.g., screenshots of notes, diagrams).

📝 Intelligent Summarization: Distills long articles, notes, or text from images into concise, easy-to-digest summaries.

✅ Action Item Extraction: Automatically identifies and lists clear, actionable tasks and follow-ups from the provided content.

💡 Suggested Next Steps: Provides intelligent recommendations for further reading, research topics, or related actions.

🎛️ Customizable AI Parameters: Fine-tune the AI's creativity and response length by adjusting the Temperature and Max Output Tokens directly in the UI.

🌐 Live URL Scraping: Enter a URL, and the backend will automatically fetch, parse, and clean the web page's main content for analysis.

🔐 Secure Backend: Uses a Node.js backend to handle all API calls securely, ensuring your Gemini API key is never exposed on the frontend.

📜 Processing History: Your last five analyses are automatically saved to your browser's local storage for quick access.

☁️ Firestore Integration (Backend): The backend is equipped to save user processing history to Google Firestore when a userId is provided, offering a path for future multi-user support.

🛠️ Tech Stack
Area	Technology
Frontend	HTML5, Tailwind CSS (via CDN), Vanilla JavaScript, Lucide Icons
Backend	Node.js, Express.js, @google/generative-ai, axios, cheerio, cors, dotenv, firebase-admin
Platform	Deployed on Vercel (Frontend) and Render (Backend)

Export to Sheets
📂 Project Structure
/
├── .env                  # Environment variables (local setup)
├── .gitignore            # Files to be ignored by Git
├── node_modules/         # Node.js dependencies
├── public/               # All frontend static files
│   ├── index.html        # Main application page
│   ├── script.js         # Frontend logic
│   └── style.css         # Custom styles
├── package.json          # Project metadata and dependencies
├── package-lock.json     # Dependency lock file
└── server.js             # The Express backend server
⚙️ Local Setup and Installation
Follow these steps to run the project on your local machine.

1. Prerequisites

Node.js: Ensure you have Node.js v18 or later installed.

Google Gemini API Key:

Go to Google AI Studio.

Create a new API key.

Firebase Service Account (for backend history feature):

Go to your Firebase Console.

Select your project, go to Project Settings > Service accounts.

Click "Generate new private key". This will download a JSON file. You will need the project_id, client_email, and private_key from this file.

2. Clone the Repository

Bash

git clone https://github.com/lohith261/AI-Content-Assistent.git
cd AI-Content-Assistent
3. Install Dependencies

Bash

npm install
4. Create the Environment File
Create a file named .env in the root of the project and add the following variables.

Code snippet

# Your Google Gemini API Key
GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"

# Your Firebase Service Account Credentials
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_LINE_1\nYOUR_PRIVATE_KEY_LINE_2\n-----END PRIVATE KEY-----\n"
Important: When copying the private_key from your Firebase JSON file, make sure to format it correctly in the .env file by replacing all literal newline characters with \n, as shown in the example.

5. Run the Application
Start the backend server:

Bash

npm start
You will see a message that the server is listening on port 3000. Now, open your browser and navigate to:
http://localhost:3000

🚀 Future Enhancements
User Authentication: Implement a full login system to associate processing history with specific users in Firestore.

Streaming Responses: Display the AI's response word-by-word as it's generated for a more dynamic and responsive user experience.

Direct-to-Task-Manager: Add buttons to export extracted action items to services like Trello, Asana, or Google Tasks.

Advanced Scraping: For websites that rely heavily on JavaScript, integrate a headless browser like Puppeteer for more reliable content extraction.

Custom Prompts: Allow users to create and save their own prompt templates for specialized tasks.