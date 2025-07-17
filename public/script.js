// script.js

// Get references to DOM elements
const contentInput = document.getElementById('contentInput');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn');
const responseContainer = document.getElementById('responseContainer');
const summaryOutput = document.getElementById('summaryOutput');
const actionItemsOutput = document.getElementById('actionItemsOutput');
const nextStepsOutput = document.getElementById('nextStepsOutput');
const loadingSpinner = document.getElementById('loadingSpinner');
const buttonText = document.getElementById('buttonText');
const errorMessage = document.getElementById('errorMessage');

// Get all copy buttons
const copyButtons = document.querySelectorAll('.copy-btn');
// Get all example buttons
const exampleButtons = document.querySelectorAll('.example-btn');

// Elements for history display
const historyContainer = document.createElement('div'); // Will be appended to body
historyContainer.id = 'historyContainer';
historyContainer.className = 'bg-white rounded-xl shadow-lg p-8 w-full max-w-2xl border border-gray-200 mt-8 hidden';
historyContainer.innerHTML = `
    <h2 class="text-2xl font-bold text-gray-800 mb-4 flex items-center justify-between">
        <span class="flex items-center"><i data-lucide="history" class="mr-2 text-purple-600"></i> Recent History</span>
        <button id="clearHistoryBtn" class="text-gray-500 hover:text-red-600 transition duration-150 flex items-center text-base">
            <i data-lucide="trash-2" class="w-4 h-4 mr-1"></i> Clear History
        </button>
    </h2>
    <div id="historyList" class="space-y-4">
        <!-- History items will be loaded here -->
    </div>
`;
document.body.appendChild(historyContainer); // Append early so we can get references

const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// Gemini Parameter elements
const temperatureInput = document.getElementById('temperatureInput');
const temperatureValue = document.getElementById('temperatureValue');
const maxTokensInput = document.getElementById('maxTokensInput');
const maxTokensValue = document.getElementById('maxTokensValue');

// --- Modal Elements (for user-friendly alerts) ---
const modal = document.createElement('div');
modal.id = 'alertModal';
modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center hidden z-50';
modal.innerHTML = `
    <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold text-gray-800" id="modalTitle">Alert</h3>
            <button class="text-gray-400 hover:text-gray-600" id="closeModalBtn">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>
        <p class="text-gray-700 mb-6" id="modalMessage"></p>
        <div class="flex justify-end">
            <button class="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-75 transition duration-200 ease-in-out" id="modalOkBtn">
                OK
            </button>
        </div>
    </div>
`;
document.body.appendChild(modal);

const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalOkBtn = document.getElementById('modalOkBtn');

// Function to show the custom alert modal
function showAlert(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modal.classList.remove('hidden');
}

// Event listeners for modal close buttons
closeModalBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
});
modalOkBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
});


// Function to validate URL (simple check)
function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (e) {
        return false;
    }
}

// Function to clear all content and reset UI
function clearContent() {
    contentInput.value = ''; // Clear input textarea
    summaryOutput.innerHTML = '';
    actionItemsOutput.innerHTML = '';
    nextStepsOutput.innerHTML = '';
    // Hide response container with fade-out effect
    responseContainer.classList.add('opacity-0');
    responseContainer.addEventListener('transitionend', () => {
        responseContainer.classList.add('hidden');
    }, { once: true }); // Ensure listener runs only once
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
    processBtn.disabled = false;
    clearBtn.disabled = false; // Ensure clear button is enabled
    buttonText.textContent = 'Process Content';
    loadingSpinner.classList.add('hidden');
    lucide.createIcons(); // Re-initialize icons just in case
}

// --- Local Storage History Logic ---
const HISTORY_KEY = 'aiContentAssistantHistory';

function saveToHistory(input, response) {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    const newEntry = {
        timestamp: new Date().toISOString(),
        input: input,
        response: response
    };
    history.unshift(newEntry); // Add to the beginning
    // Keep only the last 5 entries to avoid clutter
    history = history.slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    displayHistory(); // Refresh history display
}

function displayHistory() {
    let history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    historyList.innerHTML = ''; // Clear current list

    if (history.length === 0) {
        historyContainer.classList.add('hidden');
        return;
    }

    historyContainer.classList.remove('hidden');
    history.forEach((entry, index) => {
        const historyItem = document.createElement('div');
        historyItem.className = 'bg-gray-100 p-4 rounded-lg border border-gray-200 relative group';
        historyItem.innerHTML = `
            <p class="text-xs text-gray-500 mb-2">${new Date(entry.timestamp).toLocaleString()}</p>
            <p class="font-semibold text-gray-700 mb-2 truncate">Input: ${entry.input.substring(0, 100)}${entry.input.length > 100 ? '...' : ''}</p>
            <p class="text-gray-600 text-sm mb-2 line-clamp-2">Summary: ${entry.response.summary || 'N/A'}</p>
            <button class="view-history-btn absolute top-4 right-4 bg-blue-500 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    data-index="${index}" title="View Details">
                <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
        `;
        historyList.appendChild(historyItem);
    });

    // Add event listeners for view history buttons
    document.querySelectorAll('.view-history-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const index = event.currentTarget.dataset.index;
            const entry = history[index];
            if (entry) {
                // Populate main input/output with history item
                contentInput.value = entry.input;
                // Clear current output to prepare for new display
                summaryOutput.innerHTML = '';
                actionItemsOutput.innerHTML = '';
                nextStepsOutput.innerHTML = '';

                // Display summary immediately
                summaryOutput.innerHTML = entry.response.summary || 'No summary generated.';

                // Display action items
                if (entry.response.actionItems && entry.response.actionItems.length > 0 && entry.response.actionItems[0] !== "None identified.") {
                    entry.response.actionItems.forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = item;
                        actionItemsOutput.appendChild(li);
                    });
                } else {
                    actionItemsOutput.innerHTML = '<li>No action items identified.</li>';
                }

                // Display next steps
                if (entry.response.nextSteps && entry.response.nextSteps.length > 0 && entry.response.nextSteps[0] !== "No further suggestions.") {
                    entry.response.nextSteps.forEach(step => {
                        const li = document.createElement('li');
                        li.textContent = step;
                        nextStepsOutput.appendChild(li);
                    });
                } else {
                    nextStepsOutput.innerHTML = '<li>No specific next steps suggested.</li>';
                }

                responseContainer.classList.remove('hidden');
                setTimeout(() => {
                    responseContainer.classList.remove('opacity-0');
                }, 10);
                lucide.createIcons(); // Re-render icons
                window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top
            }
        });
    });
    lucide.createIcons(); // Ensure icons in history items are rendered
}

function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    displayHistory(); // Update display (will hide container)
    showAlert('History Cleared', 'Your recent processing history has been removed.');
}

// Event listener for the Clear History button
clearHistoryBtn.addEventListener('click', clearHistory);


// --- Copy to Clipboard Logic ---
copyButtons.forEach(button => {
    button.addEventListener('click', async () => {
        const targetId = button.dataset.target;
        const targetElement = document.getElementById(targetId);
        if (targetElement) {
            let textToCopy = '';
            if (targetElement.tagName === 'UL') {
                // For ULs, get text content of each LI
                Array.from(targetElement.children).forEach(li => {
                    textToCopy += li.textContent + '\n';
                });
                textToCopy = textToCopy.trim(); // Remove trailing newline
            } else {
                // For DIVs, get innerText
                textToCopy = targetElement.innerText;
            }

            try {
                // Use navigator.clipboard.writeText if available and allowed
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(textToCopy);
                } else {
                    // Fallback for older browsers or restricted environments (like some iframes)
                    const textarea = document.createElement('textarea');
                    textarea.value = textToCopy;
                    textarea.style.position = 'fixed'; // Prevent scrolling to bottom
                    document.body.appendChild(textarea);
                    textarea.focus();
                    textarea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textarea);
                }
                // Show "Copied!" feedback
                const feedbackSpan = button.querySelector('.copy-feedback');
                if (feedbackSpan) {
                    feedbackSpan.classList.remove('hidden');
                    setTimeout(() => {
                        feedbackSpan.classList.add('hidden');
                    }, 1500); // Hide after 1.5 seconds
                }
            } catch (err) {
                console.error('Failed to copy text:', err);
                showAlert('Copy Failed', 'Could not copy text to clipboard. Please try manually.');
            }
        }
    });
});

// --- Example Buttons Logic ---
exampleButtons.forEach(button => {
    button.addEventListener('click', () => {
        const exampleType = button.dataset.exampleType;
        const exampleContent = button.dataset.exampleContent;

        contentInput.value = exampleContent; // Set the input field value
        clearContent(); // Clear previous results (but keep input content)
        contentInput.value = exampleContent; // Re-set input as clearContent clears it
        // Optionally, trigger processing automatically:
        // processBtn.click(); // Uncomment this line if you want examples to auto-process
    });
});

// --- Event listeners for parameter sliders to update display values ---
temperatureInput.addEventListener('input', () => {
    temperatureValue.textContent = temperatureInput.value;
});

maxTokensInput.addEventListener('input', () => {
    maxTokensValue.textContent = maxTokensInput.value;
});


// Event listener for the Process button
processBtn.addEventListener('click', async () => {
    const inputContent = contentInput.value.trim();

    // Get Gemini parameters from UI
    const temperature = parseFloat(temperatureInput.value);
    const maxOutputTokens = parseInt(maxTokensInput.value);

    // Clear previous outputs and error messages before new processing starts
    summaryOutput.innerHTML = ''; // Clear summary immediately for streaming
    actionItemsOutput.innerHTML = '';
    nextStepsOutput.innerHTML = '';
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
    responseContainer.classList.add('opacity-0'); // Start fade out if visible

    if (inputContent === '') {
        showAlert('Input Required', 'Please enter some text or a URL to process.');
        responseContainer.classList.add('hidden');
        return;
    }

    // Show loading indicator and disable buttons
    loadingSpinner.classList.remove('hidden');
    buttonText.textContent = 'Processing...';
    processBtn.disabled = true;
    clearBtn.disabled = true; // Disable clear button during processing

    try {
        let payload = {
            text: inputContent,
            temperature: temperature,
            maxOutputTokens: maxOutputTokens
        };

        if (isValidUrl(inputContent)) {
            payload = {
                url: inputContent,
                temperature: temperature,
                maxOutputTokens: maxOutputTokens
            };
        }

        // --- New: Handle Server-Sent Events (SSE) for streaming ---
        const eventSource = new EventSource(`https://ai-content-assistant-backend.onrender.com/generate-content?${new URLSearchParams(payload).toString()}`); // Use EventSource for GET requests

        let fullResponseAccumulator = ''; // To build the full JSON string from chunks

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data); // Parse the SSE data

            if (data.type === 'chunk') {
                fullResponseAccumulator += data.content;
                // Append chunk content to summary output
                summaryOutput.innerHTML += data.content;
                // Ensure response container is visible and fading in
                responseContainer.classList.remove('hidden');
                setTimeout(() => {
                    responseContainer.classList.remove('opacity-0');
                }, 10);
            } else if (data.type === 'final') {
                eventSource.close(); // Close the connection
                const finalResponse = data.content; // This is the parsed JSON object

                // Populate action items and next steps from the final response
                actionItemsOutput.innerHTML = '';
                if (finalResponse.actionItems && finalResponse.actionItems.length > 0 && finalResponse.actionItems[0] !== "None identified.") {
                    finalResponse.actionItems.forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = item;
                        actionItemsOutput.appendChild(li);
                    });
                } else {
                    actionItemsOutput.innerHTML = '<li>No action items identified.</li>';
                }

                nextStepsOutput.innerHTML = '';
                if (finalResponse.nextSteps && finalResponse.nextSteps.length > 0 && finalResponse.nextSteps[0] !== "No further suggestions.") {
                    finalResponse.nextSteps.forEach(step => {
                        const li = document.createElement('li');
                        li.textContent = step;
                        nextStepsOutput.appendChild(li);
                    });
                } else {
                    nextStepsOutput.innerHTML = '<li>No specific next steps suggested.</li>';
                }

                // Save to history after successful processing
                saveToHistory(inputContent, finalResponse);

                // Re-enable buttons and hide loading
                loadingSpinner.classList.add('hidden');
                buttonText.textContent = 'Process Content';
                processBtn.disabled = false;
                clearBtn.disabled = false;
                lucide.createIcons(); // Re-render icons
            } else if (data.type === 'error') {
                eventSource.close(); // Close the connection
                showAlert('Processing Error', data.content);
                // Re-enable buttons and hide loading
                loadingSpinner.classList.add('hidden');
                buttonText.textContent = 'Process Content';
                processBtn.disabled = false;
                clearBtn.disabled = false;
                responseContainer.classList.add('hidden'); // Hide on error
                responseContainer.classList.add('opacity-0');
            }
        };

        eventSource.onerror = (error) => {
            eventSource.close(); // Close connection on error
            console.error('EventSource failed:', error);
            showAlert('Network Error', 'Failed to connect to the server for streaming. Please ensure the server is running and try again.');
            // Re-enable buttons and hide loading
            loadingSpinner.classList.add('hidden');
            buttonText.textContent = 'Process Content';
            processBtn.disabled = false;
            clearBtn.disabled = false;
            responseContainer.classList.add('hidden'); // Hide on error
            responseContainer.classList.add('opacity-0');
        };

    } catch (error) {
        console.error('Error initiating streaming request:', error);
        showAlert('Request Error', `Could not initiate request: ${error.message}.`);
        // Re-enable buttons and hide loading
        loadingSpinner.classList.add('hidden');
        buttonText.textContent = 'Process Content';
        processBtn.disabled = false;
        clearBtn.disabled = false;
        responseContainer.classList.add('hidden'); // Hide on error
        responseContainer.classList.add('opacity-0');
    }
});

// Event listener for the Clear button
clearBtn.addEventListener('click', clearContent);

// Optional: Allow pressing Enter to process (if input is in textarea)
contentInput.addEventListener('keydown', (event) => {
    // Only trigger on Enter if Shift is NOT pressed (to allow newlines)
    if (event.key === 'Enter' && !event.shiftKey && !processBtn.disabled) {
        event.preventDefault(); // Prevent default Enter behavior (e.g., new line in textarea)
        processBtn.click();
    }
});

// Load history when the page loads
document.addEventListener('DOMContentLoaded', displayHistory);
