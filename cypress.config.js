const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: 'https://ai-content-assistent.vercel.app', // Your live demo URL
    setupNodeEvents(on, config) {
      // implement node event listeners here
    },
  },
});
