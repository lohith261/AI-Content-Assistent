/**
 * @file script.js
 * @description This file contains all the client-side JavaScript for the AI Content Assistant application.
 * It handles user interactions, API requests via the Fetch API with streaming, and dynamic UI updates,
 * including the interactive Aurora effect and loading skeletons.
 */

// --- DOM ELEMENT REFERENCES ---
// Get references to all the necessary HTML elements to avoid repeated DOM lookups.
const contentInput = document.getElementById('contentInput');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn');
const responseContainer = document.getElementById('responseContainer');
const summaryOutput = document.getElementById('summaryOutput');
const actionItemsOutput = document.getElementById('actionItemsOutput');
const nextStepsOutput = document.getElementById('nextStepsOutput');
const loadingSpinner = document.getElementById('loadingSpinner');
const buttonText = document.getElementById('buttonText');
const copyButtons = document.querySelectorAll('.copy-btn');
const historyContainer = document.getElementById('historyContainer');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const temperatureInput = document.getElementById('temperatureInput');
const temperatureValue = document.getElementById('temperatureValue');
const maxTokensInput = document.getElementById('maxTokensInput');
const maxTokensValue = document.getElementById('maxTokensValue');
const fileUpload = document.getElementById('fileUpload');
const filePreview = document.getElementById('filePreview');
const filePreviewName = document.getElementById('filePreviewName');
const clearFileBtn = document.getElementById('clearFileBtn');
// NEW: Add references to skeleton loaders
const summarySkeleton = document.getElementById('summarySkeleton');
const actionItemsSkeleton = document.getElementById('actionItemsSkeleton');
const nextStepsSkeleton = document.getElementById('nextStepsSkeleton');


// --- GLOBAL VARIABLES ---
let uploadedFile = null; // Stores the currently uploaded file data (name, type, base64 content).
const HISTORY_KEY = 'aiContentAssistantHistory'; // Key for storing history in the browser's localStorage.

// --- HELPER FUNCTIONS ---

/**
 * Checks if a given string is a valid URL.
 * @param {string} string The string to validate.
 * @returns {boolean} True if the string is a valid URL, false otherwise.
 */
function isValidUrl(string) {
    try { new URL(string); return true; } catch (e) { return false; }
}

/**
 * Resets the entire UI to its initial state, clearing all inputs and outputs.
 */
function clearContent() {
    contentInput.value = '';
    summaryOutput.innerHTML = '';
    actionItemsOutput.innerHTML = '';
    nextStepsOutput.innerHTML = '';
    responseContainer.classList.add('opacity-0', 'hidden');
    processBtn.disabled = false;
    buttonText.textContent = 'Process Content';
    loadingSpinner.classList.add('hidden');
    
    fileUpload.value = '';
    uploadedFile = null;
    filePreview.classList.add('hidden');
    filePreviewName.textContent = '';

    lucide.createIcons();
}

// --- CORE APPLICATION LOGIC ---

/**
 * Handles the click event for all copy buttons.
 * It reads the content from the target element, copies it to the clipboard,
 * and provides visual feedback to the user by toggling a 'copied' class.
 */
copyButtons.forEach(button => {
    button.addEventListener('click', async () => {
        const targetId = button.dataset.target;
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            let textToCopy = '';
            if (targetElement.tagName === 'UL') {
                Array.from(targetElement.children).forEach(li => {
                    textToCopy += `• ${li.textContent.trim()}\n`;
                });
            } else {
                textToCopy = targetElement.innerText;
            }
            textToCopy = textToCopy.trim();
            if (!textToCopy) return;

            try {
                await navigator.clipboard.writeText(textToCopy);
                button.classList.add('copied');
                setTimeout(() => button.classList.remove('copied'), 2000);
            } catch (err) {
                console.error('Failed to copy text:', err);
                alert('Could not copy text.');
            }
        }
    });
});

/**
 * Saves a completed analysis session to the browser's localStorage.
 * @param {string} input The user's original text or URL input.
 * @param {object} response The final parsed JSON response from the AI.
 * @param {object | null} fileInfo Information about the file that was processed.
 */
function saveToHistory(input, response, fileInfo = null) {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const newEntry = { timestamp: new Date().toISOString(), input, response, fileInfo };
    history.unshift(newEntry);
    history = history.slice(0, 5); // Keep only the last 5 entries
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    displayHistory();
}

/**
 * Reads the history from localStorage and dynamically builds the "Recent History" list in the UI.
 */
function displayHistory() {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    historyList.innerHTML = '';
    if (history.length === 0) {
        historyContainer.classList.add('hidden');
        return;
    }
    historyContainer.classList.remove('hidden');
    history.forEach((entry, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'glass-card bg-slate-50 p-3 rounded-lg border border-slate-200/50 text-slate-800 relative group cursor-pointer hover:bg-white/80 hover:border-purple-300 transition-all duration-200';
        const displayInput = entry.input || (entry.fileInfo ? entry.fileInfo.name : 'Unknown Input');
        historyItem.innerHTML = `<p class="text-xs text-slate-500 mb-2">${new Date(entry.timestamp).toLocaleString()}</p><p class="font-semibold text-slate-700 truncate">${displayInput}</p>`;
        historyItem.dataset.index = index;
        historyList.appendChild(historyItem);
        historyItem.addEventListener('click', () => {
            const entryToLoad = history[index];
            if (entryToLoad) {
                contentInput.value = entryToLoad.input || '';
                if (entryToLoad.fileInfo) {
                    uploadedFile = entryToLoad.fileInfo;
                    showFilePreview(uploadedFile.name, uploadedFile.type);
                } else {
                    uploadedFile = null;
                    filePreview.classList.add('hidden');
                }
                displayFinalResponse(entryToLoad.response);
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
}

/**
 * Clears all items from the history in localStorage and updates the UI.
 */
function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    displayHistory();
}

/**
 * Main function that is triggered when the "Process Content" button is clicked.
 */
processBtn.addEventListener('click', async () => {
    const inputContent = contentInput.value.trim();
    if (inputContent === '' && !uploadedFile) {
        alert('Please enter text, a URL, or upload a file.');
        return;
    }

    // Prepare the UI for a new request.
    loadingSpinner.classList.remove('hidden');
    buttonText.textContent = 'Processing...';
    processBtn.disabled = true;
    summaryOutput.innerHTML = '';
    actionItemsOutput.innerHTML = '';
    nextStepsOutput.innerHTML = '';
    responseContainer.classList.remove('hidden', 'opacity-0');
    document.querySelectorAll('.animate-slide-in').forEach(el => el.classList.remove('animate-slide-in'));

    // --- NEW: Show skeleton loaders and hide actual content areas ---
    summarySkeleton.classList.remove('hidden');
    actionItemsSkeleton.classList.remove('hidden');
    nextStepsSkeleton.classList.remove('hidden');
    summaryOutput.classList.add('hidden');
    actionItemsOutput.classList.add('hidden');
    nextStepsOutput.classList.add('hidden');

    let fullResponseText = "";
    let historyInput = inputContent;

    try {
        const payload = {
            temperature: parseFloat(temperatureInput.value),
            maxOutputTokens: parseInt(maxTokensInput.value),
        };

        if (uploadedFile) {
            historyInput = null;
            if (uploadedFile.type.startsWith('image/')) {
                payload.image = uploadedFile.base64;
                if (inputContent) payload.text = inputContent;
            } else {
                payload.document = {
                    name: uploadedFile.name,
                    mimeType: uploadedFile.type,
                    base64: uploadedFile.base64.split(',')[1]
                };
            }
        } else if (isValidUrl(inputContent)) {
            payload.url = inputContent;
        } else {
            payload.text = inputContent;
        }

        const response = await fetch(`https://ai-content-assistant-backend.onrender.com/generate-content`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) throw new Error(`Server error: ${response.statusText}`);

        await processStream(response);

    } catch (error) {
        console.error('Request failed:', error);
        alert(`An error occurred: ${error.message}`);
        resetButtonState();
    }
});

/**
 * Reads the streaming response from the backend.
 * @param {Response} response The response object from the `fetch` API call.
 */
async function processStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponseText = "";
    let isFirstChunk = true; // Flag to handle the first chunk

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
            if (line.startsWith('data:')) {
                const jsonData = line.substring(5).trim();
                if (!jsonData) continue;
                
                const parsedData = JSON.parse(jsonData);

                if (parsedData.type === 'chunk') {
                    // On the first chunk of data, hide the skeletons and show the content areas.
                    if (isFirstChunk) {
                        summarySkeleton.classList.add('hidden');
                        actionItemsSkeleton.classList.add('hidden');
                        nextStepsSkeleton.classList.add('hidden');
                        summaryOutput.classList.remove('hidden');
                        actionItemsOutput.classList.remove('hidden');
                        nextStepsOutput.classList.remove('hidden');
                        isFirstChunk = false;
                    }

                    fullResponseText += parsedData.data.text;
                    summaryOutput.textContent = fullResponseText; // Live update
                } else if (parsedData.type === 'final') {
                    const finalResponse = JSON.parse(fullResponseText);
                    displayFinalResponse(finalResponse);
                    saveToHistory(contentInput.value.trim() || null, finalResponse, uploadedFile);
                    resetButtonState();
                } else if (parsedData.type === 'error') {
                    throw new Error(parsedData.data.message);
                }
            }
        }
    }
}

/**
 * Renders the final, complete JSON response from the AI into the UI.
 * @param {object} finalResponse The fully parsed JSON object from the AI.
 */
function displayFinalResponse(finalResponse) {
    // Hide skeletons and show content just in case they are still visible
    summarySkeleton.classList.add('hidden');
    actionItemsSkeleton.classList.add('hidden');
    nextStepsSkeleton.classList.add('hidden');
    summaryOutput.classList.remove('hidden');
    actionItemsOutput.classList.remove('hidden');
    nextStepsOutput.classList.remove('hidden');

    summaryOutput.closest('.glass-card').classList.add('animate-slide-in');
    actionItemsOutput.closest('.glass-card').classList.add('animate-slide-in');
    nextStepsOutput.closest('.glass-card').classList.add('animate-slide-in');
    
    summaryOutput.textContent = finalResponse.summary || 'No summary generated.';
    
    actionItemsOutput.innerHTML = '';
    if (finalResponse.actionItems && finalResponse.actionItems.length > 0 && finalResponse.actionItems[0] !== "None identified.") {
        finalResponse.actionItems.forEach(item => {
            const li = document.createElement('li');
            li.className = "flex items-start p-2 -mx-2 rounded-lg hover:bg-white/10";
            li.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5 text-white mr-3 mt-1 flex-shrink-0"></i><span class="text-slate-100">${item}</span>`;
            actionItemsOutput.appendChild(li);
        });
    } else {
        actionItemsOutput.innerHTML = '<li class="text-slate-300 italic">No action items identified.</li>';
    }

    nextStepsOutput.innerHTML = '';
    if (finalResponse.nextSteps && finalResponse.nextSteps.length > 0 && finalResponse.nextSteps[0] !== "No further suggestions.") {
        finalResponse.nextSteps.forEach(step => {
            const li = document.createElement('li');
            li.className = "flex items-start p-2 -mx-2 rounded-lg hover:bg-white/10";
            li.innerHTML = `<i data-lucide="lightbulb" class="w-5 h-5 text-white mr-3 mt-1 flex-shrink-0"></i><span class="text-slate-100">${step}</span>`;
            nextStepsOutput.appendChild(li);
        });
    } else {
        nextStepsOutput.innerHTML = '<li class="text-slate-300 italic">No next steps suggested.</li>';
    }
    lucide.createIcons();
}

/**
 * Resets the state of the "Process" button after a request is complete or fails.
 */
function resetButtonState() {
    loadingSpinner.classList.add('hidden');
    buttonText.textContent = 'Process Content';
    processBtn.disabled = false;
}

/**
 * Shows a preview of the uploaded file.
 * @param {string} name The name of the file.
 * @param {string} type The MIME type of the file.
 */
function showFilePreview(name, type) {
    if (type.startsWith('image/')) {
        filePreviewName.innerHTML = `<i data-lucide="image" class="mr-2"></i> ${name}`;
    } else if (type === 'application/pdf') {
        filePreviewName.innerHTML = `<i data-lucide="file-text" class="mr-2 text-red-400"></i> ${name}`;
    } else if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        filePreviewName.innerHTML = `<i data-lucide="file-text" class="mr-2 text-blue-400"></i> ${name}`;
    } else {
        filePreviewName.innerHTML = `<i data-lucide="file" class="mr-2"></i> ${name}`;
    }
    filePreview.classList.remove('hidden');
    lucide.createIcons();
}


// --- EVENT LISTENERS ---
clearBtn.addEventListener('click', clearContent);
clearHistoryBtn.addEventListener('click', clearHistory);
temperatureInput.addEventListener('input', () => { temperatureValue.textContent = temperatureInput.value; });
maxTokensInput.addEventListener('input', () => { maxTokensValue.textContent = maxTokensInput.value; });

fileUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        contentInput.value = '';
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedFile = { name: file.name, type: file.type, base64: e.target.result };
            showFilePreview(file.name, file.type);
        };
        reader.readAsDataURL(file);
    }
});

clearFileBtn.addEventListener('click', () => {
    fileUpload.value = '';
    uploadedFile = null;
    filePreview.classList.add('hidden');
});

contentInput.addEventListener('input', () => {
    if (contentInput.value.trim() !== '') {
        clearFileBtn.click();
    }
});

/**
 * Attaches mouse tracking event listeners to all 'glass-card' elements for the Aurora effect.
 */
function initializeAuroraEffect() {
    const cards = document.querySelectorAll('.glass-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });
}

// --- INITIALIZATION ---
// When the page first loads, initialize history, the aurora effect, and icons.
document.addEventListener('DOMContentLoaded', () => {
    displayHistory();
    initializeAuroraEffect();
    lucide.createIcons();
});