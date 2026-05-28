const DEFAULTS = {
  enabled: true,
  targetPath: "GPT, GPT 5.5 Think Deeper",
  urlRules: [
    { urlIncludes: "/chat/agent/new", targetPath: "" },
    { urlIncludes: "/chat/agent", targetPath: "Think Deeper" }
  ],
  urlRuleMatch: "",
  urlRuleTargetPath: ""
};

const enabledInput = document.querySelector("#enabled");
const targetPathInput = document.querySelector("#targetPath");
const urlRulesList = document.querySelector("#urlRules");
const addUrlRuleButton = document.querySelector("#addUrlRule");
const helpText = document.querySelector("#helpText");
const statusText = document.querySelector("#status");
const storage = globalThis.chrome?.storage?.sync;
const DEFAULT_HELP = helpText?.textContent || "";
const SETTINGS_AUTO_SAVE_DELAY_MS = 250;
const STATUS_CLEAR_DELAY_MS = 2500;
const ERROR_STATUS_CLEAR_DELAY_MS = 6000;
let settingsAutoSaveTimerId = null;
let statusClearTimerId = null;
let saveRequestId = 0;

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

function setHelp(message = DEFAULT_HELP) {
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
    "例: /chat/agent など",
    "urlRuleMatch",
    rule.urlIncludes || ""
  );
  const pathInput = createTextInput(
    "例: Think Deeper など",
    "urlRuleTargetPath",
    rule.targetPath || ""
  );

  fields.append(
    createField(
      "URLに含む文字列",
      "現在のURLにこの文字列が含まれる時だけ、このルールの選択順を使います。",
      urlInput
    ),
    createField(
      "URL別の選択順",
      "URLに含む文字列が一致した時に使う選択順です。空にすると、そのURLでは自動選択が無効になります。",
      pathInput
    )
  );

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "danger";
  removeButton.dataset.removeUrlRule = "true";
  removeButton.dataset.help = "このURL別ルールを削除します。";
  removeButton.textContent = "削除";

  const moveUpButton = document.createElement("button");
  moveUpButton.type = "button";
  moveUpButton.dataset.moveUrlRule = "up";
  moveUpButton.dataset.help = "このURL別ルールを1つ上に移動します。";
  moveUpButton.textContent = "上へ";

  const moveDownButton = document.createElement("button");
  moveDownButton.type = "button";
  moveDownButton.dataset.moveUrlRule = "down";
  moveDownButton.dataset.help = "このURL別ルールを1つ下に移動します。";
  moveDownButton.textContent = "下へ";

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
      setStatus(
        `URL別ルール ${index + 1} は、URLに含む文字列を入力してください。`
      );
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
      setStatus(`保存できませんでした: ${error.message}`, {
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
    urlRuleMatch: "",
    urlRuleTargetPath: ""
  };
}

function saveSettings({
  renderAfterSave = true,
  successMessage = "保存しました。開いているCopilotタブにも反映されます。"
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
    localMessage: "ローカル表示です。拡張として開くと保存できます。"
  });
  return true;
}

function loadSettings() {
  if (!storage) {
    enabledInput.checked = DEFAULTS.enabled;
    targetPathInput.value = DEFAULTS.targetPath;
    renderUrlRules(DEFAULTS.urlRules);
    return;
  }

  storage.get(DEFAULTS, (settings) => {
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
    successMessage: "自動保存しました。"
  });
}

function scheduleSettingsAutoSave() {
  clearSettingsAutoSaveTimer();
  settingsAutoSaveTimerId = setTimeout(() => {
    settingsAutoSaveTimerId = null;
    saveSettingsNow();
  }, SETTINGS_AUTO_SAVE_DELAY_MS);
}

document.querySelector("#reset").addEventListener("click", () => {
  enabledInput.checked = DEFAULTS.enabled;
  targetPathInput.value = DEFAULTS.targetPath;
  renderUrlRules(DEFAULTS.urlRules);
  saveSettings({
    successMessage: "初期値に戻して保存しました。"
  });
});

enabledInput.addEventListener("change", saveSettingsNow);
targetPathInput.addEventListener("input", scheduleSettingsAutoSave);
targetPathInput.addEventListener("change", () => {
  saveSettings({
    successMessage: "自動保存しました。"
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

loadSettings();
