const input = document.getElementById("cameraInput");
const preview = document.getElementById("preview");
let overlay = document.getElementById("scanOverlay");
const matchesTitle = document.getElementById("matchesTitle");
const searchInput = document.getElementById("search");
const matchesGrid = document.getElementById("matchesGrid");
const quickSearchButtons = document.querySelectorAll("[data-quick]");
let lastQuery = "";
const previewTemplate = preview.innerHTML;

const API_BASE = "";
const notFoundIcon = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
    <rect width="240" height="160" fill="#111014"/>
    <rect x="16" y="16" width="208" height="128" rx="16" fill="#1d1b22" stroke="#2e2a35" stroke-width="2"/>
    <path d="M72 108l24-28 24 24 24-32 28 36" fill="none" stroke="#5a4b78" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="86" cy="62" r="10" fill="#5a4b78"/>
    <text x="120" y="140" text-anchor="middle" font-size="12" fill="#8b84a6" font-family="Arial, sans-serif">Image not found</text>
  </svg>`
)}`;
const blockedImagePlaceholder = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160">
    <rect width="240" height="160" fill="#141218"/>
    <rect x="16" y="16" width="208" height="128" rx="16" fill="#1f1b26" stroke="#2f2a38" stroke-width="2"/>
    <text x="120" y="92" text-anchor="middle" font-size="12" fill="#9b93b4" font-family="Arial, sans-serif">Image available on site</text>
  </svg>`
)}`;

let currentImageUrl = null;

const showOverlay = () => {
  overlay.classList.add("is-visible");
  overlay.setAttribute("aria-hidden", "false");
  window.setTimeout(() => {
    overlay.classList.remove("is-visible");
    overlay.setAttribute("aria-hidden", "true");
  }, 1600);
};

const clearPreview = () => {
  const existingImage = preview.querySelector("img");
  if (existingImage) {
    existingImage.remove();
  }
  const placeholder = preview.querySelector(".upload__placeholder");
  if (placeholder) {
    placeholder.style.display = "block";
  }
};

const showPreviewStatus = (message) => {
  preview.style.display = "grid";
  preview.innerHTML = `
    <div class="preview-status" role="status" aria-live="polite">
      <span>${message}</span>
    </div>
  `;
};

const showLoading = (label) => {
  matchesGrid.innerHTML = `
    <div class="results-loading" role="status" aria-live="polite">
      <span class="results-loading__spinner"></span>
      <span>${label}</span>
    </div>
  `;
};

const renderMatches = (results) => {
  matchesGrid.innerHTML = "";

  if (!results || results.length === 0) {
    matchesGrid.innerHTML =
      '<p class="upload__placeholder">No reps found. Try a different keyword.</p>';
    return;
  }

  const applyImageFallback = (container) => {
    container.classList.add("product__img--fallback");
    container.style.background = "#2a2a2a";
  };

  results.forEach((item) => {
    const card = document.createElement("a");
    card.className = "product";
    card.href = item.link || "#";
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const image = document.createElement("div");
    image.className = "product__img";
    const imageElement = document.createElement("img");
    imageElement.alt = item.title || "Product image";
    imageElement.referrerPolicy = "no-referrer";
    if (!item.image) {
      imageElement.style.display = "none";
      applyImageFallback(image);
    } else {
      imageElement.src = item.image;
    }
    imageElement.onerror = () => {
      if (!imageElement.dataset.triedRaw && item.image_raw) {
        imageElement.dataset.triedRaw = "true";
        imageElement.src = item.image_raw;
        return;
      }
      imageElement.style.display = "none";
      applyImageFallback(image);
    };
    imageElement.style.width = "100%";
    imageElement.style.height = "100%";
    imageElement.style.objectFit = "cover";
    image.appendChild(imageElement);

    const info = document.createElement("div");
    info.className = "product__info";

    const title = document.createElement("h3");
    const rawTitle = item.title ?? "";
    const resolvedTitle =
      rawTitle.startsWith("https://weidian.com") && lastQuery
        ? `[TOP TIER] ${lastQuery} Batch`
        : rawTitle;
    title.textContent =
      resolvedTitle.length > 60 ? `${resolvedTitle.substring(0, 60)}...` : resolvedTitle;

    const source = document.createElement("span");
    source.className = "source-tag";
    const sourceText = item.source || "Unknown";
    source.textContent = sourceText;
    source.dataset.source = sourceText.toLowerCase();

    const button = document.createElement("span");
    button.className = "cta-button";
    button.textContent = "View Item ↗";

    const meta = document.createElement("div");
    meta.className = "product__meta";
    meta.append(title, source, button);

    info.append(meta);
    card.append(image, info);
    matchesGrid.appendChild(card);
  });
};

const sendSearchRequest = async (payload, { onSuccess } = {}) => {
  try {
    const response = await fetch(`${API_BASE}/api/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    console.log("Search response:", data);
    renderMatches(data.results);
    if (onSuccess) {
      onSuccess(data);
    }
  } catch (error) {
    console.error("Search error:", error);
  }
};

const runQuickSearch = (query) => {
  if (!query) {
    return;
  }
  const quickMessages = {
    "Denim Tears": "🔥 PRO DROPS: Fetching the latest Denim Tears...",
    "Yeezy Slide": "📈 TRENDING: Finding the best Yeezy Slide deals...",
    "Essentials Hoodie": "💰 ON SALE: Scoping out Essentials Hoodies...",
  };
  showPreviewStatus(quickMessages[query] || "Searching...");
  searchInput.value = query;
  lastQuery = query;
  matchesTitle.textContent = `Top Finds for "${query}"`;
  matchesGrid.innerHTML = "";
  showLoading("Searching matches...");
  showOverlay();
  sendSearchRequest({ type: "text", query });
};

const handleFile = (file) => {
  if (!file) {
    clearPreview();
    return;
  }

  preview.style.display = "grid";
  if (preview.innerHTML !== previewTemplate) {
    preview.innerHTML = previewTemplate;
    overlay = document.getElementById("scanOverlay");
  }
  if (currentImageUrl) {
    URL.revokeObjectURL(currentImageUrl);
  }

  currentImageUrl = URL.createObjectURL(file);
  let image = preview.querySelector("img");
  if (!image) {
    image = document.createElement("img");
    preview.appendChild(image);
  }
  image.src = currentImageUrl;

  const placeholder = preview.querySelector(".upload__placeholder");
  if (placeholder) {
    placeholder.style.display = "none";
  }

  matchesTitle.textContent = "Visual Matches";
  matchesGrid.innerHTML = "";
  showLoading("Scanning matches...");
  showOverlay();

  const reader = new FileReader();
  reader.onload = () => {
    sendSearchRequest(
      {
        type: "image",
        imageUrl: reader.result,
      },
      {
        onSuccess: () => {
          preview.style.display = "none";
        },
      }
    );
  };
  reader.readAsDataURL(file);
};

input.addEventListener("change", (event) => {
  console.log("Image uploaded!");
  const file = event.target.files && event.target.files[0];
  handleFile(file);
});

preview.addEventListener("dragover", (event) => {
  event.preventDefault();
  preview.classList.add("is-dragover");
});

preview.addEventListener("dragleave", () => {
  preview.classList.remove("is-dragover");
});

preview.addEventListener("drop", (event) => {
  event.preventDefault();
  preview.classList.remove("is-dragover");
  console.log("Image uploaded!");
  const file = event.dataTransfer && event.dataTransfer.files[0];
  handleFile(file);
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") {
    return;
  }

  const query = searchInput.value.trim();
  if (!query) {
    return;
  }

  lastQuery = query;
  event.preventDefault();
  matchesTitle.textContent = `Top Finds for "${query}"`;
  matchesGrid.innerHTML = "";
  showLoading("Searching matches...");
  showOverlay();
  sendSearchRequest({
    type: "text",
    query,
  });
});

quickSearchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    runQuickSearch(button.dataset.quick);
  });
});

window.addEventListener("beforeunload", () => {
  if (currentImageUrl) {
    URL.revokeObjectURL(currentImageUrl);
  }
});
