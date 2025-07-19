


# 🚀 AI Content Assistant 🚀

An intelligent web application powered by the Google Gemini 1.5 Flash model. This tool serves as a powerful productivity assistant, capable of analyzing content from multiple sources—including text, website URLs, images, and local documents—to provide you with concise summaries, actionable tasks, and insightful next steps.

The backend is built with Node.js/Express and is ready for deployment on services like Render, while the frontend is a clean, responsive vanilla JS application with a modern, futuristic UI.

---

### 🔗 [**Live Demo**](https://ai-content-assistent.vercel.app/)

---

### ✨ Key Features

* **✨ Multi-Modal Input:** Process content from pasted text, live website URLs, uploaded images, and now **`.pdf`** and **`.docx`** documents.
* **🎨 Futuristic UI:** A modern interface featuring a dynamic, animated gradient background and a "glassmorphism" (frosted glass) effect on all UI elements.
* **📝 Intelligent Summarization:** Distills long articles, notes, or documents into concise, easy-to-digest summaries.
* **✅ Action Item Extraction:** Automatically identifies and lists clear, actionable tasks and follow-ups from the provided content.
* **💡 Suggested Next Steps:** Provides intelligent recommendations for further reading, research topics, or related actions.
* **🎛️ Customizable AI Parameters:** Fine-tune the AI's creativity and response length by adjusting the **Temperature** and **Max Output Tokens**.
* **🔐 Secure Backend:** Uses a Node.js backend to handle all API calls securely, ensuring your Gemini API key is never exposed on the frontend.
* **📜 Processing History:** Your last five analyses are automatically saved to your browser's local storage for quick access.

### 🛠️ Tech Stack

| Area       | Technology                                                                                                                              |
| :--------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| **Frontend** | `HTML5`, `Tailwind CSS` (via CDN), `Vanilla JavaScript`, `Lucide Icons`                                                                   |
| **Backend** | `Node.js`, `Express.js`, `@google/generative-ai`, `axios`, `cheerio`, `cors`, `dotenv`, `firebase-admin`, **`pdf-parse`**, **`mammoth`** |
| **Platform** | Deployed on **Vercel** (Frontend) and **Render** (Backend)                                                                              |

### 📂 Project Structure

* `/` (root)
    * `.env`: Environment variables (local setup)
    * `.gitignore`: Files to be ignored by Git
    * `node_modules/`: Node.js dependencies
    * `public/`: All frontend static files
        * `index.html`: Main application page
        * `script.js`: Frontend logic
        * `style.css`: Custom styles
    * `package.json`: Project metadata and dependencies
    * `package-lock.json`: Dependency lock file
    * `server.js`: The Express backend server

### ⚙️ Local Setup and Installation

Follow these steps to run the project on your local machine.

**1. Prerequisites**

* **Node.js:** Ensure you have Node.js v18 or later installed.
* **Google Gemini API Key:**
    * Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
    * Create a new API key.
* **Firebase Service Account (Optional):**
    * Go to your [Firebase Console](https://console.firebase.google.com/).
    * Select your project, go to **Project Settings** > **Service accounts**.
    * Click **"Generate new private key"**. You will need the `project_id`, `client_email`, and `private_key` from this file.

**2. Clone the Repository**

```bash
git clone [https://github.com/lohith261/AI-Content-Assistent.git](https://github.com/lohith261/AI-Content-Assistent.git)
cd AI-Content-Assistent
```

**3. Install Dependencies**

```bash
npm install
```

**4. Create the Environment File**
Create a file named `.env` in the root of the project and add the following variables.

```env
# Your Google Gemini API Key
GEMINI_API_KEY="YOUR_GEMINI_API_KEY_HERE"

# Your Firebase Service Account Credentials
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_LINE_1\nYOUR_PRIVATE_KEY_LINE_2\n-----END PRIVATE KEY-----\n"
```

> **Important:** When copying the `private_key` from your Firebase JSON file, make sure to format it correctly in the `.env` file by replacing all literal newline characters with `\n`, as shown in the example.

**5. Run the Application**
Start the backend server:

```bash
npm start
```

You will see a message that the server is listening on port 3000. Now, open your browser and navigate to:
**[http://localhost:3000](https://www.google.com/search?q=http://localhost:3000)**

### 🚀 Future Enhancements

  * **User Authentication:** Implement a full login system to associate processing history with specific users in Firestore.
  * **Direct-to-Task-Manager:** Add buttons to export extracted action items to services like Trello, Asana, or Google Tasks.
  * **Advanced Scraping:** For websites that rely heavily on JavaScript, integrate a headless browser like Puppeteer for more reliable content extraction.
  
  
