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
const authBtn = document.getElementById('authBtn');
const userInfo = document.getElementById('userInfo');
const userEmail = document.getElementById('userEmail');
const logoutBtn = document.getElementById('logoutBtn');
const authModal = document.getElementById('authModal');
const closeAuthModalBtn = document.getElementById('closeAuthModalBtn');
const authTitle = document.getElementById('authTitle');
const authError = document.getElementById('authError');
const authForm = document.getElementById('authForm');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const authSubmitBtn = document.getElementById('authSubmitBtn');
const authToggleText = document.getElementById('authToggleText');
const authToggleBtn = document.getElementById('authToggleBtn');
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
let isLoginMode = true;
let currentUser = null;
let currentActionItems = [];
let selectedService = null;

// --- FIREBASE INITIALIZATION ---
// IMPORTANT: You need to replace these with your actual Firebase project configuration values.
// Get these from your Firebase Console > Project Settings > General > Your apps > Firebase SDK snippet
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check if Firebase config is properly set
if (firebaseConfig.apiKey === "YOUR_FIREBASE_API_KEY") {
  console.error("Firebase configuration not set. Please update the firebaseConfig object with your actual Firebase project values.");
  alert("Firebase is not configured. Authentication features will not work. Please check the console for instructions.");
}

// Initialize Firebase using the global 'firebase' object from the script tags in index.html.
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

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
    // Only save to localStorage if user is not logged in
    // When user is logged in, history is automatically saved by the backend
    if (currentUser) {
        console.log('User is logged in - history saved to cloud automatically');
        return;
    }

    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const newEntry = { timestamp: new Date().toISOString(), input, response, fileInfo };
    history.unshift(newEntry);
    history = history.slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    displayHistory(history);
}

async function fetchHistory() {
    if (!currentUser) {
        // If user is logged out, load from local storage
        const localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        displayHistory(localHistory);
        return;
    }

    try {
        const idToken = await currentUser.getIdToken();
        const response = await fetch('https://ai-content-assistant-backend.onrender.com/history', {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch history.');
        }

        const history = await response.json();
        displayHistory(history);
    } catch (error) {
        console.error('Error fetching cloud history:', error);
        // Fallback to local history if cloud fetch fails
        const localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        displayHistory(localHistory);
    }
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
        if (entry.timestamp && entry.timestamp._seconds) {
            // Firestore timestamp
            timestamp = new Date(entry.timestamp._seconds * 1000);
        } else if (entry.timestamp && entry.timestamp.seconds) {
            // Alternative Firestore timestamp format
            timestamp = new Date(entry.timestamp.seconds * 1000);
        } else {
            // ISO string from localStorage
            timestamp = new Date(entry.timestamp);
        }
        
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
    if (currentUser) {
        if (confirm("Are you sure you want to clear your cloud history? This action cannot be undone.")) {
            // For now, we'll just hide the history locally
            // In a future version, you could add a backend endpoint to clear cloud history
            displayHistory([]);
            alert("History cleared from view. Note: Cloud history clearing will be implemented in a future update.");
        }
    } else {
        localStorage.removeItem(HISTORY_KEY);
        displayHistory([]);
    }
}

processBtn.addEventListener('click', async () => {
    if (!currentUser) {
        alert("Please log in to process content.");
        return;
    }
    
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
        const idToken = await currentUser.getIdToken();
        const payload = {
            temperature: parseFloat(temperatureInput.value),
            maxOutputTokens: parseInt(maxTokensInput.value),
        };

        if (uploadedFile) {
            if (uploadedFile.type.startsWith('image/')) {
                payload.image = uploadedFile.base64;
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

        const response = await fetch(`https://ai-content-assistant-backend.onrender.com/generate-content`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}` // Add the token here
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            if (response.status === 403) throw new Error("Authentication failed. Please log in again.");
            throw new Error(`Server error: ${response.statusText}`);
        }
        
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
                    fetchHistory(); // Refresh history from the cloud after a successful generation
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

// --- AUTHENTICATION LOGIC ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    authTitle.textContent = isLoginMode ? 'Login' : 'Sign Up';
    authSubmitBtn.textContent = isLoginMode ? 'Login' : 'Sign Up';
    authToggleText.textContent = isLoginMode ? "Don't have an account?" : "Already have an account?";
    authToggleBtn.textContent = isLoginMode ? 'Sign Up' : 'Login';
    authError.classList.add('hidden');
}

function updateUIForAuthState(user) {
    currentUser = user; // Update the global user state
    if (user) {
        authBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userInfo.classList.add('flex');
        userEmail.textContent = user.email;
        // Fetch cloud history on login and migrate local history if needed
        migrateLocalHistoryToCloud().then(() => {
            fetchHistory();
        });
    } else {
        authBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        userInfo.classList.remove('flex');
        userEmail.textContent = '';
        const localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        displayHistory(localHistory); // Fallback to local history on logout
    }
}

auth.onAuthStateChanged(user => {
    updateUIForAuthState(user);
});

authBtn.addEventListener('click', () => {
    authModal.classList.remove('hidden');
});

closeAuthModalBtn.addEventListener('click', () => {
    authModal.classList.add('hidden');
});

authToggleBtn.addEventListener('click', toggleAuthMode);

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;
    authError.classList.add('hidden');

    try {
        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            await auth.createUserWithEmailAndPassword(email, password);
        }
        authModal.classList.add('hidden');
        authForm.reset();
    } catch (error) {
        authError.textContent = error.message;
        authError.classList.remove('hidden');
    }
});

logoutBtn.addEventListener('click', async () => {
    await auth.signOut();
});

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

// --- NEW: HISTORY MIGRATION FUNCTION ---
async function migrateLocalHistoryToCloud() {
    if (!currentUser) return;
    
    const localHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (localHistory.length === 0) return;
    
    try {
        const idToken = await currentUser.getIdToken();
        
        // Check if user already has cloud history
        const response = await fetch('https://ai-content-assistant-backend.onrender.com/history', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        
        if (response.ok) {
            const cloudHistory = await response.json();
            
            // If user has no cloud history, offer to migrate local history
            if (cloudHistory.length === 0 && localHistory.length > 0) {
                const shouldMigrate = confirm(
                    `You have ${localHistory.length} items in your local history. ` +
                    "Would you like to sync them to your cloud account?"
                );
                
                if (shouldMigrate) {
                    // Note: This would require a backend endpoint to bulk import history
                    // For now, we'll just clear local storage after login
                    console.log('Local history migration requested - feature to be implemented');
                }
            }
        }
        
        // Clear local storage after successful login to avoid confusion
        localStorage.removeItem(HISTORY_KEY);
        
    } catch (error) {
        console.error('Error during history migration:', error);
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    displayHistory([]); // Start with an empty history
    
    const savedTheme = localStorage.getItem('aiAssistantTheme') || 'theme-midnight';
    setTheme(savedTheme);
    
    initializeScrollAnimations();

    lucide.createIcons();
});