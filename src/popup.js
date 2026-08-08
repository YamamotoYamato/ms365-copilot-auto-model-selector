const DEFAULTS = {
  enabled: true,
  targetPath: "GPT, GPT 5.6 Think deeper",
  urlRules: [
    { urlIncludes: "/chat/agent/new", targetPath: "" },
    { urlIncludes: "/chat/agent", targetPath: "Think Deeper" }
  ],
  uiLanguage: "",
  urlRuleMatch: "",
  urlRuleTargetPath: ""
};

const TRANSLATIONS = {
  en: {
    lang: "en",
    behaviorSectionLabel: "Behavior settings",
    languageLabel: "Use Japanese UI",
    languageHelp:
      "Switch the settings screen between English and Japanese.",
    enabledLabel: "Enable automatic selection",
    enabledHelp:
      "Holds Copilot Chat sends briefly, selects the configured model, then sends.",
    modelSectionLabel: "Model settings",
    targetPathLabel: "Selection path",
    targetPathHelp:
      "Specify click targets in order, separated by commas. Example: GPT, GPT 5.6 Think deeper",
    urlRulesSectionLabel: "URL-specific model settings",
    urlRulesTitle: "URL rules",
    urlRulesDescription:
      "Rules are evaluated from top to bottom. Use Up/Down to reorder them.",
    addUrlRule: "Add",
    addUrlRuleHelp: "Add one URL rule.",
    urlRulesListLabel: "URL rules list",
    helpTitle: "Description",
    defaultHelp: "Hover over an item to show its description.",
    reset: "Reset to defaults",
    resetHelp: "Reset settings to defaults and save them.",
    urlPlaceholder: "Example: /chat/agent",
    pathPlaceholder: "Example: Think Deeper",
    urlIncludesLabel: "URL contains",
    urlIncludesHelp:
      "Use this rule only when the current URL contains this text.",
    urlTargetPathLabel: "URL-specific selection path",
    urlTargetPathHelp:
      "Selection path used when the URL rule matches. Leave empty to disable automatic model selection for that URL.",
    remove: "Delete",
    removeHelp: "Delete this URL rule.",
    moveUp: "Up",
    moveUpHelp: "Move this URL rule up.",
    moveDown: "Down",
    moveDownHelp: "Move this URL rule down.",
    saveSucceeded: "Saved. Open Copilot tabs are updated.",
    autoSaved: "Auto-saved.",
    resetSaved: "Reset to defaults and saved.",
    localPreview: "Local preview. Open as the extension to save settings.",
    saveFailed: (message) => `Could not save: ${message}`,
    urlRuleMissing: (index) =>
      `URL rule ${index} must include text to match in the URL.`
  },
  ja: {
    lang: "ja",
    behaviorSectionLabel: "動作設定",
    languageLabel: "日本語表示",
    languageHelp:
      "設定画面を英語/日本語で切り替えます。",
    enabledLabel: "自動選択を有効化",
    enabledHelp:
      "Copilot Chatの送信時に、指定モデルの選択を挟みます。",
    modelSectionLabel: "モデル設定",
    targetPathLabel: "選択順",
    targetPathHelp:
      "クリックする項目をカンマ区切りで順番に指定します。例: GPT, GPT 5.6 Think deeper",
    urlRulesSectionLabel: "URL別モデル設定",
    urlRulesTitle: "URL別ルール",
    urlRulesDescription:
      "上から順に判定し、上へ/下へで並べ替えできます。",
    addUrlRule: "追加",
    addUrlRuleHelp: "URL別ルールを1行追加します。",
    urlRulesListLabel: "URL別ルール一覧",
    helpTitle: "説明",
    defaultHelp: "項目にカーソルを合わせると説明を表示します。",
    reset: "初期値に戻す",
    resetHelp: "設定を既定値に戻して保存します。",
    urlPlaceholder: "例: /chat/agent など",
    pathPlaceholder: "例: Think Deeper など",
    urlIncludesLabel: "URLに含む文字列",
    urlIncludesHelp:
      "現在のURLにこの文字列が含まれる時だけ、このルールの選択順を使います。",
    urlTargetPathLabel: "URL別の選択順",
    urlTargetPathHelp:
      "URLに含む文字列が一致した時に使う選択順です。空にすると、そのURLでは自動選択が無効になります。",
    remove: "削除",
    removeHelp: "このURL別ルールを削除します。",
    moveUp: "上へ",
    moveUpHelp: "このURL別ルールを1つ上に移動します。",
    moveDown: "下へ",
    moveDownHelp: "このURL別ルールを1つ下に移動します。",
    saveSucceeded: "保存しました。開いているCopilotタブにも反映されます。",
    autoSaved: "自動保存しました。",
    resetSaved: "初期値に戻して保存しました。",
    localPreview: "ローカル表示です。拡張として開くと保存できます。",
    saveFailed: (message) => `保存できませんでした: ${message}`,
    urlRuleMissing: (index) =>
      `URL別ルール ${index} は、URLに含む文字列を入力してください。`
  }
};

const SETTINGS_AUTO_SAVE_DELAY_MS = 250;
const STATUS_CLEAR_DELAY_MS = 2500;
const ERROR_STATUS_CLEAR_DELAY_MS = 6000;

const behaviorSection = document.querySelector("#behaviorSection");
const languageField = document.querySelector("#languageField");
const languageLabel = document.querySelector("#languageLabel");
const languageInput = document.querySelector("#uiLanguage");
const enabledField = document.querySelector("#enabledField");
const enabledLabel = document.querySelector("#enabledLabel");
const modelSection = document.querySelector("#modelSection");
const targetPathField = document.querySelector("#targetPathField");
const targetPathLabel = document.querySelector("#targetPathLabel");
const urlRulesSection = document.querySelector("#urlRulesSection");
const urlRulesTitle = document.querySelector("#urlRulesTitle");
const urlRulesDescription = document.querySelector("#urlRulesDescription");
const helpTitle = document.querySelector("#helpTitle");
const enabledInput = document.querySelector("#enabled");
const targetPathInput = document.querySelector("#targetPath");
const urlRulesList = document.querySelector("#urlRules");
const addUrlRuleButton = document.querySelector("#addUrlRule");
const resetButton = document.querySelector("#reset");
const helpText = document.querySelector("#helpText");
const statusText = document.querySelector("#status");
const storage = globalThis.chrome?.storage?.sync;

let currentLanguage = getUiLanguage();
let TEXT = TRANSLATIONS[currentLanguage];
let settingsAutoSaveTimerId = null;
let statusClearTimerId = null;
let saveRequestId = 0;

function normalizeLanguage(value) {
  const language = String(value || "").toLowerCase();
  if (language === "ja" || language.startsWith("ja-")) {
    return "ja";
  }
  if (language === "en" || language.startsWith("en-")) {
    return "en";
  }
  return "";
}

function getUiLanguage(settings = {}) {
  const queryLanguage = new URLSearchParams(location.search).get("lang");
  const storedLanguage = settings.uiLanguage;
  const browserLanguage =
    globalThis.chrome?.i18n?.getUILanguage?.() || navigator.language || "en";
  return (
    normalizeLanguage(queryLanguage) ||
    normalizeLanguage(storedLanguage) ||
    normalizeLanguage(browserLanguage) ||
    "en"
  );
}

function setText(element, text) {
  if (element) {
    element.textContent = text;
  }
}

function applyLocalizedText() {
  document.documentElement.lang = TEXT.lang;

  behaviorSection?.setAttribute("aria-label", TEXT.behaviorSectionLabel);
  modelSection?.setAttribute("aria-label", TEXT.modelSectionLabel);
  urlRulesSection?.setAttribute("aria-label", TEXT.urlRulesSectionLabel);
  urlRulesList?.setAttribute("aria-label", TEXT.urlRulesListLabel);

  setText(languageLabel, TEXT.languageLabel);
  setText(enabledLabel, TEXT.enabledLabel);
  setText(targetPathLabel, TEXT.targetPathLabel);
  setText(urlRulesTitle, TEXT.urlRulesTitle);
  setText(urlRulesDescription, TEXT.urlRulesDescription);
  setText(addUrlRuleButton, TEXT.addUrlRule);
  setText(helpTitle, TEXT.helpTitle);
  setText(helpText, TEXT.defaultHelp);
  setText(resetButton, TEXT.reset);

  if (languageField) {
    languageField.dataset.help = TEXT.languageHelp;
  }
  if (enabledField) {
    enabledField.dataset.help = TEXT.enabledHelp;
  }
  if (targetPathField) {
    targetPathField.dataset.help = TEXT.targetPathHelp;
  }
  if (addUrlRuleButton) {
    addUrlRuleButton.dataset.help = TEXT.addUrlRuleHelp;
  }
  if (resetButton) {
    resetButton.dataset.help = TEXT.resetHelp;
  }
}

function getRawUrlRulesFromRows() {
  return Array.from(urlRulesList.querySelectorAll(".rule-row")).map((row) => ({
    urlIncludes: row.querySelector("[data-url-rule-match]")?.value || "",
    targetPath: row.querySelector("[data-url-rule-target-path]")?.value || ""
  }));
}

function setLanguage(language, { rerenderRules = false } = {}) {
  const rules = rerenderRules ? getRawUrlRulesFromRows() : null;
  currentLanguage = language === "ja" ? "ja" : "en";
  TEXT = TRANSLATIONS[currentLanguage];

  if (languageInput) {
    languageInput.checked = currentLanguage === "ja";
  }

  applyLocalizedText();

  if (rerenderRules) {
    renderUrlRules(rules);
  }
}

function setStatus(message, { persistMs = STATUS_CLEAR_DELAY_MS } = {}) {
  if (statusClearTimerId) {
    clearTimeout(statusClearTimerId);
    statusClearTimerId = null;
  }

  statusText.textContent = message;

  if (!message || persistMs <= 0) {
    return;
  }

  statusClearTimerId = setTimeout(() => {
    statusText.textContent = "";
    statusClearTimerId = null;
  }, persistMs);
}

function setHelp(message = TEXT.defaultHelp) {
  if (helpText) {
    helpText.textContent = message;
  }
}

function getStorageError() {
  return globalThis.chrome?.runtime?.lastError;
}

function normalizeTargetPath(value) {
  return String(value || "")
    .replaceAll(">", ",")
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeUrlRuleMatch(value) {
  return String(value || "").trim();
}

function normalizeUrlRules(settings = {}) {
  const rules = Array.isArray(settings.urlRules) ? settings.urlRules : [];
  const normalizedRules = rules
    .map((rule) => ({
      urlIncludes: normalizeUrlRuleMatch(rule?.urlIncludes),
      targetPath: normalizeTargetPath(rule?.targetPath)
    }))
    .filter((rule) => rule.urlIncludes);

  if (isLegacyDefaultUrlRules(normalizedRules)) {
    return DEFAULTS.urlRules;
  }

  if (normalizedRules.length > 0) {
    return normalizedRules;
  }

  const urlIncludes = normalizeUrlRuleMatch(settings.urlRuleMatch);
  const targetPath = normalizeTargetPath(settings.urlRuleTargetPath);
  return urlIncludes ? [{ urlIncludes, targetPath }] : [];
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

function createTextInput(placeholder, datasetKey, value) {
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  input.placeholder = placeholder;
  input.dataset[datasetKey] = "true";
  input.value = value;
  return input;
}

function createField(labelText, helpTextValue, input) {
  const label = document.createElement("label");
  label.className = "field";
  label.dataset.help = helpTextValue;

  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;

  label.append(labelSpan, input);
  return label;
}

function createUrlRuleRow(rule = {}) {
  const row = document.createElement("div");
  row.className = "rule-row";

  const fields = document.createElement("div");
  fields.className = "rule-fields";

  const urlInput = createTextInput(
    TEXT.urlPlaceholder,
    "urlRuleMatch",
    rule.urlIncludes || ""
  );
  const pathInput = createTextInput(
    TEXT.pathPlaceholder,
    "urlRuleTargetPath",
    rule.targetPath || ""
  );

  fields.append(
    createField(TEXT.urlIncludesLabel, TEXT.urlIncludesHelp, urlInput),
    createField(
      TEXT.urlTargetPathLabel,
      TEXT.urlTargetPathHelp,
      pathInput
    )
  );

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "danger";
  removeButton.dataset.removeUrlRule = "true";
  removeButton.dataset.help = TEXT.removeHelp;
  removeButton.textContent = TEXT.remove;

  const moveUpButton = document.createElement("button");
  moveUpButton.type = "button";
  moveUpButton.dataset.moveUrlRule = "up";
  moveUpButton.dataset.help = TEXT.moveUpHelp;
  moveUpButton.textContent = TEXT.moveUp;

  const moveDownButton = document.createElement("button");
  moveDownButton.type = "button";
  moveDownButton.dataset.moveUrlRule = "down";
  moveDownButton.dataset.help = TEXT.moveDownHelp;
  moveDownButton.textContent = TEXT.moveDown;

  const actions = document.createElement("div");
  actions.className = "rule-actions";
  actions.append(moveUpButton, moveDownButton, removeButton);

  row.append(fields, actions);
  return row;
}

function addUrlRuleRow(rule = {}) {
  const row = createUrlRuleRow(rule);
  urlRulesList.append(row);
  updateRuleButtons();
  return row;
}

function renderUrlRules(rules) {
  urlRulesList.replaceChildren();

  const rows = rules.length > 0 ? rules : [{}];
  rows.forEach((rule) => addUrlRuleRow(rule));
  updateRuleButtons();
}

function updateRuleButtons() {
  const rows = Array.from(urlRulesList.querySelectorAll(".rule-row"));
  const shouldShowActions = rows.length > 1;

  rows.forEach((row, index) => {
    const moveUpButton = row.querySelector("[data-move-url-rule='up']");
    const moveDownButton = row.querySelector("[data-move-url-rule='down']");
    const removeButton = row.querySelector("[data-remove-url-rule]");

    if (moveUpButton) {
      moveUpButton.hidden = !shouldShowActions;
      moveUpButton.disabled = index === 0;
    }

    if (moveDownButton) {
      moveDownButton.hidden = !shouldShowActions;
      moveDownButton.disabled = index === rows.length - 1;
    }

    if (removeButton) {
      removeButton.hidden = !shouldShowActions;
    }
  });
}

function readUrlRules() {
  const rows = Array.from(urlRulesList.querySelectorAll(".rule-row"));
  const rules = [];

  for (const [index, row] of rows.entries()) {
    const urlIncludes = normalizeUrlRuleMatch(
      row.querySelector("[data-url-rule-match]")?.value
    );
    const targetPath = normalizeTargetPath(
      row.querySelector("[data-url-rule-target-path]")?.value
    );

    if (!urlIncludes && !targetPath) {
      continue;
    }

    if (!urlIncludes) {
      setStatus(TEXT.urlRuleMissing(index + 1));
      return null;
    }

    rules.push({ urlIncludes, targetPath });
  }

  return rules;
}

function clearSettingsAutoSaveTimer() {
  if (settingsAutoSaveTimerId) {
    clearTimeout(settingsAutoSaveTimerId);
    settingsAutoSaveTimerId = null;
  }
}

function saveToStorage(values, { onSuccess, successMessage, localMessage }) {
  if (!storage) {
    if (onSuccess) {
      onSuccess();
    }
    setStatus(localMessage);
    return;
  }

  const requestId = ++saveRequestId;
  storage.set(values, () => {
    if (requestId !== saveRequestId) {
      return;
    }

    const error = getStorageError();
    if (error) {
      setStatus(TEXT.saveFailed(error.message), {
        persistMs: ERROR_STATUS_CLEAR_DELAY_MS
      });
      return;
    }

    if (onSuccess) {
      onSuccess();
    }
    setStatus(successMessage);
  });
}

function collectSettings() {
  const targetPath =
    normalizeTargetPath(targetPathInput.value) || DEFAULTS.targetPath;
  const urlRules = readUrlRules();

  if (!urlRules) {
    return null;
  }

  return {
    enabled: enabledInput.checked,
    targetPath,
    urlRules,
    uiLanguage: currentLanguage,
    urlRuleMatch: "",
    urlRuleTargetPath: ""
  };
}

function saveSettings({
  renderAfterSave = true,
  successMessage = TEXT.saveSucceeded
} = {}) {
  clearSettingsAutoSaveTimer();
  const settings = collectSettings();

  if (!settings) {
    return false;
  }

  saveToStorage(settings, {
    onSuccess() {
      if (renderAfterSave) {
        targetPathInput.value = settings.targetPath;
        renderUrlRules(settings.urlRules);
      }
    },
    successMessage,
    localMessage: TEXT.localPreview
  });
  return true;
}

function loadSettings() {
  if (!storage) {
    setLanguage(getUiLanguage());
    enabledInput.checked = DEFAULTS.enabled;
    targetPathInput.value = DEFAULTS.targetPath;
    renderUrlRules(DEFAULTS.urlRules);
    return;
  }

  storage.get(DEFAULTS, (settings) => {
    setLanguage(getUiLanguage(settings));
    enabledInput.checked = Boolean(settings.enabled);
    targetPathInput.value = normalizeTargetPath(
      settings.targetPath || DEFAULTS.targetPath
    );
    renderUrlRules(normalizeUrlRules(settings));
  });
}

function saveSettingsNow() {
  return saveSettings({
    renderAfterSave: false,
    successMessage: TEXT.autoSaved
  });
}

function scheduleSettingsAutoSave() {
  clearSettingsAutoSaveTimer();
  settingsAutoSaveTimerId = setTimeout(() => {
    settingsAutoSaveTimerId = null;
    saveSettingsNow();
  }, SETTINGS_AUTO_SAVE_DELAY_MS);
}

resetButton.addEventListener("click", () => {
  enabledInput.checked = DEFAULTS.enabled;
  targetPathInput.value = DEFAULTS.targetPath;
  renderUrlRules(DEFAULTS.urlRules);
  saveSettings({
    successMessage: TEXT.resetSaved
  });
});

languageInput.addEventListener("change", () => {
  setLanguage(languageInput.checked ? "ja" : "en", {
    rerenderRules: true
  });
  saveSettingsNow();
});

enabledInput.addEventListener("change", saveSettingsNow);
targetPathInput.addEventListener("input", scheduleSettingsAutoSave);
targetPathInput.addEventListener("change", () => {
  saveSettings({
    successMessage: TEXT.autoSaved
  });
});

addUrlRuleButton.addEventListener("click", () => {
  const row = addUrlRuleRow();
  row.querySelector("[data-url-rule-match]")?.focus();
  saveSettingsNow();
});

urlRulesList.addEventListener("click", (event) => {
  const moveButton = event.target.closest("[data-move-url-rule]");
  if (moveButton) {
    const row = moveButton.closest(".rule-row");
    if (moveButton.dataset.moveUrlRule === "up" && row?.previousElementSibling) {
      urlRulesList.insertBefore(row, row.previousElementSibling);
    }

    if (moveButton.dataset.moveUrlRule === "down" && row?.nextElementSibling) {
      urlRulesList.insertBefore(row.nextElementSibling, row);
    }

    updateRuleButtons();
    saveSettingsNow();
    return;
  }

  const removeButton = event.target.closest("[data-remove-url-rule]");
  if (!removeButton) {
    return;
  }

  removeButton.closest(".rule-row")?.remove();
  if (!urlRulesList.children.length) {
    addUrlRuleRow();
  }
  updateRuleButtons();
  saveSettingsNow();
});

urlRulesList.addEventListener("input", (event) => {
  if (
    event.target.matches(
      "[data-url-rule-match], [data-url-rule-target-path]"
    )
  ) {
    scheduleSettingsAutoSave();
  }
});

urlRulesList.addEventListener("change", (event) => {
  if (
    event.target.matches(
      "[data-url-rule-match], [data-url-rule-target-path]"
    )
  ) {
    saveSettingsNow();
  }
});

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest("[data-help]");
  if (target) {
    setHelp(target.dataset.help);
  }
});

document.addEventListener("focusin", (event) => {
  const target = event.target.closest("[data-help]");
  if (target) {
    setHelp(target.dataset.help);
  }
});

setLanguage(currentLanguage);
loadSettings();
