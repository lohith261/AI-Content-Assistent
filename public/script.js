// script.js

// Get references to DOM elements
const contentInput = document.getElementById('contentInput');
const processBtn = document.getElementById('processBtn');
const clearBtn = document.getElementById('clearBtn'); // New: Reference to the Clear button
const responseContainer = document.getElementById('responseContainer');
const summaryOutput = document.getElementById('summaryOutput');
const actionItemsOutput = document.getElementById('actionItemsOutput');
const nextStepsOutput = document.getElementById('nextStepsOutput');
const loadingSpinner = document.getElementById('loadingSpinner');
const buttonText = document.getElementById('buttonText');
const errorMessage = document.getElementById('errorMessage'); // For displaying general errors

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
    buttonText.textContent = 'Process Content';
    loadingSpinner.classList.add('hidden');
    lucide.createIcons(); // Re-initialize icons just in case
}

// Event listener for the Process button
processBtn.addEventListener('click', async () => {
    const inputContent = contentInput.value.trim();

    // Clear previous outputs and error messages before new processing starts
    // but without hiding the container immediately to allow smooth transition
    summaryOutput.innerHTML = '';
    actionItemsOutput.innerHTML = '';
    nextStepsOutput.innerHTML = '';
    errorMessage.classList.add('hidden');
    errorMessage.textContent = '';
    responseContainer.classList.add('opacity-0'); // Start fade out if visible

    if (inputContent === '') {
        showAlert('Input Required', 'Please enter some text or a URL to process.');
        // Ensure response container is hidden if input is empty
        responseContainer.classList.add('hidden');
        return;
    }

    // Show loading indicator and disable buttons
    loadingSpinner.classList.remove('hidden');
    buttonText.textContent = 'Processing...';
    processBtn.disabled = true;
    clearBtn.disabled = true; // Disable clear button during processing

    try {
        let payload = { text: inputContent }; // Default to text input

        // If the input looks like a URL, send it as a URL
        if (isValidUrl(inputContent)) {
            payload = { url: inputContent };
        }

        // Make a POST request to your backend server
        const response = await fetch('http://localhost:3000/generate-content', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        // Check if the response was successful
        if (!response.ok) {
            const errorData = await response.json();
            // Use the custom alert modal for server errors
            showAlert('Processing Error', errorData.error || `Server error: ${response.status}`);
            throw new Error(errorData.error || `Server error: ${response.status}`); // Still throw to enter catch block for console logging
        }

        const data = await response.json();

        // Display the generated content
        summaryOutput.innerHTML = data.summary || 'No summary generated.';

        // Display action items
        actionItemsOutput.innerHTML = ''; // Clear previous list items
        if (data.actionItems && data.actionItems.length > 0 && data.actionItems[0] !== "None identified.") {
            data.actionItems.forEach(item => {
                const li = document.createElement('li');
                li.textContent = item;
                actionItemsOutput.appendChild(li);
            });
        } else {
            actionItemsOutput.innerHTML = '<li>No action items identified.</li>';
        }

        // Display next steps
        nextStepsOutput.innerHTML = ''; // Clear previous list items
        if (data.nextSteps && data.nextSteps.length > 0 && data.nextSteps[0] !== "No further suggestions.") {
            data.nextSteps.forEach(step => {
                const li = document.createElement('li');
                li.textContent = step;
                nextStepsOutput.appendChild(li);
            });
        } else {
            nextStepsOutput.innerHTML = '<li>No specific next steps suggested.</li>';
        }

        // Show the response container with fade-in effect
        responseContainer.classList.remove('hidden');
        // A small delay might be needed for the transition to work if 'hidden' was just removed
        setTimeout(() => {
            responseContainer.classList.remove('opacity-0');
        }, 10); // Small delay


    } catch (error) {
        console.error('Error processing content:', error);
        // The showAlert is already called above for server errors.
        // This catch block mainly for network errors or unexpected client-side issues.
        if (!modal.classList.contains('hidden')) { // If modal is already open from server response, don't open another
            // Do nothing, error was already handled by showAlert
        } else {
            showAlert('Network Error', `Failed to connect to the server. Please ensure the server is running and try again. (${error.message})`);
        }
        responseContainer.classList.add('hidden'); // Hide response container on error
        responseContainer.classList.add('opacity-0'); // Ensure it's opaque if hidden
    } finally {
        // Hide loading indicator and re-enable buttons
        loadingSpinner.classList.add('hidden');
        buttonText.textContent = 'Process Content';
        processBtn.disabled = false;
        clearBtn.disabled = false; // Re-enable clear button
        lucide.createIcons(); // Re-render Lucide icons if new elements were added
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
