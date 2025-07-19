/**
 * @file script.js
 * @description This file contains all the client-side JavaScript for the AI Content Assistant application.
 * It handles user interactions, API requests via the Fetch API with streaming, and dynamic UI updates.
 */

// --- DOM ELEMENT REFERENCES ---
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

// --- GLOBAL VARIABLES ---
let uploadedFile = null;
const HISTORY_KEY = 'aiContentAssistantHistory';

// --- HELPER FUNCTIONS ---
function isValidUrl(string) {
    try { new URL(string); return true; } catch (e) { return false; }
}

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

function saveToHistory(input, response, fileInfo = null) {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const newEntry = { timestamp: new Date().toISOString(), input, response, fileInfo };
    history.unshift(newEntry);
    history = history.slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    displayHistory();
}

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
        historyItem.className = 'bg-slate-50 p-3 rounded-lg border border-slate-200/50 text-slate-800 relative group cursor-pointer hover:bg-white/80 hover:border-purple-300 transition-all duration-200';
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

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    displayHistory();
}

processBtn.addEventListener('click', async () => {
    const inputContent = contentInput.value.trim();
    if (inputContent === '' && !uploadedFile) {
        alert('Please enter text, a URL, or upload a file.');
        return;
    }

    loadingSpinner.classList.remove('hidden');
    buttonText.textContent = 'Processing...';
    processBtn.disabled = true;
    summaryOutput.innerHTML = '';
    actionItemsOutput.innerHTML = '';
    nextStepsOutput.innerHTML = '';
    responseContainer.classList.remove('hidden', 'opacity-0');

    // Remove animation classes from previous runs
    document.querySelectorAll('.animate-slide-in').forEach(el => el.classList.remove('animate-slide-in'));


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

async function processStream(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponseText = "";

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
                    fullResponseText += parsedData.data.text;
                    summaryOutput.textContent = fullResponseText;
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

function displayFinalResponse(finalResponse) {
    // Add animation class to each card
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

function resetButtonState() {
    loadingSpinner.classList.add('hidden');
    buttonText.textContent = 'Process Content';
    processBtn.disabled = false;
}

// --- EVENT LISTENERS ---
clearBtn.addEventListener('click', clearContent);
clearHistoryBtn.addEventListener('click', clearHistory);
temperatureInput.addEventListener('input', () => { temperatureValue.textContent = temperatureInput.value; });
maxTokensInput.addEventListener('input', () => { maxTokensValue.textContent = maxTokensInput.value; });

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

// --- NEW: Interactive Aurora Effect Logic ---

/**
 * Attaches mouse tracking event listeners to all elements with the 'glass-card' class.
 * This function updates CSS custom properties (--mouse-x, --mouse-y) on the element,
 * which the CSS uses to position the radial gradient (the aurora glow).
 */
function initializeAuroraEffect() {
    const cards = document.querySelectorAll('.glass-card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            // Get the position of the card relative to the viewport
            const rect = card.getBoundingClientRect();
            // Calculate the mouse position relative to the card's top-left corner
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Set the CSS custom properties on the card element
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        });
    });
}


// --- INITIALIZATION ---
// When the page first loads, initialize history and the new aurora effect.
document.addEventListener('DOMContentLoaded', () => {
    displayHistory();
    initializeAuroraEffect();
});