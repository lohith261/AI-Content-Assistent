// server.js (Updated for POST Requests)

// Import necessary modules
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// Initialize Express app
const app = express();
const port = 3000;

// Middleware setup
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
// IMPORTANT: Add JSON middleware to parse POST bodies and set a 10mb limit for images
app.use(express.json({ limit: '10mb' }));


// --- Firebase Admin SDK Initialization ---
try {
    if (!process.env.FIREBASE_PRIVATE_KEY) throw new Error("FIREBASE_PRIVATE_KEY not set");
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        })
    });
    console.log('Firebase Admin SDK initialized successfully.');
} catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error.message);
}

const db = admin.firestore();

// --- Gemini API Configuration ---
if (!process.env.GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY is not set!");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

function fileToGenerativePart(base64String, mimeType) {
    return { inlineData: { data: base64String.split(',')[1], mimeType } };
}

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

// --- CHANGE: Use app.post instead of app.get ---
app.post('/generate-content', async (req, res) => {
    // --- Set up Server-Sent Events (SSE) ---
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const sendEvent = (type, data) => {
        res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    };

    try {
        // --- CHANGE: Read data from req.body instead of req.query ---
        const { text, url, image, temperature, maxOutputTokens, userId } = req.body;
        let parts = [];

        // --- Build the prompt for the AI ---
        if (image) {
            const mimeType = image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)/)[1];
            parts.push(fileToGenerativePart(image, mimeType));
            parts.push({ text: text || "Describe this image and identify relevant information." });
        } else if (url) {
            const contentFromUrl = await fetchContentFromUrl(url);
            parts.push({ text: contentFromUrl });
        } else if (text) {
            parts.push({ text: text });
        } else {
            throw new Error("No input provided.");
        }

        const basePrompt = `
            You are an AI assistant. Analyze the provided content and provide the following outputs in a single, valid JSON object.
            Do NOT include any markdown formatting like \`\`\`json. The entire response must be a single JSON object.
            1.  "summary": A concise, 3-5 sentence summary.
            2.  "actionItems": An array of clear, actionable tasks. If none, return ["None identified."].
            3.  "nextSteps": An array of suggested next steps. If none, return ["No further suggestions."].
        `;
        parts.unshift({ text: basePrompt });

        const generationConfig = {
            temperature: parseFloat(temperature) || 0.7,
            maxOutputTokens: parseInt(maxOutputTokens) || 2048,
            responseMimeType: "application/json",
        };

        // --- Use generateContentStream ---
        const result = await model.generateContentStream({
            contents: [{ role: "user", parts }],
            generationConfig,
            safetySettings,
        });

        let fullResponseText = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullResponseText += chunkText;
            sendEvent('chunk', { text: chunkText });
        }
        
        sendEvent('final', {});

        if (userId && db) {
            const finalResponse = JSON.parse(fullResponseText);
            const entry = {
                input: text || url || 'Image Input',
                response: finalResponse,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            };
            await db.collection(`users/${userId}/history`).add(entry);
        }

    } catch (error) {
        console.error("Error during content generation:", error);
        sendEvent('error', { message: `An error occurred: ${error.message}` });
    } finally {
        res.end();
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});