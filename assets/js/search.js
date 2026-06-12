document.addEventListener("DOMContentLoaded", async function () {
  const input = document.getElementById("search-input");
  const results = document.getElementById("results-container");
  const MAX_SEARCH_RESULTS = 15;

  if (!input || !results) return;

  let posts = [];

  try {
      const response = await fetch("/search.json?t=" + Date.now());
      posts = await response.json();
  } catch (error) {
      console.error("Load search.json Failed", error);
      results.innerHTML = "<li>Load search.json Failed</li>";
      return;
  }

  function escapeHTML(str) {
      return str.replace(/[&<>"']/g, function (match) {
          const map = {
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              "\"": "&quot;",
              "'": "&#39;"
          };
          return map[match];
      });
  }

  function renderResults(keyword) {
      results.innerHTML = "";

      if (!keyword.trim()) {
          return;
      }

      keyword = keyword.toLowerCase();

      const matched = posts.filter(post => {
          const title = (post.title || "").toLowerCase();
          const category = Array.isArray(post.category)
              ? post.category.join(" ").toLowerCase()
              : (post.category || "").toLowerCase();
          const tags = (post.tags || "").toLowerCase();

          return (
              title.includes(keyword) ||
              category.includes(keyword) ||
              tags.includes(keyword)
          );
      });

      if (matched.length === 0) {
          results.innerHTML = "<li>No Result</li>";
          return;
      }

      const limitedMatched = matched.slice(0, MAX_SEARCH_RESULTS);

      limitedMatched.forEach(post => {
          const li = document.createElement("li");
          li.innerHTML = `
              <a href="${post.url}">
                  ${escapeHTML(post.title)}
              </a>
              <small>${post.date}</small>
          `;
          results.appendChild(li);
      });
  }

  input.addEventListener("input", function () {
      renderResults(this.value);
  });
});