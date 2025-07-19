// script.js (Updated for POST requests with fetch)

// --- Get references to DOM elements ---
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
const imageUpload = document.getElementById('imageUpload');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewImg = imagePreview.querySelector('img');
const clearImageBtn = document.getElementById('clearImageBtn');
let uploadedImageBase64 = null;

// --- Helper Functions ---
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
    imageUpload.value = '';
    uploadedImageBase64 = null;
    imagePreview.classList.add('hidden');
    imagePreviewImg.src = '#';
    lucide.createIcons();
}

// --- Copy to Clipboard Logic ---
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

// --- Local Storage History ---
const HISTORY_KEY = 'aiContentAssistantHistory';
function saveToHistory(input, response, image = null) {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const newEntry = { timestamp: new Date().toISOString(), input, response, image };
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
        historyItem.className = 'bg-slate-50 p-3 rounded-lg border border-slate-200 relative group cursor-pointer hover:bg-purple-50 hover:border-purple-300 transition-all duration-200';
        const displayInput = entry.input ? entry.input.substring(0, 100) + (entry.input.length > 100 ? '...' : '') : 'Image Input';
        historyItem.innerHTML = `<p class="text-xs text-slate-500 mb-2">${new Date(entry.timestamp).toLocaleString()}</p><p class="font-semibold text-slate-700 truncate">${displayInput}</p>`;
        historyItem.dataset.index = index;
        historyList.appendChild(historyItem);
        historyItem.addEventListener('click', () => {
            const entryToLoad = history[index];
            if (entryToLoad) {
                contentInput.value = entryToLoad.input || '';
                if (entryToLoad.image) {
                    uploadedImageBase64 = entryToLoad.image;
                    imagePreviewImg.src = entryToLoad.image;
                    imagePreview.classList.remove('hidden');
                } else {
                    uploadedImageBase64 = null;
                    imagePreview.classList.add('hidden');
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
clearHistoryBtn.addEventListener('click', clearHistory);

// --- Main Process Button Logic (Using Fetch API) ---
processBtn.addEventListener('click', async () => {
    const inputContent = contentInput.value.trim();
    if (inputContent === '' && !uploadedImageBase64) {
        alert('Please enter text, a URL, or upload an image.');
        return;
    }

    loadingSpinner.classList.remove('hidden');
    buttonText.textContent = 'Processing...';
    processBtn.disabled = true;
    summaryOutput.innerHTML = '';
    actionItemsOutput.innerHTML = '';
    nextStepsOutput.innerHTML = '';
    responseContainer.classList.remove('hidden', 'opacity-0');

    let fullResponseText = "";

    try {
        const payload = {
            temperature: parseFloat(temperatureInput.value),
            maxOutputTokens: parseInt(maxTokensInput.value),
        };
        if (uploadedImageBase64) {
            payload.image = uploadedImageBase64;
            payload.text = inputContent || "Describe this image.";
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

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

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
                        saveToHistory(inputContent || "Image Input", finalResponse, uploadedImageBase64);
                        resetButtonState();
                    } else if (parsedData.type === 'error') {
                        throw new Error(parsedData.data.message);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Request failed:', error);
        alert(`An error occurred: ${error.message}`);
        resetButtonState();
    }
});

function displayFinalResponse(finalResponse) {
    summaryOutput.textContent = finalResponse.summary || 'No summary generated.';
    
    actionItemsOutput.innerHTML = '';
    if (finalResponse.actionItems && finalResponse.actionItems.length > 0 && finalResponse.actionItems[0] !== "None identified.") {
        finalResponse.actionItems.forEach(item => {
            const li = document.createElement('li');
            li.className = "flex items-start p-2 -mx-2 rounded-lg hover:bg-green-50";
            li.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5 text-green-500 mr-3 mt-1 flex-shrink-0"></i><span class="text-slate-700">${item}</span>`;
            actionItemsOutput.appendChild(li);
        });
    } else {
        actionItemsOutput.innerHTML = '<li class="text-slate-500 italic">No action items identified.</li>';
    }

    nextStepsOutput.innerHTML = '';
    if (finalResponse.nextSteps && finalResponse.nextSteps.length > 0 && finalResponse.nextSteps[0] !== "No further suggestions.") {
        finalResponse.nextSteps.forEach(step => {
            const li = document.createElement('li');
            li.className = "flex items-start p-2 -mx-2 rounded-lg hover:bg-yellow-50";
            li.innerHTML = `<i data-lucide="lightbulb" class="w-5 h-5 text-yellow-500 mr-3 mt-1 flex-shrink-0"></i><span class="text-slate-700">${step}</span>`;
            nextStepsOutput.appendChild(li);
        });
    } else {
        nextStepsOutput.innerHTML = '<li class="text-slate-500 italic">No next steps suggested.</li>';
    }
    lucide.createIcons();
}

function resetButtonState() {
    loadingSpinner.classList.add('hidden');
    buttonText.textContent = 'Process Content';
    processBtn.disabled = false;
}

// --- Event Listeners ---
clearBtn.addEventListener('click', clearContent);
temperatureInput.addEventListener('input', () => { temperatureValue.textContent = temperatureInput.value; });
maxTokensInput.addEventListener('input', () => { maxTokensValue.textContent = maxTokensInput.value; });

imageUpload.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        contentInput.value = '';
        const reader = new FileReader();
        reader.onload = (e) => {
            uploadedImageBase64 = e.target.result;
            imagePreviewImg.src = e.target.result;
            imagePreview.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }
});

clearImageBtn.addEventListener('click', () => {
    imageUpload.value = '';
    uploadedImageBase64 = null;
    imagePreview.classList.add('hidden');
    imagePreviewImg.src = '#';
});

contentInput.addEventListener('input', () => {
    if (contentInput.value.trim() !== '') {
        clearImageBtn.click();
    }
});

// Load history on page start
document.addEventListener('DOMContentLoaded', displayHistory);