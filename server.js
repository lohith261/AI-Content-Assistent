/**
 * @file server.js
 * @description The backend server for the AI Content Assistant.
 * Now includes middleware to verify Firebase authentication tokens for secure endpoints.
 */

// --- IMPORTS ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
const admin = require('firebase-admin');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const puppeteer = require('puppeteer');
const axios = require('axios');
const cheerio = require('cheerio');

// --- INITIALIZATION ---
const app = express();
const port = 3000;

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));

// --- FIREBASE ADMIN SDK INITIALIZATION ---
let firebaseInitialized = false;
try {
    // Check if all required Firebase environment variables are present
    const requiredVars = ['FIREBASE_PRIVATE_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL'];
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
        console.error(`Missing Firebase environment variables: ${missingVars.join(', ')}`);
        console.error('Please ensure your .env file contains all required Firebase credentials.');
        console.error('The FIREBASE_PROJECT_ID must match the projectId in your frontend firebaseConfig.');
    } else {
        // Validate and format the private key
        let privateKey = process.env.FIREBASE_PRIVATE_KEY;
        
        // Validate private key format
        if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
            throw new Error('Invalid FIREBASE_PRIVATE_KEY format. Must include BEGIN and END markers.');
        }
        
        // Replace literal \n with actual newlines
        privateKey = privateKey.replace(/\\n/g, '\n');
        
        console.log(`Initializing Firebase Admin SDK with project ID: ${process.env.FIREBASE_PROJECT_ID}`);
        
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: privateKey,
            })
        });
        console.log('Firebase Admin SDK initialized successfully.');
        firebaseInitialized = true;
    }
} catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    console.error('CRITICAL: Ensure FIREBASE_PROJECT_ID in .env matches the projectId in your frontend firebaseConfig!');
}
const db = firebaseInitialized ? admin.firestore() : null;

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

function fileToGenerativePart(base64String, mimeType) {
    return { inlineData: { data: base64String.split(',')[1], mimeType } };
}

async function fetchContentWithAxios(url) {
    try {
        const { data } = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(data);
        $('script, style, nav, footer, header, aside').remove();
        let mainContent = $('article').text() || $('main').text() || $('body').text();
        mainContent = mainContent.replace(/\s\s+/g, ' ').trim();
        return mainContent;
    } catch (error) {
        console.log(`Axios scraping failed for ${url}: ${error.message}. Will try Puppeteer.`);
        return '';
    }
}

async function fetchContentWithPuppeteer(url) {
    console.log(`Falling back to headless browser for URL: ${url}`);
    let browser = null;
    try {
        browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
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
        return mainContent.replace(/\s\s+/g, ' ').trim();
    } catch (error) {
        console.error(`Puppeteer scraping failed for ${url}:`, error.message);
        throw new Error("Failed to fetch dynamic content from URL. The page may be too complex or protected.");
    } finally {
        if (browser) await browser.close();
    }
}

async function fetchContentFromUrl(url) {
    let content = await fetchContentWithAxios(url);
    if (!content || content.length < 200) {
        content = await fetchContentWithPuppeteer(url);
    }
    return content.substring(0, 15000);
}

const withTimeout = (promise, ms) => {
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${ms / 1000} seconds.`)), ms)
    );
    return Promise.race([promise, timeout]);
};

// --- NEW: AUTHENTICATION MIDDLEWARE ---
/**
 * Express middleware to verify the Firebase ID token sent from the client.
 * If the token is valid, it attaches the decoded user object to the request.
 * If not, it sends a 403 Forbidden error.
 */
const verifyFirebaseToken = async (req, res, next) => {
    if (!firebaseInitialized) {
        return res.status(503).send('Firebase Admin not initialized.');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).send('Unauthorized: No token provided.');
    }

    const idToken = authHeader.split('Bearer ')[1];
    try {
        console.log('Attempting to verify token for project:', process.env.FIREBASE_PROJECT_ID);
        console.log('Token length:', idToken.length);
        
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        console.log('Token verified successfully for user:', decodedToken.uid);
        req.user = decodedToken; // Add user info to the request object
        next(); // Proceed to the next route handler
    } catch (error) {
        console.error('Error verifying Firebase token:', error.message);
        console.error('Error code:', error.code);
        console.error('Full error:', error);
        return res.status(403).send('Unauthorized: Invalid token.');
    }
};


// --- API ENDPOINTS ---

/**
 * @route POST /generate-content
 * @description The main endpoint for content analysis. NOW SECURED.
 */
app.post('/generate-content', verifyFirebaseToken, async (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const sendEvent = (type, data) => res.write(`data: ${JSON.stringify({ type, data })}\n\n`);

    try {
        const userId = req.user.uid; // Get user ID from the verified token
        const { text, url, image, document, temperature, maxOutputTokens } = req.body;
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
                const data = await withTimeout(pdf(buffer), 30000);
                extractedText = data.text;
            } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                const result = await withTimeout(mammoth.extractRawText({ buffer }), 30000);
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

        if (userId && db) {
            const finalResponse = JSON.parse(fullResponseText);
            
            // Prepare the history entry
            const entry = {
                input: inputTextForHistory,
                response: finalResponse,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            };
            
            // Add file info if document was processed
            if (document) {
                entry.fileInfo = {
                    name: document.name,
                    type: document.mimeType
                };
            }
            
            await db.collection('users').doc(userId).collection('history').add(entry);
            console.log(`History saved for user: ${userId}`);
        }

    } catch (error) {
        console.error("Error during content generation:", error);
        sendEvent('error', { message: `An error occurred: ${error.message}` });
    } finally {
        res.end();
    }
});

/**
 * @route GET /history
 * @description Fetches the processing history for the authenticated user. NOW SECURED.
 */
app.get('/history', verifyFirebaseToken, async (req, res) => {
    if (!db) {
        return res.status(500).json({ error: "Firestore is not initialized." });
    }
    
    try {
        const userId = req.user.uid;
        const historyRef = db.collection('users').doc(userId).collection('history');
        const snapshot = await historyRef.orderBy('timestamp', 'desc').limit(20).get();
        
        const history = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                input: data.input,
                response: data.response,
                timestamp: data.timestamp,
                fileInfo: data.fileInfo || null
            };
        });
        res.status(200).json(history);
    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ error: "Failed to fetch user history." });
    }
});


// --- SERVER STARTUP ---
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});