(function () {
  "use strict";

  const CONFIG = {
    JSON_URL: "/projects.json",
    TYPING_SPEED: 80,
    CACHE_DURATION: 5 * 60 * 1000,
  };

  let elements = {};

  let projectsCache = {
    data: null,
    timestamp: 0,
    isValid() {
      return this.data && Date.now() - this.timestamp < CONFIG.CACHE_DURATION;
    },
    set(data) {
      this.data = data;
      this.timestamp = Date.now();
    },
    clear() {
      this.data = null;
      this.timestamp = 0;
    },
  };

  function typeText(target, text, speed = CONFIG.TYPING_SPEED) {
    return new Promise((resolve) => {
      target.textContent = "";

      let i = 0;
      const cursor = document.createElement("span");
      cursor.className = "cursor blink";
      target.appendChild(cursor);

      const typeInterval = setInterval(() => {
        if (i < text.length) {
          cursor.insertAdjacentText("beforebegin", text[i++]);
        } else {
          clearInterval(typeInterval);
          cursor.remove();
          resolve();
        }
        elements.screen.scrollTop = elements.screen.scrollHeight;
      }, speed);
    });
  }

  function normalizeProjects(json) {
    if (!json) return [];

    if (Array.isArray(json)) {
      return json
        .filter((x) => x && (x.url || x.href || x.label))
        .map((x) => ({
          label: x.label || x.url || x.href,
          url: x.url || x.href || "#",
          desc: x.desc || null,
          tags: Array.isArray(x.tags) ? x.tags : [],
          pinned: !!x.pinned,
        }));
    }

    if (typeof json === "object") {
      return Object.entries(json).map(([label, url]) => ({
        label,
        url,
        desc: null,
        tags: [],
        pinned: false,
      }));
    }

    return [];
  }

  async function fetchProjects() {
    if (projectsCache.isValid()) {
      return projectsCache.data;
    }

    try {
      const res = await fetch(CONFIG.JSON_URL, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const json = await res.json();
      const lastModified = res.headers.get("Last-Modified");
      const timestamp = lastModified ? new Date(lastModified) : new Date();

      const result = {
        list: normalizeProjects(json),
        ts: timestamp,
        error: null,
      };

      if (result.list.length > 0) {
        projectsCache.set(result);
      }

      return result;
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      return { list: null, ts: new Date(), error: err.message };
    }
  }

  function setUpdated(ts, note) {
    const iso = ts.toISOString();
    elements.updatedAt.textContent = `last updated: ${iso}${
      note ? ` — ${note}` : ""
    }`;
  }

  function revealLine(el) {
    if (el) el.classList.add("revealed");
  }

  async function loadProjects() {
    try {
      const { list: projects, ts, error } = await fetchProjects();

      elements.projectsContainer.innerHTML = "";

      if (projects === null) {
        const errorMsg = error
          ? `(${error})`
          : "(could not load projects.json)";
        elements.projectsContainer.innerHTML = `<div>${errorMsg}</div><div>no projects yet — check back soon</div>`;
        setUpdated(ts, "fetch error");
      } else if (projects.length === 0) {
        elements.projectsContainer.innerHTML =
          "<div>no projects yet — check back soon</div>";
        setUpdated(ts);
      } else {
        renderProjects(projects);
        setUpdated(ts);
      }

      elements.projectsContainer.classList.remove("refreshing");
      elements.projectsContainer.style.transition = "filter .2s ease";
      elements.projectsContainer.style.filter = "brightness(1.2)";
      setTimeout(() => {
        elements.projectsContainer.style.filter = "none";
      }, 180);
    } catch (err) {
      console.error("Error loading projects:", err);
      elements.projectsContainer.innerHTML =
        "<div>An error occurred while loading projects</div>";
      elements.projectsContainer.classList.remove("refreshing");
    }
  }

  async function playTypingAnimation() {
    const speed = CONFIG.TYPING_SPEED;
    const lines = Array.from(elements.screen.querySelectorAll(".line"));
    revealLine(lines[0]);
    await typeText(elements.cmdWhoami, "whoami", speed);
    revealLine(lines[1]);
    revealLine(lines[2]);
    await typeText(elements.cmdEcho, "cat stack.md", speed);
    revealLine(lines[3]);
    revealLine(lines[4]);
    await typeText(elements.cmdLs, "ls", speed);
    revealLine(lines[5]);
  }

  function renderProjects(projects) {
    // Pinned projects first, preserve relative order within each group
    const sorted = [
      ...projects.filter((p) => p.pinned),
      ...projects.filter((p) => !p.pinned),
    ];

    const fragment = document.createDocumentFragment();

    sorted.forEach((project) => {
      const item = document.createElement("div");
      item.className = "project-item";

      // Row 1: ★ + link + tags
      const top = document.createElement("div");
      top.className = "project-top";

      if (project.pinned) {
        const pin = document.createElement("span");
        pin.className = "project-pin";
        pin.setAttribute("aria-label", "featured");
        pin.textContent = "★";
        top.appendChild(pin);
      }

      const link = document.createElement("a");
      link.href = project.url;
      link.textContent = project.label;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      top.appendChild(link);

      if (project.tags.length > 0) {
        const tags = document.createElement("span");
        tags.className = "project-tags";
        tags.textContent = "· " + project.tags.join(" · ");
        top.appendChild(tags);
      }

      item.appendChild(top);

      // Row 2: description
      // if (project.desc) {
      //   const desc = document.createElement("div");
      //   desc.className = "project-desc";
      //   desc.textContent = project.desc;
      //   item.appendChild(desc);
      // }

      fragment.appendChild(item);
    });

    elements.projectsContainer.appendChild(fragment);
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  async function refreshProjects() {
    elements.projectsContainer.classList.add("refreshing");
    projectsCache.clear();
    await loadProjects();
  }

  const debouncedRefresh = debounce(refreshProjects, 300);

  function onKeydown(e) {
    if (e.key.toLowerCase() === "r") {
      e.preventDefault();
      debouncedRefresh();
    }
  }

  async function init() {
    elements = {
      screen: document.getElementById("screen"),
      projectsContainer: document.getElementById("projects-container"),
      updatedAt: document.getElementById("updatedAt"),
      refreshBtn: document.getElementById("refreshBtn"),
      cmdWhoami: document.getElementById("cmd-whoami"),
      cmdEcho: document.getElementById("cmd-echo"),
      cmdLs: document.getElementById("cmd-ls"),
      finalCursor: document.getElementById("final-cursor"),
    };

    if (!elements.projectsContainer) {
      console.error("Required DOM elements not found");
      return;
    }

    elements.refreshBtn.addEventListener("click", debouncedRefresh);
    window.addEventListener("keydown", onKeydown);

    await playTypingAnimation();
    await loadProjects();
    if (elements.finalCursor) elements.finalCursor.classList.add("blink");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
