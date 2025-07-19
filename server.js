/**
 * @file server.js
 * @description The backend server for the AI Content Assistant.
 * This server handles API requests from the frontend, communicates with the Google Gemini API,
 * and processes various input types like text, URLs, images, and documents. It uses Puppeteer
 * for advanced web scraping of JavaScript-heavy websites.
 */

// --- IMPORTS ---
// Load environment variables from a .env file into process.env
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const admin = require('firebase-admin');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer'); // For advanced web scraping

// --- INITIALIZATION ---
const app = express();
const port = 3000;

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// --- FIREBASE ADMIN SDK INITIALIZATION ---
try {
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
 * @param {string} mimeType The MIME type of the file.
 * @returns {object} An object formatted for the Gemini API.
 */
function fileToGenerativePart(base64String, mimeType) {
    return { inlineData: { data: base64String.split(',')[1], mimeType } };
}

/**
 * --- NEW: Advanced Web Scraper using Puppeteer ---
 * This function launches a headless Chrome browser to scrape a URL.
 * It waits for the page to fully load (including JavaScript) and extracts the main text content.
 * @param {string} url The URL to scrape.
 * @returns {Promise<string>} A promise that resolves to the extracted text content.
 */
async function fetchContentFromUrl(url) {
    console.log(`Launching headless browser for URL: ${url}`);
    let browser = null;
    try {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        const page = await browser.newPage();
        
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const mainContent = await page.evaluate(() => {
            document.querySelectorAll('script, style, nav, footer, header, aside, form, button').forEach(el => el.remove());
            const article = document.querySelector('article');
            if (article) return article.innerText;
            const main = document.querySelector('main');
            if (main) return main.innerText;
            return document.body.innerText;
        });

        const cleanedContent = mainContent.replace(/\s\s+/g, ' ').trim();
        return cleanedContent.substring(0, 15000);

    } catch (error) {
        console.error(`Error scraping URL ${url} with Puppeteer:`, error.message);
        throw new Error("Failed to fetch dynamic content from URL. The page may be too complex or protected.");
    } finally {
        if (browser) {
            await browser.close();
            console.log("Headless browser closed.");
        }
    }
}

/**
 * A utility function that wraps a promise with a timeout.
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
app.post('/generate-content', async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const sendEvent = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);

    try {
        const { text, url, image, document, temperature, maxOutputTokens, userId } = req.body;
        let parts = [];
        let inputTextForHistory = text;

        if (image) {
            const mimeType = image.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+)/)[1];
            parts.push(fileToGenerativePart(image, mimeType));
            if (text) parts.push({ text });
            inputTextForHistory = 'Image Input';
        } else if (document) {
            const { mimeType, base64 } = document;
            const buffer = Buffer.from(base64, 'base64');
            let extractedText = '';
            
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

        const basePrompt = `
            You are an AI assistant. Analyze the provided content and provide the following outputs in a single, valid JSON object.
            Do NOT include any markdown formatting. The entire response must be a single JSON object.
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
        console.error("Error during content generation:", error);
        sendEvent('error', { message: `An error occurred: ${error.message}` });
    } finally {
        res.end();
    }
});

// --- SERVER STARTUP ---
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});