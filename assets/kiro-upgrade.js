(() => {
  const STATUS_GOOD = new Set(["connected", "active", "online", "complete", "completed"]);
  const STATUS_WARNING = new Set(["warning", "pending", "medium", "low"]);
  const STATUS_CRITICAL = new Set(["critical", "high priority", "missing"]);
  const TOAST_LIFETIME_MS = 1800;
  const TOAST_EXIT_MS = 280;
  const toastTimers = new WeakMap();
  let toastSweepTimer = 0;
  let actionToastTimer = 0;
  let lastActionToastKey = "";
  let lastActionToastAt = 0;

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

  function markBottomNavigation(root) {
    root.querySelectorAll("nav").forEach((nav) => {
      if (!(nav instanceof HTMLElement)) return;
      const labels = normalizedText(nav).toLowerCase();
      const className = typeof nav.className === "string" ? nav.className : "";
      const fixedBottom = className.includes("fixed") && className.includes("bottom-0");
      const knownMobileNav = ["home", "tasks", "drone", "scan", "alerts"].every((label) => labels.includes(label));
      nav.classList.toggle("kiro-bottom-nav", fixedBottom || knownMobileNav);
    });
  }

  function isToastText(text) {
    return /responding|drone dispatched|drone recalled|rescan initiated|scan initiated|return to dock|emergency stop|photo captured|moving forward|moving backward|turning left|turning right|ascending|descending|performing shelf scan|returning to voltair|hover-locked/i.test(text);
  }

  function currentDroneName() {
    const liveText = Array.from(document.querySelectorAll("span, p, div"))
      .map(normalizedText)
      .find((text) => /Auralia A-\d{2}\s*·\s*LIVE/i.test(text));
    const liveMatch = liveText && liveText.match(/Auralia A-\d{2}/i);
    if (liveMatch) return liveMatch[0];

    const bodyMatch = normalizedText(document.body).match(/Auralia A-\d{2}/i);
    return bodyMatch ? bodyMatch[0] : "Auralia drone";
  }

  function droneActionMessage(button) {
    if (!(button instanceof HTMLElement) || route() !== "drone-control") return null;
    if (button.closest("nav")) return null;

    const text = normalizedText(button).toLowerCase();
    const droneName = currentDroneName();

    if (/^auralia a-\d{2}$/i.test(text)) return null;
    if (text.includes("return to dock")) {
      return { title: "Return to dock", description: `${droneName} returning to Voltair Dock.` };
    }
    if (text.includes("emergency stop")) {
      return { title: "Emergency stop", description: `${droneName} hover-locked.`, danger: true };
    }

    const buttons = Array.from(document.querySelectorAll("button"));
    const index = buttons.indexOf(button);
    const indexedMessages = {
      5: { title: "Ascending", description: `${droneName} responding.` },
      6: { title: "Descending", description: `${droneName} responding.` },
      7: { title: "Moving forward", description: `${droneName} responding.` },
      8: { title: "Turning left", description: `${droneName} responding.` },
      9: { title: "Turning right", description: `${droneName} responding.` },
      10: { title: "Moving backward", description: `${droneName} responding.` },
      11: { title: "Scan initiated", description: `${droneName} performing shelf scan.` },
      13: { title: "Photo captured", description: `Saved from ${droneName}.` },
    };

    return indexedMessages[index] || null;
  }

  function showActionToast(message) {
    if (!message) return;
    const now = Date.now();
    const key = `${message.title}|${message.description}`;
    if (key === lastActionToastKey && now - lastActionToastAt < 180) return;
    lastActionToastKey = key;
    lastActionToastAt = now;

    let toast = document.getElementById("kiro-action-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "kiro-action-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");

      const title = document.createElement("div");
      title.className = "kiro-action-toast-title";
      const description = document.createElement("div");
      description.className = "kiro-action-toast-description";
      toast.append(title, description);
      document.body.appendChild(toast);
    }

    toast.querySelector(".kiro-action-toast-title").textContent = message.title;
    toast.querySelector(".kiro-action-toast-description").textContent = message.description;
    toast.classList.toggle("kiro-action-toast-danger", Boolean(message.danger));
    toast.classList.remove("kiro-action-toast-hidden");
    toast.classList.add("kiro-action-toast-visible");

    window.clearTimeout(actionToastTimer);
    actionToastTimer = window.setTimeout(() => {
      toast.classList.remove("kiro-action-toast-visible");
      toast.classList.add("kiro-action-toast-hidden");
    }, TOAST_LIFETIME_MS);
  }

  function isToastLike(node) {
    if (!(node instanceof HTMLElement)) return false;
    if (node.closest(".kiro-toast-exit, .kiro-toast-suppressed")) return false;
    const text = normalizedText(node);
    if (text.length < 8 || text.length > 260 || !isToastText(text)) return false;
    const style = window.getComputedStyle(node);
    const root = document.getElementById("root");
    const knownToast = node.matches("[data-sonner-toast], [data-radix-toast], [data-radix-toast-root], [data-toast], [role='status'], [role='alert']");
    const insideToastArea = node.closest("[data-sonner-toaster], [data-radix-toast-viewport], [aria-live]");
    const floating = style.position === "fixed" || style.position === "absolute";
    const highLayer = Number.parseInt(style.zIndex || "0", 10) > 20;
    const insideApp = root ? root.contains(node) : false;
    return knownToast || insideToastArea || floating || highLayer || !insideApp;
  }

  function toastShell(node) {
    if (!(node instanceof HTMLElement)) return node;

    const direct = node.closest("[data-sonner-toast], [data-radix-toast-root], [data-radix-toast], [data-toast]");
    if (direct instanceof HTMLElement) return direct;

    const liveParent = node.closest("[data-sonner-toaster], [data-radix-toast-viewport], [aria-live]");
    if (liveParent instanceof HTMLElement) {
      const child = Array.from(liveParent.children).find((item) => item.contains(node));
      if (child instanceof HTMLElement) return child;
    }

    const floatingStack = node.closest(".fixed");
    if (floatingStack instanceof HTMLElement && floatingStack !== node) {
      let shell = node;
      while (shell.parentElement && shell.parentElement !== floatingStack) {
        const parent = shell.parentElement;
        const parentText = normalizedText(parent);
        if (!isToastText(parentText) || parentText.length > 320) break;
        shell = parent;
      }
      return shell;
    }

    let shell = node;
    while (shell.parentElement && shell.parentElement !== document.body) {
      const parent = shell.parentElement;
      const parentText = normalizedText(parent);
      if (!isToastText(parentText) || parentText.length > 320) break;
      const parentStyle = window.getComputedStyle(parent);
      const parentLooksFloating = parentStyle.position === "fixed" || parentStyle.position === "absolute";
      if (!parentLooksFloating && !parent.closest("[aria-live], [data-sonner-toaster], [data-radix-toast-viewport]")) break;
      shell = parent;
    }
    return shell;
  }

  function dismissToast(node, delay = TOAST_LIFETIME_MS) {
    if (!(node instanceof HTMLElement)) return;
    if (node.classList.contains("kiro-toast-managed") && !node.classList.contains("kiro-toast-suppressed")) return;
    window.clearTimeout(toastTimers.get(node));
    node.classList.add("kiro-toast-managed");
    node.classList.remove("kiro-toast-suppressed", "kiro-toast-exit");
    const timer = window.setTimeout(() => {
      if (!node.isConnected) return;
      node.classList.add("kiro-toast-exit");
    }, delay);
    toastTimers.set(node, timer);
  }

  function suppressToast(node) {
    if (!(node instanceof HTMLElement)) return;
    window.clearTimeout(toastTimers.get(node));
    node.classList.add("kiro-toast-managed", "kiro-toast-suppressed");
  }

  function manageToasts() {
    if (!document.body) return;
    const candidates = Array.from(
      document.querySelectorAll("[data-sonner-toast], [data-radix-toast], [data-radix-toast-root], [data-toast], [role='status'], [role='alert'], [aria-live], [aria-live] *, [data-sonner-toaster] *, [data-radix-toast-viewport] *, body > div, body > div *, body > section, body > section *")
    )
      .filter(isToastLike)
      .map(toastShell);

    const unique = Array.from(new Set(candidates)).filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      return !candidates.some((other) => other !== node && other instanceof HTMLElement && node.contains(other) && isToastText(normalizedText(other)));
    });

    if (unique.length === 0) return;

    if (route() === "drone-control") {
      unique.forEach((node) => {
        if (node instanceof HTMLElement && node.id !== "kiro-action-toast") {
          node.classList.add("kiro-native-toast-hidden");
        }
      });
      return;
    }

    unique.forEach((node, index) => {
      const isLatest = index === unique.length - 1;
      if (isLatest) {
        dismissToast(node, TOAST_LIFETIME_MS);
      } else {
        suppressToast(node);
      }
    });
  }

  function sweepToasts() {
    manageToasts();
    window.clearTimeout(toastSweepTimer);
    toastSweepTimer = window.setTimeout(manageToasts, 80);
    window.setTimeout(manageToasts, 260);
    window.setTimeout(manageToasts, 700);
  }

  function handleDroneAction(event) {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    const message = droneActionMessage(button);
    if (!message) return;
    showActionToast(message);
    window.setTimeout(sweepToasts, 20);
    window.setTimeout(sweepToasts, 160);
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
    markBottomNavigation(root);
    manageToasts();
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
  window.addEventListener("pointerdown", handleDroneAction, true);
  window.addEventListener("click", sweepToasts, true);
  window.addEventListener("pointerdown", sweepToasts, true);

  new MutationObserver(scheduleEnhance).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  scheduleEnhance();
})();
