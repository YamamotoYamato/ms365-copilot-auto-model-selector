(() => {
  "use strict";

  const EXTENSION_NAME = "MS365 Copilot Auto Model Selector";
  const NEXT_STEP_DELAY_MS = 0;
  const CLICK_COOLDOWN_MS = 0;
  const PENDING_SEND_RETRY_MS = 50;
  const SEND_BUTTON_HINTS = [
    "send",
    "submit",
    "submit prompt",
    "send message",
    "送信"
  ];
  const SEND_BUTTON_EXCLUDES = [
    "feedback",
    "share",
    "copy",
    "attach",
    "dictate",
    "microphone",
    "voice",
    "settings",
    "model",
    "stop",
    "cancel",
    "expand",
    "フィードバック",
    "展開"
  ];
  const DEFAULT_CONFIG = {
    enabled: true,
    targetPath: "GPT, GPT 5.5 Think Deeper",
    urlRules: [
      { urlIncludes: "/chat/agent/new", targetPath: "" },
      { urlIncludes: "/chat/agent", targetPath: "Think Deeper" }
    ],
    urlRuleMatch: "",
    urlRuleTargetPath: "",
    pickerHints: [
      "select a model",
      "change model",
      "model selector",
      "choose model",
      "モデル セレクター"
    ]
  };
  const INTERACTIVE_SELECTOR = [
    "button",
    "[role='button']",
    "[role='menuitem']",
    "[role='menuitemradio']",
    "[role='option']",
    "[role='radio']",
    "[aria-haspopup]",
    "[aria-label]",
    "[title]"
  ].join(",");
  const CLICKABLE_SELECTOR = [
    "button",
    "[role='button']",
    "[role='menuitem']",
    "[role='menuitemradio']",
    "[role='option']",
    "[role='radio']",
    "[tabindex]"
  ].join(",");
  const PROMPT_INPUT_SELECTOR =
    "[role='textbox'],textarea,input[type='text'],[contenteditable='true']";
  const state = {
    config: { ...DEFAULT_CONFIG },
    retryTimerId: null,
    isSelecting: false,
    lastClickAt: 0,
    lastFamilyClickAt: 0,
    pendingSendAt: 0,
    pendingSendMode: "",
    pendingSendTimerId: null,
    pendingTargetClickedAt: 0,
    isCompletingPendingSend: false,
    isPromptComposing: false,
    lastStatus: "initializing"
  };

  const isFixture =
    document.documentElement.dataset.ms365AutoModelFixture === "true";

  function debug(...args) {
    console.debug(`[${EXTENSION_NAME}]`, ...args);
  }

  function normalize(value) {
    return String(value || "")
      .replace(/[‐-‒–—―]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeTargetPathValue(value) {
    return String(value || "")
      .replaceAll(">", ",")
      .split(",")
      .map((segment) => segment.trim())
      .filter(Boolean)
      .join(", ");
  }

  function mergeConfig(config = {}) {
    const mergedConfig = {
      ...DEFAULT_CONFIG,
      ...config
    };

    return {
      ...mergedConfig,
      targetPath: normalizeTargetPathValue(
        mergedConfig.targetPath || DEFAULT_CONFIG.targetPath
      ) || DEFAULT_CONFIG.targetPath,
      urlRules: normalizeUrlRules(mergedConfig)
    };
  }

  function normalizeUrlRules(config = {}) {
    const rules = Array.isArray(config.urlRules)
      ? config.urlRules
      : [];
    const normalizedRules = rules
      .map((rule) => ({
        urlIncludes: String(rule?.urlIncludes || "").trim(),
        targetPath: normalizeTargetPathValue(rule?.targetPath)
      }))
      .filter((rule) => rule.urlIncludes);

    if (isLegacyDefaultUrlRules(normalizedRules)) {
      return DEFAULT_CONFIG.urlRules;
    }

    if (normalizedRules.length > 0) {
      return normalizedRules;
    }

    const urlIncludes = String(config.urlRuleMatch || "").trim();
    const targetPath = normalizeTargetPathValue(config.urlRuleTargetPath);
    return urlIncludes
      ? [{ urlIncludes, targetPath }]
      : [];
  }

  function isLegacyDefaultUrlRules(rules) {
    return (
      rules.length === 3 &&
      rules[0].urlIncludes === "/chat/pages" &&
      !rules[0].targetPath &&
      rules[1].urlIncludes === "/chat/agent/new" &&
      !rules[1].targetPath &&
      rules[2].urlIncludes === "/chat/agent" &&
      rules[2].targetPath === "Think Deeper"
    );
  }

  function shouldRunOnThisPage() {
    return (
      isFixture ||
      (location.hostname === "m365.cloud.microsoft" &&
        location.pathname.startsWith("/chat"))
    );
  }

  function readElementText(element) {
    if (!element) {
      return "";
    }

    const values = [
      element.innerText,
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.getAttribute("value")
    ];

    return values.filter(Boolean).join(" ");
  }

  function readElementVisibleText(element) {
    return String(element?.innerText || element?.textContent || "");
  }

  function readElementMetaText(element) {
    if (!element) {
      return "";
    }

    return [
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid")
    ]
      .filter(Boolean)
      .join(" ");
  }

  function isVisible(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const style = getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isDisabled(element) {
    return (
      element.hasAttribute("disabled") ||
      element.getAttribute("aria-disabled") === "true"
    );
  }

  function getVisibleInteractiveElements(selector = INTERACTIVE_SELECTOR) {
    return Array.from(document.querySelectorAll(selector))
      .filter(isVisible)
      .filter((element) => !isDisabled(element));
  }

  function isInNavigation(element) {
    return Boolean(element.closest("nav,[role='navigation']"));
  }

  function isOverflowMenuButtonCandidate(element) {
    const metaText = normalize(readElementMetaText(element));
    const fullText = normalize(readElementText(element));
    const visibleText = normalize(readElementVisibleText(element));

    return (
      metaText.includes("settings and more") ||
      metaText.includes("more options") ||
      metaText.includes("設定など") ||
      fullText === "settings and more" ||
      visibleText === "..." ||
      visibleText === "⋯"
    );
  }

  function isModelPickerCandidate(element) {
    if (!element || isInNavigation(element) || isOverflowMenuButtonCandidate(element)) {
      return false;
    }

    if (!element.matches("button,[role='button'],[aria-haspopup]")) {
      return false;
    }

    if (
      element.matches(
        "[role='menuitem'],[role='menuitemradio'],[role='option'],[role='radio']"
      )
    ) {
      return false;
    }

    const hasMenu =
      element.getAttribute("aria-haspopup") ||
      element.getAttribute("aria-expanded") !== null;
    if (!hasMenu) {
      return false;
    }

    const text = normalize(readElementText(element));
    const visibleText = normalize(readElementVisibleText(element));
    const strongPickerText = [
      "model selector",
      "select a model",
      "change model",
      "choose model",
      "モデル セレクター"
    ].some((hint) => text.includes(hint));
    const currentModelText =
      visibleText === "auto" ||
      visibleText === "自動" ||
      visibleText === "quick response" ||
      visibleText === "think deeper" ||
      visibleText === "deep think" ||
      visibleText.startsWith("gpt ");

    return strongPickerText || currentModelText;
  }

  function normalizedAliases(values) {
    return Array.from(
      new Set(
        values
          .flatMap((value) => String(value || "").split(","))
          .map(normalize)
          .filter(Boolean)
      )
    );
  }

  function currentUrlForMatching() {
    return location.href;
  }

  function matchingUrlRule() {
    const currentUrl = currentUrlForMatching().toLowerCase();
    return state.config.urlRules.find((rule) =>
      currentUrl.includes(rule.urlIncludes.toLowerCase())
    );
  }

  function isSelectionDisabledForCurrentUrl() {
    const matchedRule = matchingUrlRule();
    return Boolean(matchedRule && !matchedRule.targetPath);
  }

  function effectiveTargetPathValue() {
    const matchedRule = matchingUrlRule();

    if (matchedRule?.targetPath) {
      return matchedRule.targetPath;
    }

    return state.config.targetPath;
  }

  function targetPath() {
    const value = effectiveTargetPathValue();
    if (Array.isArray(value)) {
      return value.map((segment) => String(segment).trim()).filter(Boolean);
    }

    return normalizeTargetPathValue(value).split(", ");
  }

  function targetLeaf() {
    const path = targetPath();
    return path[path.length - 1] || "";
  }

  function targetFamilySegments() {
    return targetPath().slice(0, -1);
  }

  function targetOptionAliases() {
    return normalizedAliases([targetLeaf()]);
  }

  function textMatchesSegment(text, segment) {
    const normalizedText = normalize(text);
    const normalizedSegment = normalize(segment);

    return (
      normalizedText === normalizedSegment ||
      normalizedText.includes(normalizedSegment)
    );
  }

  function textMatchesAliases(text, aliases) {
    const normalizedText = normalize(text);
    if (!normalizedText) {
      return false;
    }

    return aliases.some((alias) => normalizedText.includes(alias));
  }

  function textMatchesTargetOption(text) {
    return textMatchesAliases(text, targetOptionAliases());
  }

  function textMatchesAuto(text) {
    const normalizedText = normalize(text);
    return normalizedText === "auto" || normalizedText === "自動";
  }

  function getClickTarget(element) {
    return element.closest(CLICKABLE_SELECTOR) || element;
  }

  function clickElement(element, reason) {
    const target = getClickTarget(element);
    if (!target || !isVisible(target) || isDisabled(target)) {
      return false;
    }

    target.scrollIntoView({ block: "center", inline: "center" });
    if (typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }

    state.lastClickAt = Date.now();
    target.click();
    setStatus(reason);
    return true;
  }

  function setStatus(status) {
    state.lastStatus = status;
    document.documentElement.dataset.ms365AutoModelStatus = status;
    debug(status);
  }

  function findSelectedAuto() {
    const picker = getVisibleInteractiveElements(
      "button,[role='button'],[aria-haspopup]"
    ).find(isModelPickerCandidate);
    if (picker && textMatchesAuto(readElementVisibleText(picker))) {
      return picker;
    }

    return getVisibleInteractiveElements().find((element) => {
      if (!textMatchesAuto(readElementVisibleText(element))) {
        return false;
      }

      return (
        element.matches(
          "[role='menuitemradio'],[role='option'],[role='radio']"
        ) &&
        (element.getAttribute("aria-selected") === "true" ||
          element.getAttribute("aria-checked") === "true" ||
          element.getAttribute("data-selected") === "true")
      );
    });
  }

  function getOpenMenus() {
    return Array.from(
      document.querySelectorAll("[role='menu'],[role='listbox']")
    ).filter(isVisible);
  }

  function findVisibleTargetOption() {
    const candidates = getOpenMenus()
      .flatMap((menu) =>
        Array.from(
          menu.querySelectorAll(
            "[role='menuitem'],[role='menuitemradio'],[role='option'],[role='radio']"
          )
        )
      )
      .filter(isVisible)
      .filter((element) => !isDisabled(element));
    const matched = candidates.filter((element) =>
      textMatchesTargetOption(readElementText(element))
    );

    return (
      matched.find((element) =>
        element.matches(
          "[role='menuitem'],[role='menuitemradio'],[role='option'],[role='radio']"
        )
      ) || matched[0] || null
    );
  }

  function hasOpenMenu() {
    return getOpenMenus().length > 0;
  }

  function findTargetFamilyExpander() {
    const candidates = getOpenMenus()
      .flatMap((menu) =>
        Array.from(
          menu.querySelectorAll(
            "[role='menuitem'],[role='option'],[role='button'],button"
          )
        )
      )
      .filter(isVisible)
      .filter((element) => !isDisabled(element));

    for (const segment of targetFamilySegments()) {
      const match = candidates.find((element) => {
        const text = readElementText(element);

        return (
          textMatchesSegment(text, segment) &&
          !textMatchesTargetOption(text) &&
          element.getAttribute("aria-expanded") !== "true"
        );
      });

      if (match) {
        return match;
      }
    }

    return null;
  }

  function findModelPicker() {
    const hints = state.config.pickerHints.map(normalize).filter(Boolean);
    const candidates = getVisibleInteractiveElements(
      "button,[role='button'],[aria-haspopup]"
    ).filter(isModelPickerCandidate);

    const ranked = candidates
      .map((element) => {
        const text = normalize(readElementText(element));
        const score =
          hints.reduce(
            (total, hint) => total + (text.includes(hint) ? 1 : 0),
            0
          ) +
          (isModelPickerCandidate(element) ? 1 : 0);

        return { element, score, text };
      })
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.element || null;
  }

  function findOverflowMenuButton() {
    return (
      getVisibleInteractiveElements("button,[role='button']")
        .filter((element) => !isInNavigation(element))
        .filter((element) => element.getAttribute("aria-expanded") !== "true")
        .filter(isOverflowMenuButtonCandidate)
        .map((element) => ({
          element,
          score: scoreOverflowMenuButton(element)
        }))
        .sort((a, b) => b.score - a.score)[0]?.element || null
    );
  }

  function scoreOverflowMenuButton(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight;
    let score = 0;

    if (rect.top < Math.min(140, viewportHeight * 0.2)) {
      score += 4;
    }

    if (rect.left > viewportWidth * 0.5) {
      score += 3;
    }

    if (rect.left > viewportWidth * 0.75) {
      score += 2;
    }

    if (rect.top > viewportHeight * 0.65 && rect.left < viewportWidth * 0.35) {
      score -= 6;
    }

    return score;
  }

  function findPromptInput() {
    return (
      Array.from(document.querySelectorAll(PROMPT_INPUT_SELECTOR)).find(
        isPromptInputCandidate
      ) || null
    );
  }

  function isPromptInputCandidate(element) {
    if (
      !element ||
      !isVisible(element) ||
      isDisabled(element) ||
      isInNavigation(element) ||
      element.closest("[role='menu'],[role='listbox']")
    ) {
      return false;
    }

    return hasPromptInputHint(element) || Boolean(findSendButton(element));
  }

  function hasPromptInputHint(element) {
    const text = normalize(
      [
        element.getAttribute("aria-label"),
        element.getAttribute("placeholder"),
        element.getAttribute("aria-placeholder"),
        element.getAttribute("data-placeholder"),
        element.getAttribute("data-testid"),
        element.getAttribute("data-automation-id"),
        element.getAttribute("title"),
        element.getAttribute("name"),
        element.id,
        element.className
      ]
        .filter(Boolean)
        .join(" ")
    );

    return text.includes("copilot");
  }

  function resolvePromptInput(target) {
    const element =
      target instanceof Element ? target : target?.parentElement || null;
    if (!element) {
      return null;
    }

    const candidate = element.closest(PROMPT_INPUT_SELECTOR);
    return isPromptInputCandidate(candidate) ? candidate : null;
  }

  function promptHasFocus(input = findPromptInput()) {
    return Boolean(
      input &&
        (document.activeElement === input ||
          input.contains(document.activeElement))
    );
  }

  function markPromptActivity(event) {
    const input = resolvePromptInput(event.target);
    if (!input) {
      return;
    }

    if (event.type === "compositionstart") {
      state.isPromptComposing = true;
      return;
    }

    if (event.type === "compositionend") {
      state.isPromptComposing = false;
    }
  }

  function shouldDeferForImeComposition() {
    return state.isPromptComposing && promptHasFocus();
  }

  function promptHasText(input) {
    const text =
      input?.value ?? input?.innerText ?? input?.textContent ?? "";

    return String(text).replace(/[\s\u200b-\u200d\ufeff]/g, "").length > 0;
  }

  function isPlainEnter(event) {
    return (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey
    );
  }

  function scoreSendButton(element, input) {
    if (!element || isInNavigation(element)) {
      return -1;
    }

    const text = normalize(readElementText(element));
    if (!SEND_BUTTON_HINTS.some((hint) => text.includes(normalize(hint)))) {
      return -1;
    }

    if (SEND_BUTTON_EXCLUDES.some((hint) => text.includes(hint))) {
      return -1;
    }

    let score = 1;
    const exactText = normalize(readElementVisibleText(element));
    const exactLabel = normalize(
      [element.getAttribute("aria-label"), element.getAttribute("title")]
        .filter(Boolean)
        .join(" ")
    );
    if (element.getAttribute("type") === "submit") {
      score += 4;
    }
    if (
      exactText === "send" ||
      exactText === "送信" ||
      exactLabel === "send" ||
      exactLabel === "send send" ||
      exactLabel === "送信" ||
      exactLabel === "送信 送信"
    ) {
      score += 4;
    }

    const form = input?.closest("form");
    if (form?.contains(element)) {
      score += 4;
    }

    if (input) {
      const inputRect = input.getBoundingClientRect();
      const buttonRect = element.getBoundingClientRect();
      const nearPrompt =
        buttonRect.top <= inputRect.bottom + 180 &&
        buttonRect.bottom >= inputRect.top - 80;

      if (nearPrompt) {
        score += 2;
      }
    }

    return score;
  }

  function findSendButton(input = findPromptInput()) {
    const candidates = getVisibleInteractiveElements("button,[role='button']")
      .filter((element) => !isDisabled(element))
      .map((element) => ({
        element,
        score: scoreSendButton(element, input)
      }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.element || null;
  }

  function markTargetClickedForPendingSend() {
    if (state.pendingSendAt) {
      state.pendingTargetClickedAt = Date.now();
    }
  }

  function clearPendingSend() {
    state.pendingSendAt = 0;
    state.pendingSendMode = "";
    state.pendingTargetClickedAt = 0;
    window.clearTimeout(state.pendingSendTimerId);
    state.pendingSendTimerId = null;
  }

  function pendingSendHasClickedTarget() {
    return (
      state.pendingSendAt &&
      state.pendingTargetClickedAt >= state.pendingSendAt
    );
  }

  function completePendingSend() {
    if (!state.pendingSendAt) {
      return false;
    }

    if (pendingSendHasClickedTarget()) {
      const sendButton = findSendButton();
      if (!sendButton) {
        setStatus("waiting for send button");
        return false;
      }

      const mode = state.pendingSendMode;
      clearPendingSend();
      state.isCompletingPendingSend = true;
      try {
        return clickElement(sendButton, `sent pending ${mode || "send"}`);
      } finally {
        state.isCompletingPendingSend = false;
      }
    }

    return false;
  }

  function schedulePendingSend(reason) {
    if (!state.pendingSendAt || state.pendingSendTimerId) {
      return;
    }

    state.pendingSendTimerId = window.setTimeout(() => {
      state.pendingSendTimerId = null;
      if (completePendingSend()) {
        return;
      }

      if (!pendingSendHasClickedTarget()) {
        runSelection(`${reason} retry`);
      }
      schedulePendingSend(reason);
    }, PENDING_SEND_RETRY_MS);
  }

  function startPendingSend(mode) {
    state.pendingSendAt = Date.now();
    state.pendingSendMode = mode;
    state.pendingTargetClickedAt = 0;
  }

  function startSendGuard(mode) {
    if (!state.pendingSendAt) {
      startPendingSend(mode);
    }

    setStatus("holding send until target clicked");
    runSelection(`${mode} send guard`);
    schedulePendingSend(`${mode} send guard`);
  }

  function holdEnterUntilModelSelected(event) {
    const input = resolvePromptInput(event.target);
    if (
      !input ||
      !state.config.enabled ||
      !shouldRunOnThisPage() ||
      isSelectionDisabledForCurrentUrl() ||
      !isPlainEnter(event) ||
      event.isComposing ||
      state.isPromptComposing ||
      !promptHasText(input)
    ) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    startSendGuard("enter");
  }

  function holdSendClickUntilModelSelected(event) {
    if (
      !state.config.enabled ||
      !shouldRunOnThisPage() ||
      isSelectionDisabledForCurrentUrl() ||
      state.isCompletingPendingSend
    ) {
      return;
    }

    const sendButton = findSendButton();
    if (
      !sendButton ||
      !(event.target instanceof Node) ||
      !sendButton.contains(event.target)
    ) {
      return;
    }

    if (state.pendingSendAt) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    const input = findPromptInput();
    if (!input || state.isPromptComposing || !promptHasText(input)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    startSendGuard("click");
  }

  function scheduleCooldownRetry(reason) {
    const cooldown = CLICK_COOLDOWN_MS;
    if (cooldown <= 0) {
      return false;
    }

    const remaining = cooldown - (Date.now() - state.lastClickAt);
    if (remaining <= 0) {
      return false;
    }

    window.clearTimeout(state.retryTimerId);
    state.retryTimerId = window.setTimeout(
      () => runSelection(`${reason} cooldown retry`),
      remaining
    );
    return true;
  }

  function hasClickCooldownElapsed(lastClickAt = state.lastClickAt) {
    const cooldown = CLICK_COOLDOWN_MS;
    return cooldown <= 0 || Date.now() - lastClickAt > cooldown;
  }

  function runSelection(reason = "scheduled") {
    if (
      !state.config.enabled ||
      !shouldRunOnThisPage() ||
      isSelectionDisabledForCurrentUrl() ||
      !state.pendingSendAt ||
      state.isSelecting
    ) {
      return;
    }

    state.isSelecting = true;

    try {
      if (shouldDeferForImeComposition()) {
        setStatus("paused for ime composition");
        return;
      }

      if (findSelectedAuto()) {
        setStatus("detected auto");
      }

      const option = findVisibleTargetOption();
      if (option && clickElement(option, "clicked target option")) {
        markTargetClickedForPendingSend();
        window.setTimeout(
          completePendingSend,
          CLICK_COOLDOWN_MS
        );
        return;
      }

      const familyExpander = hasOpenMenu() ? findTargetFamilyExpander() : null;
      if (
        familyExpander &&
        hasClickCooldownElapsed(state.lastFamilyClickAt)
      ) {
        state.lastFamilyClickAt = Date.now();
        clickElement(familyExpander, "opened target model family");
        window.setTimeout(
          () => runSelection("after opening family"),
          NEXT_STEP_DELAY_MS
        );
        return;
      }

      const picker = findModelPicker();
      if (picker) {
        if (hasClickCooldownElapsed()) {
          clickElement(picker, "opened model picker");
          window.setTimeout(
            () => runSelection("after opening picker"),
            NEXT_STEP_DELAY_MS
          );
          return;
        }

        if (scheduleCooldownRetry("open model picker")) {
          setStatus("waiting for click cooldown");
          return;
        }
      }

      const overflowButton = !hasOpenMenu() ? findOverflowMenuButton() : null;
      if (overflowButton) {
        if (hasClickCooldownElapsed()) {
          clickElement(overflowButton, "opened overflow menu");
          window.setTimeout(
            () => runSelection("after opening overflow"),
            NEXT_STEP_DELAY_MS
          );
          return;
        }

        if (scheduleCooldownRetry("open overflow")) {
          setStatus("waiting for click cooldown");
          return;
        }
      }

      setStatus(`waiting: ${reason}`);
    } finally {
      state.isSelecting = false;
    }
  }

  async function loadConfig() {
    if (!globalThis.chrome?.storage?.sync) {
      return mergeConfig();
    }

    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
        resolve(mergeConfig(items));
      });
    });
  }

  async function init() {
    state.config = await loadConfig();

    for (const eventName of ["compositionstart", "compositionend"]) {
      document.addEventListener(eventName, markPromptActivity, true);
    }
    document.addEventListener("keydown", holdEnterUntilModelSelected, true);
    document.addEventListener("click", holdSendClickUntilModelSelected, true);

    if (globalThis.chrome?.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") {
          return;
        }

        for (const [key, change] of Object.entries(changes)) {
          state.config[key] = change.newValue;
        }

        state.config = mergeConfig(state.config);
      });
    }

    setStatus("waiting for send");
  }

  window.__MS365CopilotAutoModel = {
    getStatus: () => state.lastStatus,
    runSelection,
    getConfig: () => ({ ...state.config })
  };

  init().catch((error) => {
    console.error(`[${EXTENSION_NAME}] initialization failed`, error);
  });
})();
