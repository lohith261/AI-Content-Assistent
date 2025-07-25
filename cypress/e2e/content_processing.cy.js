// Describes the suite of tests for the content processing feature
describe('AI Content Assistant - Text Processing', () => {

  // This block runs before each test in the suite
  beforeEach(() => {
    // Visit the base URL (which we set in cypress.config.js)
    cy.visit('/');
  });

  // Test Case 1: Plain Text (You already have this one)
  it('should process plain text and display a summary, action items, and next steps', () => {
    const inputText = 'The quick brown fox jumps over the lazy dog. This classic sentence contains all the letters of the English alphabet. It is often used for touch-typing practice and font samples.';
    cy.get('#contentInput').type(inputText).should('have.value', inputText);
    cy.get('#processBtn').click();
    cy.get('#loadingSpinner').should('be.visible');
    cy.get('#summaryOutput', { timeout: 30000 }).should('not.be.empty');
    cy.get('#actionItemsOutput').should('not.be.empty');
    cy.get('#nextStepsOutput').should('not.be.empty');
    cy.get('#loadingSpinner').should('not.be.visible');
  });

  // Test Case 2: URL Processing
  it('should process a URL and display the results', () => {
    // Use the URL for the Node.js website as a test case
    const inputUrl = 'https://nodejs.org/en';

    // Type the URL into the input field
    cy.get('#contentInput').type(inputUrl);

    // Click the process button
    cy.get('#processBtn').click();

    // Assert that the loading state is visible
    cy.get('#loadingSpinner').should('be.visible');

    // Wait for the response and assert that the output is not empty
    cy.get('#summaryOutput', { timeout: 20000 }).should('not.be.empty'); // Increased timeout for web scraping
    cy.get('#actionItemsOutput').should('not.be.empty');
  });

  // Test Case 3: File Upload
  it('should upload a .txt file, process it, and display the results', () => {
    // Use the selectFile command to simulate a file upload
    // It will look for the file in the `cypress/fixtures` directory
    cy.get('#fileUpload').selectFile('test-document.txt');

    // Assert that the file preview is visible and shows the correct file name
    cy.get('#filePreview').should('be.visible');
    cy.get('#filePreviewName').should('contain', 'test-document.txt');

    // Click the process button
    cy.get('#processBtn').click();

    // Assert that the loading state is visible
    cy.get('#loadingSpinner').should('be.visible');

    // Wait for the response and assert that the output is not empty
    cy.get('#summaryOutput', { timeout: 30000 }).should('not.be.empty');
  });

  // Test Case 4: Clear Button Functionality
  it('should clear all inputs and outputs when the clear button is clicked', () => {
    const inputText = 'Some text to be cleared.';

    // Type text into the input field
    cy.get('#contentInput').type(inputText);

    // Upload a file to ensure the file preview is also cleared
    cy.get('#fileUpload').selectFile('test-document.txt');

    // Process the content to generate a response
    cy.get('#processBtn').click();
    cy.get('#summaryOutput', { timeout: 15000 }).should('not.be.empty');

    // Now, click the "Clear" button
    cy.get('#clearBtn').click();

    // Assert that all fields are back to their initial state
    cy.get('#contentInput').should('have.value', '');
    cy.get('#filePreview').should('not.be.visible');
    cy.get('#summaryOutput').should('be.empty');
    cy.get('#actionItemsOutput').should('be.empty');
    cy.get('#nextStepsOutput').should('be.empty');
    cy.get('#responseContainer').should('have.class', 'hidden');
  });

});