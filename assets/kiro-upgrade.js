(() => {
  const STATUS_GOOD = new Set(["connected", "active", "online", "complete", "completed"]);
  const STATUS_WARNING = new Set(["warning", "pending", "medium", "low"]);
  const STATUS_CRITICAL = new Set(["critical", "high priority", "missing"]);

  const route = () => window.location.pathname.replace(/^\/+/, "") || "home";

  function normalizedText(node) {
    return (node.textContent || "").trim().replace(/\s+/g, " ");
  }

  function looksLikeCard(node) {
    if (!(node instanceof HTMLElement)) return false;
    const cls = node.className || "";
    if (typeof cls !== "string") return false;
    const rounded = cls.includes("rounded-lg") || cls.includes("rounded-xl") || cls.includes("rounded-2xl");
    const framed = cls.includes("border") || cls.includes("bg-card") || cls.includes("bg-muted") || cls.includes("shadow");
    const text = normalizedText(node);
    return rounded && framed && text.length > 6 && text.length < 900;
  }

  function looksLikeMetric(node) {
    const text = normalizedText(node);
    return /^(?:\d+|Zone\s+[A-Z]|Connected|Active|Online)\b/.test(text) && text.length < 90;
  }

  function classifyStatus(node) {
    const raw = normalizedText(node);
    const text = raw.toLowerCase();
    if (!text || text.length > 28) return;
    if (STATUS_GOOD.has(text)) {
      node.classList.add("kiro-status-good", "kiro-status-dot");
    } else if (STATUS_WARNING.has(text)) {
      node.classList.add("kiro-status-warning", "kiro-status-dot");
    } else if (STATUS_CRITICAL.has(text)) {
      node.classList.add("kiro-status-critical", "kiro-status-dot");
    }
  }

  function markActiveNavigation(root) {
    const current = route();
    root.querySelectorAll("a[href]").forEach((link) => {
      const path = new URL(link.href, window.location.href).pathname.replace(/^\/+/, "") || "home";
      link.classList.toggle("kiro-nav-active", path === current);
    });
  }

  function enhance() {
    const root = document.getElementById("root");
    if (!root) return;

    document.documentElement.classList.add("kiro-upgraded");
    document.body.classList.add("kiro-enhanced");
    root.dataset.kiroRoute = route();

    const firstAppChild = Array.from(root.children).find((child) => child.id !== "seo-snapshot");
    if (firstAppChild instanceof HTMLElement) firstAppChild.classList.add("kiro-route-frame");

    root.querySelectorAll("div, section, article, a, button, span").forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      if (looksLikeCard(node)) node.classList.add("kiro-card");
      if (looksLikeMetric(node)) node.classList.add("kiro-metric");
      if (node.matches("a, button")) node.classList.add("kiro-control");
      classifyStatus(node);
    });

    markActiveNavigation(root);
  }

  let queued = false;
  function scheduleEnhance() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  }

  function routePulse() {
    document.body.classList.add("kiro-route-changing");
    window.setTimeout(() => {
      document.body.classList.remove("kiro-route-changing");
      scheduleEnhance();
    }, 380);
  }

  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    pushState(...args);
    routePulse();
  };

  history.replaceState = (...args) => {
    replaceState(...args);
    routePulse();
  };

  window.addEventListener("popstate", routePulse);
  window.addEventListener("load", scheduleEnhance);

  new MutationObserver(scheduleEnhance).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scheduleEnhance();
})();
