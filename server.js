// server.js

// Import necessary modules
require('dotenv').config(); // Loads environment variables from .env file
const express = require('express');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const axios = require('axios'); // For making HTTP requests to fetch URL content
const cheerio = require('cheerio'); // For parsing HTML from fetched URLs

// Initialize Express app
const app = express();
const port = 3000;

// Middleware setup
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Enable parsing of JSON request bodies
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
// Using gemini-1.5-flash for faster responses, suitable for this kind of app
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// --- Helper function to fetch and parse content from a URL ---
async function fetchContentFromUrl(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                // Mimic a browser request to avoid some blocks
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 // 10 seconds timeout for fetching
        });
        const $ = cheerio.load(response.data);

        // Remove script, style, nav, footer, header, and other non-content elements
        $('script, style, noscript, link, meta, iframe, form, nav, footer, header, aside, .sidebar, .ad, [aria-hidden="true"]').remove();

        let mainContent = '';

        // Prioritize article or main content
        if ($('article').length) {
            mainContent = $('article').text();
        } else if ($('main').length) {
            mainContent = $('main').text();
        } else {
            // Fallback to body, but try to get text from paragraphs and headings
            mainContent = $('p, h1, h2, h3, h4, h5, h6').text();
            if (!mainContent) { // If still no content, take from body
                mainContent = $('body').text();
            }
        }

        // Basic clean-up: remove excessive newlines/tabs and multiple spaces
        mainContent = mainContent.replace(/[\n\t]+/g, '\n').replace(/\s\s+/g, ' ').trim();

        // Limit content length to avoid hitting token limits and for faster processing
        // Gemini-1.5-Flash has a large context window, but keeping it reasonable is good practice
        const MAX_CONTENT_LENGTH = 15000; // Increased slightly, adjust as needed
        if (mainContent.length > MAX_CONTENT_LENGTH) {
            mainContent = mainContent.substring(0, MAX_CONTENT_LENGTH) + '\n\n... [Content truncated to fit processing limits]';
        }

        if (mainContent.length < 50) { // If content is too short after cleaning, it might not be useful
            throw new Error("Extracted content is too short or not meaningful.");
        }

        return mainContent;
    } catch (error) {
        console.error(`Error fetching or parsing content from URL ${url}:`, error.message);
        // Provide a more user-friendly error message
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

// --- API Endpoint for Content Processing ---
app.post('/generate-content', async (req, res) => {
    const { text, url, temperature, maxOutputTokens } = req.body;
    let contentToProcess = '';

    if (url) {
        try {
            contentToProcess = await fetchContentFromUrl(url);
            if (!contentToProcess) {
                return res.status(400).json({ error: "Could not extract readable content from the provided URL." });
            }
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    } else if (text) {
        contentToProcess = text;
    } else {
        return res.status(400).json({ error: "Please provide text or a URL." });
    }

    // Define the structured response schema for Gemini
    const generationConfig = {
        // responseMimeType: "application/json", // Removed for streaming text first
        temperature: temperature !== undefined ? temperature : 0.7,
        maxOutputTokens: maxOutputTokens !== undefined ? maxOutputTokens : 2048,
        // responseSchema is not used with streaming, as we'll parse the full response at the end
    };

    // Craft the prompt for Gemini with advanced instructions
    const prompt = `
        You are an AI assistant specialized in content analysis.
        Analyze the following content thoroughly and provide the following outputs in a structured JSON format.

        1.  **Summary**: Provide a concise, neutral, and informative summary of the key takeaways from the content. It should be approximately 3-5 sentences long. Focus on the most important information and main ideas.

        2.  **Action Items**: Identify and list any clear, concise, and actionable tasks, decisions, or follow-ups explicitly mentioned or strongly implied within the content. Each action item should start with a verb. If there are no discernible action items, return an array containing a single string: "None identified."

        3.  **Suggested Next Steps**: Based on the content, suggest logical next steps, related topics for further exploration, or additional resources a user might find valuable. These should be broader suggestions beyond direct action items. If no relevant suggestions, return an array containing a single string: "No further suggestions."

        Content to analyze:
        "${contentToProcess}"

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

    try {
        // Set headers for streaming response
        res.writeHead(200, {
            'Content-Type': 'text/event-stream', // MIME type for server-sent events
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });

        let fullResponseText = ''; // To accumulate the full response
        let accumulatedJson = ''; // To accumulate JSON parts if Gemini streams JSON

        // Call the Gemini API with streaming enabled
        const streamResult = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: generationConfig
        }, { stream: true }); // Enable streaming!

        // Iterate over the streamed chunks
        for await (const chunk of streamResult.stream) {
            const chunkText = chunk.text();
            fullResponseText += chunkText; // Accumulate for final parsing
            res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunkText })}\n\n`); // Send each chunk as an SSE
        }

        // After the stream ends, parse the full response and send final data
        const parsedResponse = JSON.parse(fullResponseText);

        // Ensure actionItems and nextSteps are always arrays, even if Gemini returns "None" as a string
        if (parsedResponse.actionItems && !Array.isArray(parsedResponse.actionItems)) {
            parsedResponse.actionItems = [parsedResponse.actionItems];
        }
        if (parsedResponse.nextSteps && !Array.isArray(parsedResponse.nextSteps)) {
            parsedResponse.nextSteps = [parsedResponse.nextSteps];
        }

        // Send the final, parsed JSON object
        res.write(`data: ${JSON.stringify({ type: 'final', content: parsedResponse })}\n\n`);
        res.end(); // End the response stream

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        let errorMessage = "Failed to generate content. Please try again.";
        if (error.response && error.response.data && error.response.data.error) {
            errorMessage = error.response.data.error.message || errorMessage;
        } else if (error.message) {
            errorMessage = error.message;
        }
        // Send error message as an SSE event
        res.write(`data: ${JSON.stringify({ type: 'error', content: `AI generation failed: ${errorMessage}. This might be due to content length or an issue with the AI model.` })}\n\n`);
        res.end(); // End the response stream
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
    console.log(`Open your browser to http://localhost:${port}/index.html to use the app.`);
});
