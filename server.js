// server.js (Corrected)

// Import necessary modules
require('dotenv').config(); // Loads environment variables from .env file
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const axios = require('axios'); // For making HTTP requests to fetch URL content
const cheerio = require('cheerio'); // For parsing HTML from fetched URLs

// New: Firebase Admin SDK imports
const admin = require('firebase-admin');

// Initialize Express app
const app = express();
const port = 3000;

// Middleware setup
app.use(cors()); // Enable CORS for all routes
app.use(express.static(path.join(__dirname, 'public')));

// --- Firebase Admin SDK Initialization ---
if (!process.env.FIREBASE_PRIVATE_KEY || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PROJECT_ID) {
    console.error("Error: Firebase Admin SDK environment variables are not set!");
    console.error("Please set FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL, and FIREBASE_PROJECT_ID.");
    process.exit(1);
}

try {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle newline characters
        })
    });
    console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    process.exit(1);
}

const db = admin.firestore(); // Get a Firestore instance
const auth = admin.auth();   // Get an Auth instance

// --- Gemini API Configuration ---
const API_KEY = process.env.GEMINI_API_KEY; // Get API key from environment variables

if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY is not set in the .env file!");
    console.error("Please create a .env file in the root directory and add: GEMINI_API_KEY=YOUR_API_KEY_HERE");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Safety settings for Gemini API (optional but recommended)
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// Helper function to convert Base64 to GoogleGenerativeAI.Part
function fileToGenerativePart(base64String, mimeType) {
    const base64Data = base64String.split(',')[1];
    return {
        inlineData: {
            data: base64Data,
            mimeType
        },
    };
}

// --- Helper function to fetch and parse content from a URL ---
async function fetchContentFromUrl(url) {
    try {
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' },
            timeout: 10000
        });
        const $ = cheerio.load(response.data);
        $('script, style, noscript, link, meta, iframe, form, nav, footer, header, aside, .sidebar, .ad, [aria-hidden="true"]').remove();
        let mainContent = '';
        if ($('article').length) { mainContent = $('article').text(); }
        else if ($('main').length) { mainContent = $('main').text(); }
        else {
            mainContent = $('p, h1, h2, h3, h4, h5, h6').text();
            if (!mainContent) { mainContent = $('body').text(); }
        }
        mainContent = mainContent.replace(/[\n\t]+/g, '\n').replace(/\s\s+/g, ' ').trim();
        const MAX_CONTENT_LENGTH = 15000;
        if (mainContent.length > MAX_CONTENT_LENGTH) {
            mainContent = mainContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n... [Content truncated to fit processing limits]';
        }
        if (mainContent.length < 50) { throw new Error("Extracted content is too short or not meaningful."); }
        return mainContent;
    } catch (error) {
        console.error(`Error fetching or parsing content from URL ${url}:`, error.message);
        if (error.code === 'ENOTFOUND') { throw new Error("Invalid URL or domain not found. Please check the URL."); }
        else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') { throw new Error("Could not connect to the URL. The server might be down or blocking requests."); }
        else if (error.message.includes("Extracted content is too short")) { throw new Error("Could not extract significant text content from the provided URL. It might be an image-heavy site or require JavaScript rendering."); }
        else { throw new Error(`Failed to fetch content from URL: ${error.message}`); }
        }
    }

    // --- New: Authentication Endpoint (for custom token) ---
    app.post('/auth/anonymous', async (req, res) => {
        try {
            // Create an anonymous user in Firebase Auth and generate a custom token
            const customToken = await auth.createCustomToken(req.body.uid || 'anonymous-user-' + Date.now());
            res.json({ customToken });
        } catch (error) {
            console.error('Error creating custom token:', error);
            res.status(500).json({ error: 'Failed to authenticate anonymously.' });
        }
    });

    // --- API Endpoint for Content Processing (GET for EventSource) ---
    app.get('/generate-content', async (req, res) => {
        const { text, url, image, temperature, maxOutputTokens, userId } = req.query;
        let contentToProcess = '';
        let parts = [];

        if (image) {
            const [mimeType, base64Data] = image.split(';base64,');
            if (!mimeType || !base64Data) {
                res.write(`data: ${JSON.stringify({ type: 'error', content: "Invalid image data format. Please try another image." })}\n\n`);
                res.end();
                return;
            }
            parts.push(fileToGenerativePart(image, mimeType.replace('data:', '')));
            if (text) { parts.push({ text: text }); }
            else { parts.push({ text: "Describe this image and identify any text, action items, or relevant information within it. Then provide a summary, action items, and next steps in JSON format as requested." }); }
        } else if (url) {
            try {
                contentToProcess = await fetchContentFromUrl(url);
                if (!contentToProcess) {
                    res.write(`data: ${JSON.stringify({ type: 'error', content: "Could not extract readable content from the provided URL." })}\n\n`);
                    res.end();
                    return;
                }
                parts.push({ text: contentToProcess });
            } catch (error) {
                res.write(`data: ${JSON.stringify({ type: 'error', content: error.message })}\n\n`);
                res.end();
                return;
            }
        } else if (text) {
            parts.push({ text: text });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', content: "Please provide text, a URL, or an image." })}\n\n`);
            res.end();
            return;
        }

        const parsedTemperature = parseFloat(temperature);
        const parsedMaxOutputTokens = parseInt(maxOutputTokens);

        const generationConfig = {
            temperature: !isNaN(parsedTemperature) ? parsedTemperature : 0.7,
            maxOutputTokens: !isNaN(parsedMaxOutputTokens) ? parsedMaxOutputTokens : 2048,
        };

        const basePrompt = `
            You are an AI assistant specialized in content analysis.
            Analyze the provided content (text or image) thoroughly and provide the following outputs in a structured JSON format.

            1.  **Summary**: Provide a concise, neutral, and informative summary of the key takeaways from the content. It should be approximately 3-5 sentences long. Focus on the most important information and main ideas.

            2.  **Action Items**: Identify and list any clear, concise, and actionable tasks, decisions, or follow-ups explicitly mentioned or clearly implied within the content. Each action item should start with a verb. If there are no discernible action items, return an array containing a single string: "None identified."

            3.  **Suggested Next Steps**: Based on the content, suggest logical next steps, related topics for further exploration, or additional resources a user might find valuable. These should be broader suggestions beyond direct action items. If no relevant suggestions, return an array containing a single string: "No further suggestions."

            Please provide the output in JSON format with the following keys and value types:
            "summary": string
            "actionItems": array of strings
            "nextSteps": array of strings

            Example of desired JSON structure:
            {
                "summary": "This is a concise summary of the content.",
                "actionItems": ["Review report by Friday", "Schedule follow-up meeting"],
                "nextSteps": ["Research related topic X", "Explore additional resources on Y"]
            }
            If a list is empty, it should contain "None identified." or "No further suggestions." as a single string element.
        `;
        parts.unshift({ text: basePrompt });

        try {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });

            // Step 1: Get the result object from the model
            const result = await model.generateContent({
                contents: [{ role: "user", parts: parts }],
                generationConfig: generationConfig,
                safetySettings: safetySettings
            });

            // Step 2: **THIS IS THE FIX** -> Await the response promise from the result object
            const response = await result.response;

            // Step 3: Now you can safely get the text from the resolved response
            const fullResponseText = response.text();
            
            console.log('Gemini API Response Text:', fullResponseText); // For debugging

            if (!fullResponseText) {
                res.write(`data: ${JSON.stringify({ type: 'error', content: "Gemini did not return expected text content. The response might be empty or blocked by safety settings." })}\n\n`);
                res.end();
                return;
            }

            // Parse the full response
            const parsedResponse = JSON.parse(fullResponseText);

            // Ensure actionItems and nextSteps are always arrays
            if (parsedResponse.actionItems && !Array.isArray(parsedResponse.actionItems)) { parsedResponse.actionItems = [parsedResponse.actionItems]; }
            if (parsedResponse.nextSteps && !Array.isArray(parsedResponse.nextSteps)) { parsedResponse.nextSteps = [parsedResponse.nextSteps]; }

            if (userId) {
                const entry = {
                    input: text || url || 'Image Input',
                    image: image || null,
                    response: parsedResponse,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                };
                await db.collection(`artifacts/ai-content-assistant/users/${userId}/history`).add(entry);
                console.log(`Saved entry for user ${userId}`);
            }

            // Send the full response as a single 'final' SSE event
            res.write(`data: ${JSON.stringify({ type: 'final', content: parsedResponse })}\n\n`);
            res.end(); // End the response here as we're not streaming chunks

        } catch (error) {
            console.error("Error calling Gemini API or Firestore:", error);
            let errorMessage = "Failed to generate content. Please try again.";
            if (error.message && error.message.includes("Safety setting")) { errorMessage = "Content blocked due to safety settings. Please try a different input."; }
            else if (error.response && error.response.data && error.response.data.error) { errorMessage = error.response.data.error.message || errorMessage; }
            else if (error.message) { errorMessage = error.message; }
            res.write(`data: ${JSON.stringify({ type: 'error', content: `AI generation failed: ${errorMessage}. This might be due to content length or an issue with the AI model.` })}\n\n`);
            res.end();
        }
    });

    // New: Endpoint to fetch user history from Firestore
    app.get('/user-history', async (req, res) => {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ error: "User ID is required to fetch history." });
        }

        try {
            const historyRef = db.collection(`artifacts/ai-content-assistant/users/${userId}/history`);
            const snapshot = await historyRef.orderBy('timestamp', 'desc').limit(5).get();
            const history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            res.json({ history });
        } catch (error) {
            console.error('Error fetching user history from Firestore:', error);
            res.status(500).json({ error: 'Failed to fetch user history.' });
        }
    });


    // Start the server
    app.listen(port, () => {
        console.log(`Server listening at http://localhost:${port}`);
        console.log(`Open your browser to http://localhost:${port}/index.html to use the app.`);
    });