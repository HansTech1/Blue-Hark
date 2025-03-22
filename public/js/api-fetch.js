document.addEventListener("DOMContentLoaded", () => {
  // Change this URL to your desired API endpoint.
  const apiUrl = '/api/results';

  // Fetch results from the API.
  fetch(apiUrl)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Network response was not ok: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("API results:", data);
      // Example: Display the results in an element with the ID "api-results"
      const resultsContainer = document.getElementById("api-results");
      if (resultsContainer) {
        // Convert JSON data to a formatted string for display.
        resultsContainer.innerHTML = `<pre>${JSON.stringify(data, null, 2)}</pre>`;
      }
    })
    .catch(error => {
      console.error("Error fetching API results:", error);
      const resultsContainer = document.getElementById("api-results");
      if (resultsContainer) {
        resultsContainer.textContent = "Failed to fetch API results.";
      }
    });
});
