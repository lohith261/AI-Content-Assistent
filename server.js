/**
 * @file server.js
 * @description The backend server for the AI Content Assistant.
 * This server handles API requests from the frontend, communicates with the Google Gemini API,
 * and processes various input types like text, URLs, images, and documents.
 */

// --- IMPORTS ---
// Load environment variables from a .env file into process.env
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

// --- INITIALIZATION ---
const app = express();
const port = 3000;

// --- MIDDLEWARE SETUP ---
// Enable Cross-Origin Resource Sharing (CORS) for all routes.
app.use(cors());
// Serve static files (like index.html, script.js) from the 'public' directory.
app.use(express.static(path.join(__dirname, 'public')));
// Enable the Express app to parse JSON-formatted request bodies, with a 10mb size limit for file uploads.
app.use(express.json({ limit: '10mb' }));

// --- FIREBASE ADMIN SDK INITIALIZATION ---
try {
    // Check if essential Firebase environment variables are present.
    if (process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
        });
        console.log('Firebase Admin SDK initialized successfully.');
    }
} catch (error) {
    // Log an error if initialization fails, but allow the server to continue running without Firebase features.
    console.error('Error initializing Firebase Admin SDK:', error.message);
}
const db = admin.firestore();

// --- GEMINI API CONFIGURATION ---
if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY is not set!");
    process.exit(1);
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Define safety settings to block harmful content from the AI.
const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- HELPER FUNCTIONS ---

/**
 * Converts a base64 data URL into the format required by the Google Gemini API.
 * @param {string} base64String The base64-encoded data URL of the file.
 * @param {string} mimeType The MIME type of the file (e.g., 'image/jpeg').
 * @returns {object} An object formatted for the Gemini API.
 */
function fileToGenerativePart(base64String, mimeType) {
    return { inlineData: { data: base64String.split(',')[1], mimeType } };
}

/**
 * Fetches and extracts the main text content from a given URL.
 * @param {string} url The URL to scrape.
 * @returns {Promise<string>} A promise that resolves to the extracted text content.
 */
async function fetchContentFromUrl(url) {
    try {
        const { data } = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(data);
        $('script, style, noscript, link, meta, iframe, form, nav, footer, header, aside').remove();
        let mainContent = $('article').text() || $('main').text() || $('body').text();
        mainContent = mainContent.replace(/\s\s+/g, ' ').trim();
        return mainContent.substring(0, 15000);
    } catch (error) {
        console.error(`Error fetching URL ${url}:`, error.message);
        throw new Error("Failed to fetch content from URL.");
    }
}

/**
 * A utility function that wraps a promise with a timeout.
 * If the promise does not resolve within the given time, it will reject with a timeout error.
 * @param {Promise} promise The promise to wrap.
 * @param {number} ms The timeout duration in milliseconds.
 * @returns {Promise} The wrapped promise.
 */
const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms / 1000} seconds.`)), ms)
    );
    return Promise.race([promise, timeout]);
};

// --- API ENDPOINTS ---

/**
 * @route POST /generate-content
 * @description The main endpoint that receives user input (text, URL, image, or document),
 * sends it to the Gemini API for analysis, and streams the response back to the client
 * using Server-Sent Events (SSE).
 */
app.post('/generate-content', async (req, res) => {
    // Set headers for a Server-Sent Events (SSE) stream.
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    // Helper function to format and send SSE messages.
    const sendEvent = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);

    try {
        const { text, url, image, document, temperature, maxOutputTokens, userId } = req.body;
        let parts = [];
        let inputTextForHistory = text;

        // Determine the input type and prepare the data for the Gemini API.
        if (image) {
            const mimeType = image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)/)[1];
            parts.push(fileToGenerativePart(image, mimeType));
            if (text) parts.push({ text });
            inputTextForHistory = 'Image Input';
        } else if (document) {
            const { mimeType, base64 } = document;
            const buffer = Buffer.from(base64, 'base64');
            let extractedText = '';

            // Use the appropriate parser based on the document's MIME type.
            if (mimeType === 'application/pdf') {
                const parsingPromise = pdf(buffer);
                const data = await withTimeout(parsingPromise, 30000);
                extractedText = data.text;
            } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const parsingPromise = mammoth.extractRawText({ buffer });
                const result = await withTimeout(parsingPromise, 30000);
                extractedText = result.value;
            } else {
                 throw new Error('Unsupported document type');
            }
            parts.push({ text: extractedText });
            inputTextForHistory = `Document: ${document.name}`;
        } else if (url) {
            const contentFromUrl = await fetchContentFromUrl(url);
            parts.push({ text: contentFromUrl });
            inputTextForHistory = url;
        } else if (text) {
            parts.push({ text: text });
        } else {
            throw new Error("No input provided.");
        }

        // The main prompt sent to the AI, instructing it on its role and desired output format.
        const basePrompt = `
            You are an AI assistant. Analyze the provided content and provide the following outputs in a single, valid JSON object.
            Do NOT include any markdown formatting. The entire response must be a single JSON object.
            1.  "summary": A concise, 3-5 sentence summary.
            2.  "actionItems": An array of clear, actionable tasks. If none, return ["None identified."].
            3.  "nextSteps": An array of suggested next steps. If none, return ["No further suggestions."].
        `;
        parts.unshift({ text: basePrompt });

        // Configure the AI's generation parameters.
        const generationConfig = {
            temperature: parseFloat(temperature) || 0.7,
            maxOutputTokens: parseInt(maxOutputTokens) || 2048,
            responseMimeType: "application/json",
        };

        // Call the Gemini API and get a readable stream.
        const result = await model.generateContentStream({
            contents: [{ role: "user", parts }],
            generationConfig,
            safetySettings,
        });

        // Read the stream and send chunks back to the client.
        let fullResponseText = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullResponseText += chunkText;
            sendEvent('chunk', { text: chunkText });
        }
        
        sendEvent('final', {}); // Signal that the stream has ended.

        // If a user ID is provided, save the full response to Firestore.
        if (userId && db && admin.apps.length) {
            const finalResponse = JSON.parse(fullResponseText);
            const entry = {
                input: inputTextForHistory,
                response: finalResponse,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            };
            await db.collection(`users/${userId}/history`).add(entry);
        }

    } catch (error) {
        // Handle any errors during the process and send an error event to the client.
        console.error("Error during content generation:", error);
        sendEvent('error', { message: `An error occurred: ${error.message}` });
    } finally {
        // End the SSE connection once everything is done.
        res.end();
    }
});

// --- SERVER STARTUP ---
// Start the Express server and listen for incoming connections on the specified port.
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});