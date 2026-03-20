const path = require("path");
const express = require("express");
const axios = require("axios");
const { getJson } = require("serpapi");

const app = express();
const PORT = process.env.PORT || 3000;
const SERPAPI_KEY = process.env.SERPAPI_KEY;
const IMGBB_KEY = process.env.IMGBB_API_KEY;
const ALLOWED_SITES = ["taobao.com", "weidian.com", "1688.com", "tmall.com"];
const REP_SITES = ["taobao.com", "weidian.com", "1688.com", "tmall.com", "yupoo.com"];
const TEXT_SITES = ["dhgate.com", "aliexpress.com", "temu.com"];
const RETAIL_SITES = ["amazon.", "stockx."];

app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const isAllowedSite = (url) => {
  if (!url) {
    return false;
  }
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return ALLOWED_SITES.some((site) => hostname.endsWith(site));
  } catch (error) {
    return false;
  }
};

const runSerpApi = (params) =>
  new Promise((resolve, reject) => {
    getJson(params, (json) => {
      if (json && json.error) {
        reject(new Error(json.error));
        return;
      }
      resolve(json || {});
    });
  });

const uploadToImgBB = async (dataUrl) => {
  if (!IMGBB_KEY) {
    throw new Error("IMGBB_KEY is not set on the server.");
  }

  const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, "");
  if (!base64Data || base64Data === dataUrl) {
    throw new Error("Image data must be a base64 data URL.");
  }

  const body = new URLSearchParams();
  body.set("key", IMGBB_KEY);
  body.set("image", base64Data);

  const response = await axios.post("https://api.imgbb.com/1/upload", body, {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const payload = response.data;
  if (!payload?.data?.url) {
    throw new Error(payload?.error?.message || "ImgBB upload failed.");
  }

  return payload.data.url;
};

const pickTextImage = (item) =>
  item.thumbnail ||
  item.pagemap?.cse_image?.[0]?.src ||
  item.pagemap?.cse_thumbnail?.[0]?.src ||
  null;

const pickLensImage = (item) => {
  const img =
    item.thumbnail ||
    item.image ||
    null;
  return img;
};

const cleanTitle = (title, query) => {
  if (!title) {
    return "";
  }
  const junkWords = [
    "2025",
    "秋冬",
    "春夏",
    "秋季",
    "冬季",
    "夏季",
    "新款",
    "爆款",
    "热卖",
    "包邮",
    "免邮",
    "fleece-lined",
    "free shipping",
    "autumn winter",
    "autumn",
    "winter",
  ];
  const pattern = new RegExp(junkWords.join("|"), "gi");
  const cleaned = title.replace(pattern, "").replace(/\s{2,}/g, " ").trim();
  const hypeWords = ["kapok", "foam", "2025", "high street", "new"];
  const lowered = cleaned.toLowerCase();
  const hypeCount = hypeWords.reduce((count, word) => {
    if (word.includes(" ")) {
      return lowered.includes(word) ? count + 1 : count;
    }
    return lowered.split(/\b/).includes(word) ? count + 1 : count;
  }, 0);

  if (hypeCount > 3 && query) {
    return `${query} - Premium Batch`;
  }

  return cleaned.split(/\s+/).slice(0, 7).join(" ");
};

const getHostname = (link) => {
  if (!link) {
    return "";
  }
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch (error) {
    return "";
  }
};

const getSmartProxy = (url, link) => {
  if (!url) {
    return null;
  }
  const encoded = encodeURIComponent(url);
  const hostname = getHostname(link);
  if (
    hostname.includes("weidian.com") ||
    hostname.includes("taobao.com") ||
    hostname.includes("1688.com")
  ) {
    return `https://wsrv.nl/?url=${encoded}`;
  }
  if (
    hostname.includes("dhgate.com") ||
    hostname.includes("aliexpress.com") ||
    hostname.includes("temu.com")
  ) {
    return `https://images.weserv.nl/?url=${encoded}&output=jpg&n=-1`;
  }
  return `https://wsrv.nl/?url=${encoded}`;
};

const getSourceName = (link) => {
  const hostname = getHostname(link);
  if (!hostname) {
    return "Unknown";
  }
  if (hostname.includes("weidian.com")) {
    return "Weidian";
  }
  if (hostname.includes("taobao.com")) {
    return "Taobao";
  }
  if (hostname.includes("1688.com")) {
    return "1688";
  }
  if (hostname.includes("aliexpress.com")) {
    return "AliExpress";
  }
  if (hostname.includes("dhgate.com")) {
    return "DHgate";
  }
  if (hostname.includes("temu.com")) {
    return "Temu";
  }
  return hostname.split(".")[0];
};

const rankByHost = (link) => {
  const hostname = getHostname(link);
  if (hostname.includes("weidian.com") || hostname.includes("1688.com")) {
    return 1;
  }
  if (hostname.includes("taobao.com")) {
    return 2;
  }
  if (
    hostname.includes("aliexpress.com") ||
    hostname.includes("dhgate.com") ||
    hostname.includes("temu.com")
  ) {
    return 3;
  }
  return 4;
};

const isJunkTitle = (title, link) => {
  if (!title) {
    return true;
  }
  const trimmed = title.trim().toLowerCase();
  const junkTitles = ["online store"];
  if (junkTitles.includes(trimmed)) {
    return true;
  }
  if (link && getHostname(link).includes("taobao.com")) {
    const lowered = trimmed;
    if (
      lowered.includes("how to") ||
      lowered.includes("tips") ||
      lowered.includes("review") ||
      lowered.includes("spot a real") ||
      lowered.includes("guide")
    ) {
      return true;
    }
  }
  if (/(\+?\d[\d\s-]{6,})/.test(title)) {
    return true;
  }
  if (title.includes("回头率") || title.includes("所在地")) {
    return true;
  }
  return false;
};

const isItemLink = (link) => {
  if (!link) {
    return false;
  }
  return link.toLowerCase().includes("item");
};

const isMessyWeidianTitle = (title) => {
  if (!title) {
    return true;
  }
  return title.length > 60 || /[|/\\]+/.test(title);
};

const normalizeTitleKey = (title) =>
  (title || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 48);

const dedupeResults = (results) => {
  const byImage = new Map();
  const byTitle = new Map();
  const pickPreferred = (a, b) => {
    if (!a) return b;
    if (!b) return a;
    if (rankByHost(a.link) !== rankByHost(b.link)) {
      return rankByHost(a.link) < rankByHost(b.link) ? a : b;
    }
    return a;
  };

  results.forEach((item) => {
    if (item.image) {
      const existing = byImage.get(item.image);
      byImage.set(item.image, pickPreferred(existing, item));
    }
    const titleKey = normalizeTitleKey(item.title);
    if (titleKey) {
      const existing = byTitle.get(titleKey);
      byTitle.set(titleKey, pickPreferred(existing, item));
    }
  });

  const merged = new Map();
  byImage.forEach((value) => {
    if (value) {
      merged.set(value.link, value);
    }
  });
  byTitle.forEach((value) => {
    if (value) {
      merged.set(value.link, value);
    }
  });
  return Array.from(merged.values());
};

const capBudgetSources = (results) => {
  let dhgateCount = 0;
  let aliCount = 0;
  return results.filter((item) => {
    const hostname = getHostname(item.link);
    if (hostname.includes("dhgate.com")) {
      dhgateCount += 1;
      return dhgateCount <= 3;
    }
    if (hostname.includes("aliexpress.com")) {
      aliCount += 1;
      return aliCount <= 3;
    }
    return true;
  });
};

const isProductLink = (link) => {
  if (!link) {
    return false;
  }
  const lowered = link.toLowerCase();
  if (!isRepOrTextSite(link) || lowered.includes("search")) {
    return false;
  }
  if (lowered.includes("weidian.com")) {
    return /\d{8,}/.test(lowered) || lowered.includes("item");
  }
  if (lowered.includes("taobao.com") || lowered.includes("tmall.com")) {
    return lowered.includes("id=") || lowered.includes("item");
  }
  return true;
};

const isArticleTitle = (title) => {
  if (!title) {
    return false;
  }
  const lowered = title.trim().toLowerCase();
  return (
    lowered.startsWith("how to") ||
    lowered.startsWith("tips") ||
    lowered.startsWith("review")
  );
};

const prioritizeItemLinks = (a, b) => {
  const aHasItem = a.link?.toLowerCase().includes("item");
  const bHasItem = b.link?.toLowerCase().includes("item");
  if (aHasItem === bHasItem) {
    return 0;
  }
  return aHasItem ? -1 : 1;
};

const isRetailSite = (link) => {
  if (!link) {
    return false;
  }
  const lowered = link.toLowerCase();
  return RETAIL_SITES.some((site) => lowered.includes(site));
};

const isTextSite = (link) => {
  if (!link) {
    return false;
  }
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, "");
    return TEXT_SITES.some((site) => hostname.endsWith(site));
  } catch (error) {
    return false;
  }
};

const isRepOrTextSite = (link) => {
  if (!link) {
    return false;
  }
  try {
    const hostname = new URL(link).hostname.replace(/^www\./, "");
    return (
      REP_SITES.some((site) => hostname.endsWith(site)) ||
      TEXT_SITES.some((site) => hostname.endsWith(site))
    );
  } catch (error) {
    return false;
  }
};

// 2. The Text Search Fix (Minimal mapping)
const mapTextResults = (json, query) => {
  const organic = Array.isArray(json.organic_results) ? json.organic_results : [];
  const mapped = organic
    .map((item) => {
      const hostname = getHostname(item.link);
      let title = cleanTitle(item.title, query);
      if (hostname.includes("weidian.com") && isMessyWeidianTitle(title)) {
        title = `${query.toUpperCase()} - Premium Batch`;
      }
      const rawImage = pickTextImage(item);
      return {
        title,
        link: item.link,
        image: getSmartProxy(rawImage, item.link),
        image_raw: rawImage,
        source: getSourceName(item.link),
      };
    })
    .filter((item) => isProductLink(item.link))
    .filter((item) => !isRetailSite(item.link))
    .filter((item) => !isJunkTitle(item.title, item.link));

  console.log("Results found:", mapped.length);
  const ranked = dedupeResults(mapped).sort((a, b) => rankByHost(a.link) - rankByHost(b.link));
  return capBudgetSources(ranked);
};

// 3. The Image Search Fix (Nuke the Retailers completely)
const isRepLink = (url) => {
  if (!url) {
    return false;
  }
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return ["taobao.com", "weidian.com"].some((site) => hostname.endsWith(site));
  } catch (error) {
    return false;
  }
};

const mapLensResults = (json, query) => {
  const matches = Array.isArray(json.visual_matches) ? json.visual_matches : [];
  console.log("Lens found before filtering:", matches.length);

  const parsePrice = (value) => {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === "number") {
      return value;
    }
    const match = String(value).replace(/,/g, "").match(/(\d+(\.\d+)?)/);
    return match ? Number(match[1]) : null;
  };

  const mapped = matches.map((item) => {
    const rawImage = pickLensImage(item);
    const hostname = getHostname(item.link);
    const price = parsePrice(item.price || item.price_raw || item.price_value || item.extracted_price);
    let title = cleanTitle(item.title, query);
    if (hostname.includes("weidian.com") && isMessyWeidianTitle(title)) {
      title = `${query.toUpperCase()} - Premium Batch`;
    }
    if (hostname.includes("dhgate.com")) {
      title = `[DHgate Match] ${query?.toUpperCase() || "Designer Item"}`;
    }
    if (
      price !== null &&
      price <= 100 &&
      /(original|authentic|certified)/i.test(title)
    ) {
      title = `[BUDGET FIND] ${query?.toUpperCase() || "Designer Style"}`;
    }
    return {
      title,
      link: item.link,
      image: getSmartProxy(rawImage, item.link),
      image_raw: rawImage,
      price,
      source: getSourceName(item.link),
    };
  });

  const filtered = mapped
    .filter((item) => {
      const link = (item.link || "").toLowerCase();
      const allow = [
        "dhgate.com",
        "aliexpress.com",
        "temu.com",
        "1688.com",
        "alibaba.com",
        "lightinthebox.com",
        "banggood.com",
      ];
      if (
        !allow.some((site) => link.includes(site)) &&
        !link.includes("shop") &&
        !link.includes("store") &&
        !link.includes("item")
      ) {
        return false;
      }
      if (link.includes("reddit.com") || link.includes("pinterest.com")) {
        return false;
      }
      return true;
    })
    .filter((item) => !isRetailSite(item.link));

  return dedupeResults(filtered).sort((a, b) => rankByHost(a.link) - rankByHost(b.link));
};

app.post("/api/search", async (req, res) => {
  if (!SERPAPI_KEY) {
    res.status(500).json({
      status: "error",
      message: "SERPAPI_KEY is not set on the server.",
    });
    return;
  }

  const { type, query, imageUrl } = req.body || {};

  try {
    if (type === "image") {
      if (!imageUrl) {
        res.status(400).json({
          status: "error",
          message: "imageUrl is required for image search.",
        });
        return;
      }

      try {
        let publicImageUrl = imageUrl;
        if (imageUrl.startsWith("data:")) {
          publicImageUrl = await uploadToImgBB(imageUrl);
          console.log("ImgBB URL:", publicImageUrl);
        }

        const json = await runSerpApi({
          api_key: SERPAPI_KEY,
          engine: "google_lens",
          url: publicImageUrl,
        });

        const safeQuery = query || "";
        const scoredLens = mapLensResults(json, safeQuery);
        const scoreLens = (item) => {
          let score = 0;
          const title = (item.title || "").toLowerCase();
          const link = (item.link || "").toLowerCase();
          if (link.includes("item.html") || link.includes("itemid=") || link.includes("id=")) {
            score += 15;
          }
          if (
            link.includes("dhgate.com") ||
            link.includes("aliexpress.com") ||
            link.includes("temu.com") ||
            link.includes("1688.com") ||
            link.includes("lightinthebox.com")
          ) {
            score += 100;
          }
          if (link.includes("ebay.com") || link.includes("poshmark.com")) {
            score -= 50;
          }
          if (
            title.includes("store") ||
            title.includes("whatsapp") ||
            title.includes("contact") ||
            link.includes("store") ||
            link.includes("shop") ||
            link.includes("seller") ||
            link.includes("profile")
          ) {
            score -= 15;
          }
          if (safeQuery) {
            const brand = safeQuery.toLowerCase();
            if (brand && title.includes(brand)) {
              score += 5;
            }
          }
          return score;
        };

        const sortedLens = scoredLens.sort((a, b) => scoreLens(b) - scoreLens(a));
        const dhgateAliResults = sortedLens
          .filter((item) => {
            const link = (item.link || "").toLowerCase();
            return link.includes("dhgate.com") || link.includes("aliexpress.com");
          })
          .slice(0, 4);
        const temuLightResults = sortedLens
          .filter((item) => {
            const link = (item.link || "").toLowerCase();
            return (
              link.includes("temu.com") ||
              link.includes("lightinthebox.com") ||
              link.includes("banggood.com")
            );
          })
          .slice(0, 4);
        const globalResults = sortedLens
          .filter((item) => {
            const link = (item.link || "").toLowerCase();
            return link.includes("1688.com") || link.includes("alibaba.com");
          })
          .slice(0, 4);

        console.log(
          "Scanner found:",
          globalResults.length,
          "Global results. (Weidian/Taobao ignored)."
        );

        let mergedResults = sortedLens
          .filter((item) => {
            const link = (item.link || "").toLowerCase();
            return [
              "dhgate.com",
              "aliexpress.com",
              "temu.com",
              "1688.com",
              "alibaba.com",
              "ebay.com",
              "mercari.com",
            ].some((site) => link.includes(site));
          })
          .slice(0, 12);
        mergedResults = mergedResults.map((item) => ({
          ...item,
          image: getSmartProxy(item.image_raw, item.link),
        }));

        console.log("Final Results Sent to UI:", mergedResults.length);

        res.json({
          status: "ok",
          results: mergedResults,
        });
        return;
      } catch (error) {
        res.status(502).json({
          status: "error",
          message: error.message || "Image search failed.",
        });
        return;
      }
    }

    if (!query) {
      res.status(400).json({
        status: "error",
        message: "query is required for text search.",
      });
      return;
    }

    const weidianQuery = `site:weidian.com "${query}"`;
    const taobaoQuery =
      `site:taobao.com OR site:detail.tmall.com "${query}"`;
    const budgetQuery = `(site:dhgate.com OR site:aliexpress.com) "${query}"`;

    let weidianJson;
    let taobaoJson;
    let budgetJson;
    try {
      [weidianJson, taobaoJson, budgetJson] = await Promise.all([
        runSerpApi({
          api_key: SERPAPI_KEY,
          engine: "google",
          q: weidianQuery,
          num: 15,
        }),
        runSerpApi({
          api_key: SERPAPI_KEY,
          engine: "google",
          q: taobaoQuery,
          num: 15,
        }),
        runSerpApi({
          api_key: SERPAPI_KEY,
          engine: "google",
          q: budgetQuery,
          num: 15,
        }),
      ]);
    } catch (error) {
      res.status(502).json({
        status: "error",
        message: error.message || "Text search failed.",
      });
      return;
    }

    const scoreWeidian = (item) => {
      let score = 0;
      const title = (item.title || "").toLowerCase();
      const link = (item.link || "").toLowerCase();
      const brand = query.toLowerCase();
      if (brand && title.includes(brand)) {
        score += 5;
      }
      if (link.includes("item.html")) {
        score += 10;
      }
      if (title.includes("store") || title.includes("whatsapp") || title.includes("contact")) {
        score -= 10;
      }
      return score;
    };

    const weidianResults = mapTextResults(weidianJson, query)
      .filter((item) => getHostname(item.link).includes("weidian.com"))
      .sort((a, b) => scoreWeidian(b) - scoreWeidian(a))
      .slice(0, 4);
    const taobaoResults = mapTextResults(taobaoJson, query)
      .filter((item) => {
        const hostname = getHostname(item.link);
        return hostname.includes("taobao.com") || hostname.includes("tmall.com");
      })
      .slice(0, 4);
    const budgetResults = mapTextResults(budgetJson, query)
      .filter((item) => {
        const hostname = getHostname(item.link);
        return hostname.includes("dhgate.com") || hostname.includes("aliexpress.com");
      })
      .slice(0, 4);

    res.json({
      status: "ok",
      source: "google",
      results: [...weidianResults, ...taobaoResults, ...budgetResults],
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: error.message || "Search failed.",
    });
  }
});

module.exports = app;
