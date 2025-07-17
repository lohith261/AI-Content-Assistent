// server.js

// Import necessary modules
require('dotenv').config(); // Loads environment variables from .env file
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai'); // Added HarmCategory, HarmBlockThreshold
const axios = require('axios'); // For making HTTP requests to fetch URL content
const cheerio = require('cheerio'); // For parsing HTML from fetched URLs

// Initialize Express app
const app = express();
const port = 3000;

// Middleware setup
app.use(cors()); // Enable CORS for all routes
// app.use(express.json()); // No longer needed for GET requests with query params for EventSource
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- Gemini API Configuration ---
const API_KEY = process.env.GEMINI_API_KEY; // Get API key from environment variables

if (!API_KEY) {
    console.error("Error: GEMINI_API_KEY is not set in the .env file!");
    console.error("Please create a .env file in the root directory and add: GEMINI_API_KEY=YOUR_API_KEY_HERE");
    process.exit(1); // Exit if API key is missing
}

const genAI = new GoogleGenerativeAI(API_KEY);
// Use a model capable of multimodal input (gemini-1.5-flash is good for this)
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Safety settings for Gemini API (optional but recommended)
const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    },
];

// Helper function to convert Base64 to GoogleGenerativeAI.Part
function fileToGenerativePart(base64String, mimeType) {
    // Extract only the base64 data part (remove "data:image/png;base64,")
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
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000
        });
        const $ = cheerio.load(response.data);

        $('script, style, noscript, link, meta, iframe, form, nav, footer, header, aside, .sidebar, .ad, [aria-hidden="true"]').remove();

        let mainContent = '';
        if ($('article').length) {
            mainContent = $('article').text();
        } else if ($('main').length) {
            mainContent = $('main').text();
        } else {
            mainContent = $('p, h1, h2, h3, h4, h5, h6').text();
            if (!mainContent) {
                mainContent = $('body').text();
            }
        }

        mainContent = mainContent.replace(/[\n\t]+/g, '\n').replace(/\s\s+/g, ' ').trim();

        const MAX_CONTENT_LENGTH = 15000;
        if (mainContent.length > MAX_CONTENT_LENGTH) {
            mainContent = mainContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n... [Content truncated to fit processing limits]';
        }

        if (mainContent.length < 50) {
            throw new Error("Extracted content is too short or not meaningful.");
        }

        return mainContent;
    } catch (error) {
        console.error(`Error fetching or parsing content from URL ${url}:`, error.message);
        if (error.code === 'ENOTFOUND') {
            throw new Error("Invalid URL or domain not found. Please check the URL.");
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            throw new Error("Could not connect to the URL. The server might be down or blocking requests.");
        } else if (error.message.includes("Extracted content is too short")) {
            throw new Error("Could not extract significant text content from the provided URL. It might be an image-heavy site or require JavaScript rendering.");
        } else {
            throw new Error(`Failed to fetch content from URL: ${error.message}`);
        }
    }
}

// --- API Endpoint for Content Processing (GET for EventSource) ---
app.get('/generate-content', async (req, res) => {
    const { text, url, image, temperature, maxOutputTokens } = req.query; // New: 'image' parameter
    let contentToProcess = '';
    let parts = []; // Array to hold content parts for Gemini

    if (image) {
        // Handle image input
        const [mimeType, base64Data] = image.split(';base64,');
        if (!mimeType || !base64Data) {
            return res.status(400).json({ error: "Invalid image data format." });
        }
        parts.push(fileToGenerativePart(image, mimeType.replace('data:', '')));
        // If there's accompanying text for the image, add it
        if (text) {
            parts.push({ text: text });
        } else {
            // Default text prompt for image if none provided by user
            parts.push({ text: "Describe this image and identify any text, action items, or relevant information within it. Then provide a summary, action items, and next steps in JSON format as requested." });
        }
    } else if (url) {
        // Handle URL input
        try {
            contentToProcess = await fetchContentFromUrl(url);
            if (!contentToProcess) {
                return res.status(400).json({ error: "Could not extract readable content from the provided URL." });
            }
            parts.push({ text: contentToProcess });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    } else if (text) {
        // Handle plain text input
        parts.push({ text: text });
    } else {
        // If neither text, URL, nor image is provided
        return res.status(400).json({ error: "Please provide text, a URL, or upload an image." });
    }

    // Parse temperature and maxOutputTokens from query string (they come as strings)
    const parsedTemperature = parseFloat(temperature);
    const parsedMaxOutputTokens = parseInt(maxOutputTokens);

    const generationConfig = {
        temperature: !isNaN(parsedTemperature) ? parsedTemperature : 0.7,
        maxOutputTokens: !isNaN(parsedMaxOutputTokens) ? parsedMaxOutputTokens : 2048,
    };

    // Craft the prompt for Gemini with advanced instructions
    // This prompt is now integrated directly into the parts array for multi-modal input
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

    // Prepend the base prompt to the parts array for all input types
    parts.unshift({ text: basePrompt });

    try {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        let fullResponseText = '';

        const streamResult = await model.generateContent({
            contents: [{ role: "user", parts: parts }], // Use the constructed parts array
            generationConfig: generationConfig,
            safetySettings: safetySettings // Apply safety settings
        }, { stream: true });

        for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            fullResponseText += chunkText;
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunkText })}\n\n`);
        }

        const parsedResponse = JSON.parse(fullResponseText);

        if (parsedResponse.actionItems && !Array.isArray(parsedResponse.actionItems)) {
            parsedResponse.actionItems = [parsedResponse.actionItems];
        }
        if (parsedResponse.nextSteps && !Array.isArray(parsedResponse.nextSteps)) {
            parsedResponse.nextSteps = [parsedResponse.nextSteps];
        }

        res.write(`data: ${JSON.stringify({ type: 'final', content: parsedResponse })}\n\n`);
        res.end();

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        let errorMessage = "Failed to generate content. Please try again.";
        // Check for specific safety errors
        if (error.message && error.message.includes("Safety setting")) {
            errorMessage = "Content blocked due to safety settings. Please try a different input.";
        } else if (error.response && error.response.data && error.response.data.error) {
            errorMessage = error.response.data.error.message || errorMessage;
        } else if (error.message) {
            errorMessage = error.message;
        }
        res.write(`data: ${JSON.stringify({ type: 'error', content: `AI generation failed: ${errorMessage}. This might be due to content length or an issue with the AI model.` })}\n\n`);
        res.end();
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Open your browser to http://localhost:${port}/index.html to use the app.`);
});
