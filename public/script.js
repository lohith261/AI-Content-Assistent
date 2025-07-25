/**
 * @file script.js
 * @description Client-side JavaScript for the AI Content Assistant.
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
const summarySkeleton = document.getElementById('summarySkeleton');
const actionItemsSkeleton = document.getElementById('actionItemsSkeleton');
const nextStepsSkeleton = document.getElementById('nextStepsSkeleton');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themePanel = document.getElementById('themePanel');
const themeButtons = document.querySelectorAll('.theme-btn');
const exportActionsBtn = document.getElementById('exportActionsBtn');
const exportMenu = document.getElementById('exportMenu');
const exportOptions = document.querySelectorAll('.export-option');
const taskManagerModal = document.getElementById('taskManagerModal');
const closeTaskManagerModalBtn = document.getElementById('closeTaskManagerModalBtn');
const taskManagerTitle = document.getElementById('taskManagerTitle');
const serviceIcon = document.getElementById('serviceIcon');
const taskManagerContent = document.getElementById('taskManagerContent');
const cancelTaskManagerBtn = document.getElementById('cancelTaskManagerBtn');
const confirmTaskManagerBtn = document.getElementById('confirmTaskManagerBtn');
const confirmBtnText = document.getElementById('confirmBtnText');
const confirmBtnSpinner = document.getElementById('confirmBtnSpinner');

// --- GLOBAL VARIABLES ---
let uploadedFile = null;
const HISTORY_KEY = 'aiContentAssistantHistory';
let currentActionItems = [];
let selectedService = null;

// --- HELPER FUNCTIONS ---
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
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
    displayHistory(history);
}

function fetchHistory() {
    const localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    displayHistory(localHistory);
}

function displayHistory(history) {
    historyList.innerHTML = '';
    if (!history || history.length === 0) {
        historyContainer.classList.add('hidden');
        return;
    }
    historyContainer.classList.remove('hidden');
    history.forEach((entry, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'glass-card';
        const displayInput = entry.input || (entry.fileInfo ? entry.fileInfo.name : 'Unknown Input');
        
        // Handle different timestamp formats (Firestore vs localStorage)
        let timestamp;
        timestamp = new Date(entry.timestamp);
        
        historyItem.innerHTML = `
            <div class="card-content p-3">
                <p class="text-xs text-slate-400 mb-2">${timestamp.toLocaleString()}</p>
                <p class="font-semibold text-slate-200 truncate">${displayInput}</p>
            </div>
        `;
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
        historyList.appendChild(historyItem);
    });
}

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    displayHistory([]);
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
    responseContainer.classList.add('hidden', 'opacity-0');
    document.querySelectorAll('.animate-slide-in').forEach(el => el.classList.remove('animate-slide-in'));

    summarySkeleton.classList.remove('hidden');
    actionItemsSkeleton.classList.remove('hidden');
    nextStepsSkeleton.classList.remove('hidden');
    summaryOutput.classList.add('hidden');
    actionItemsOutput.classList.add('hidden');
    nextStepsOutput.classList.add('hidden');

    try {
        const payload = {
            temperature: parseFloat(temperatureInput.value),
            maxOutputTokens: parseInt(maxTokensInput.value),
        };

        // Determine the correct input description for the history log
        let inputForHistory = inputContent;

        if (uploadedFile) {
            inputForHistory = uploadedFile.name; // Default to file name for history
            if (uploadedFile.type.startsWith('image/')) {
                payload.image = uploadedFile.base64;
                inputForHistory = 'Image Input'; // Use a generic description for images
            } else if (uploadedFile.type === 'application/pdf' || 
                      uploadedFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                payload.document = {
                    name: uploadedFile.name,
                    mimeType: uploadedFile.type,
                    base64: uploadedFile.base64.split(',')[1] // Remove data URL prefix
                };
            }
        } else if (isValidUrl(inputContent)) {
            payload.url = inputContent;
        } else {
            payload.text = inputContent;
        }

        const response = await fetch('https://ai-content-assistant-backend.onrender.com/generate-content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Server error: ${response.statusText}`);
        }
        
        // CORRECT: Call processStream only ONCE with the correct history text
        await processStream(response, inputForHistory);

    } catch (error) {
        console.error('Request failed:', error);
        alert(`An error occurred: ${error.message}`);
        resetButtonState();
    }
});

async function processStream(response, inputContent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponseText = "";
    let isFirstChunk = true;

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
                    if (isFirstChunk) {
                        responseContainer.classList.remove('hidden', 'opacity-0');
                        summarySkeleton.classList.add('hidden');
                        actionItemsSkeleton.classList.add('hidden');
                        nextStepsSkeleton.classList.add('hidden');
                        summaryOutput.classList.remove('hidden');
                        actionItemsOutput.classList.remove('hidden');
                        nextStepsOutput.classList.remove('hidden');
                        isFirstChunk = false;
                    }

                    fullResponseText += parsedData.data.text;
                    summaryOutput.textContent = fullResponseText;
                } else if (parsedData.type === 'final') {
                    const finalResponse = JSON.parse(fullResponseText);
                    displayFinalResponse(finalResponse);
                    saveToHistory(inputContent, finalResponse, uploadedFile);
                    resetButtonState();
                } else if (parsedData.type === 'error') {
                    throw new Error(parsedData.data.message);
                }
            }
        }
    }
}

function displayFinalResponse(finalResponse) {
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
        currentActionItems = finalResponse.actionItems; // Store for export functionality
        finalResponse.actionItems.forEach(item => {
            const li = document.createElement('li');
            li.className = "flex items-start p-2 -mx-2 rounded-lg hover:bg-white/5";
            li.innerHTML = `<i data-lucide="check-circle-2" class="w-5 h-5 text-green-400 mr-3 mt-1 flex-shrink-0"></i><span class="text-slate-300">${item}</span>`;
            actionItemsOutput.appendChild(li);
        });
    } else {
        currentActionItems = []; // Clear if no action items
        actionItemsOutput.innerHTML = '<li class="text-slate-500 italic">No action items identified.</li>';
    }

    nextStepsOutput.innerHTML = '';
    if (finalResponse.nextSteps && finalResponse.nextSteps.length > 0 && finalResponse.nextSteps[0] !== "No further suggestions.") {
        finalResponse.nextSteps.forEach(step => {
            const li = document.createElement('li');
            li.className = "flex items-start p-2 -mx-2 rounded-lg hover:bg-white/5";
            li.innerHTML = `<i data-lucide="lightbulb" class="w-5 h-5 text-yellow-400 mr-3 mt-1 flex-shrink-0"></i><span class="text-slate-300">${step}</span>`;
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
    if (!file) return;

    contentInput.value = ''; // Clear the textarea for new input
    const reader = new FileReader();

    // Check the file type to decide how to read it
    if (file.type.startsWith('image/') || file.type === 'application/pdf' || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        // For images, PDFs, and DOCX, read as Base64 for backend processing
        reader.onload = (e) => {
            uploadedFile = { name: file.name, type: file.type, base64: e.target.result };
            showFilePreview(file.name, file.type);
        };
        reader.readAsDataURL(file);
    } else if (file.type === 'text/plain') {
        // *** NEW: For plain text files, read the content and put it in the textarea ***
        reader.onload = (e) => {
            contentInput.value = e.target.result;
            // Clear the file upload state, as we are now treating it as a text submission
            uploadedFile = null;
            fileUpload.value = '';
            filePreview.classList.add('hidden');
        };
        reader.readAsText(file); // Read the file as plain text
    } else {
        // Handle unsupported file types
        alert(`Unsupported file type: ${file.type}. Please upload an image, PDF, DOCX, or TXT file.`);
        fileUpload.value = ''; // Reset the input
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

// --- THEME SWITCHER LOGIC ---
function setTheme(themeName) {
    document.body.className = document.body.className.replace(/theme-\w+/g, '').trim();
    document.body.classList.add(themeName);
    localStorage.setItem('aiAssistantTheme', themeName);
}

themeToggleBtn.addEventListener('click', () => {
    themePanel.classList.toggle('hidden');
    setTimeout(() => {
        themePanel.classList.toggle('opacity-0');
        themePanel.classList.toggle('scale-95');
    }, 10);
});

themeButtons.forEach(button => {
    button.addEventListener('click', () => {
        const themeName = button.dataset.theme;
        setTheme(themeName);
    });
});

// --- SCROLL ANIMATION LOGIC ---
function initializeScrollAnimations() {
    const animatedElements = document.querySelectorAll('.scroll-animate');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            }
        });
    }, { threshold: 0.1 });
    animatedElements.forEach(el => observer.observe(el));
}

// Task Manager Integration Event Listeners
exportActionsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportMenu.classList.toggle('hidden');
});

// Close export menu when clicking outside
document.addEventListener('click', (e) => {
    if (!exportActionsBtn.contains(e.target) && !exportMenu.contains(e.target)) {
        exportMenu.classList.add('hidden');
    }
});

exportOptions.forEach(option => {
    option.addEventListener('click', () => {
        const service = option.dataset.service;
        exportMenu.classList.add('hidden');
        
        if (service === 'copy') {
            copyActionItemsToClipboard();
        } else {
            showTaskManagerModal(service);
        }
    });
});

closeTaskManagerModalBtn.addEventListener('click', () => {
    taskManagerModal.classList.add('hidden');
});

cancelTaskManagerBtn.addEventListener('click', () => {
    taskManagerModal.classList.add('hidden');
});

confirmTaskManagerBtn.addEventListener('click', exportToTaskManager);

// --- TASK MANAGER EXPORT FUNCTIONS ---
function copyActionItemsToClipboard() {
    if (currentActionItems.length === 0) {
        alert('No action items to copy.');
        return;
    }
    
    let textToCopy = 'Action Items:\n\n';
    currentActionItems.forEach((item, index) => {
        textToCopy += `${index + 1}. ${item}\n`;
    });
    
    navigator.clipboard.writeText(textToCopy).then(() => {
        alert('Action items copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard.');
    });
}

function showTaskManagerModal(service) {
    if (currentActionItems.length === 0) {
        alert('No action items to export.');
        return;
    }
    
    selectedService = service;
    const serviceNames = {
        'trello': 'Trello',
        'asana': 'Asana', 
        'notion': 'Notion',
        'todoist': 'Todoist'
    };
    
    const serviceIcons = {
        'trello': 'trello',
        'asana': 'target',
        'notion': 'book-open',
        'todoist': 'check-square'
    };
    
    taskManagerTitle.textContent = `Export to ${serviceNames[service]}`;
    serviceIcon.setAttribute('data-lucide', serviceIcons[service]);
    
    // Show action items in modal
    taskManagerContent.innerHTML = `
        <p class="text-slate-300 mb-4">The following action items will be exported to ${serviceNames[service]}:</p>
        <ul class="space-y-2 mb-4">
            ${currentActionItems.map(item => `
                <li class="flex items-start p-2 bg-white/5 rounded-lg">
                    <i data-lucide="check-circle-2" class="w-4 h-4 text-green-400 mr-2 mt-0.5 flex-shrink-0"></i>
                    <span class="text-slate-300 text-sm">${item}</span>
                </li>
            `).join('')}
        </ul>
    `;
    
    taskManagerModal.classList.remove('hidden');
    lucide.createIcons();
}

async function exportToTaskManager() {
    if (!selectedService || currentActionItems.length === 0) {
        return;
    }
    
    // Show loading state
    confirmBtnText.classList.add('hidden');
    confirmBtnSpinner.classList.remove('hidden');
    confirmTaskManagerBtn.disabled = true;
    
    try {
        const baseUrls = {
            'trello': 'https://trello.com/add-card?',
            'asana': 'https://app.asana.com/0/inbox/create?',
            'notion': 'https://www.notion.so/new?',
            'todoist': 'https://todoist.com/showTask?'
        };
        
        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        
        for (let i = 0; i < currentActionItems.length; i++) {
            const item = currentActionItems[i];
            let url = '';
            
            switch (selectedService) {
                case 'trello':
                    url = `${baseUrls.trello}name=${encodeURIComponent(item)}&desc=${encodeURIComponent('Generated by AI Content Assistant')}`;
                    break;
                case 'asana':
                    url = `${baseUrls.asana}name=${encodeURIComponent(item)}&notes=${encodeURIComponent('Generated by AI Content Assistant')}`;
                    break;
                case 'notion':
                    url = `${baseUrls.notion}title=${encodeURIComponent(item)}&content=${encodeURIComponent('Generated by AI Content Assistant')}`;
                    break;
                case 'todoist':
                    url = `${baseUrls.todoist}content=${encodeURIComponent(item)}&description=${encodeURIComponent('Generated by AI Content Assistant')}`;
                    break;
            }
            
            if (url) {
                window.open(url, '_blank');
                // Add delay between opening tabs to prevent browser blocking
                if (i < currentActionItems.length - 1) {
                    await delay(500);
                }
            }
        }
        
        // Close modal and reset state
        taskManagerModal.classList.add('hidden');
        alert(`Successfully exported ${currentActionItems.length} action items to ${selectedService}!`);
        
    } catch (error) {
        console.error('Export failed:', error);
        alert('Failed to export action items. Please try again.');
    } finally {
        // Reset button state
        confirmBtnText.classList.remove('hidden');
        confirmBtnSpinner.classList.add('hidden');
        confirmTaskManagerBtn.disabled = false;
        selectedService = null;
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    fetchHistory(); // Load history from localStorage
    
    const savedTheme = localStorage.getItem('aiAssistantTheme') || 'theme-midnight';
    setTheme(savedTheme);
    
    initializeScrollAnimations();

    lucide.createIcons();
});