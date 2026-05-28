const DEFAULTS = {
  enabled: true,
  restorePromptFocus: true,
  targetPath: "GPT, GPT 5.5 Think Deeper",
  urlRules: [{ urlIncludes: "/agent/", targetPath: "Think Deeper" }],
  urlRuleMatch: "",
  urlRuleTargetPath: ""
};

const enabledInput = document.querySelector("#enabled");
const restorePromptFocusInput = document.querySelector("#restorePromptFocus");
const targetPathInput = document.querySelector("#targetPath");
const urlRulesList = document.querySelector("#urlRules");
const addUrlRuleButton = document.querySelector("#addUrlRule");
const helpText = document.querySelector("#helpText");
const statusText = document.querySelector("#status");
const storage = globalThis.chrome?.storage?.sync;
const DEFAULT_HELP = helpText?.textContent || "";

function setStatus(message) {
  statusText.textContent = message;
}

function setHelp(message = DEFAULT_HELP) {
  if (helpText) {
    helpText.textContent = message;
  }
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

  if (normalizedRules.length > 0) {
    return normalizedRules;
  }

  const urlIncludes = normalizeUrlRuleMatch(settings.urlRuleMatch);
  const targetPath = normalizeTargetPath(settings.urlRuleTargetPath);
  return urlIncludes ? [{ urlIncludes, targetPath }] : [];
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
    "例: /agent/ など",
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
      "URLに含む文字列が一致した時に使う選択順です。空にすると、そのURLでは自動選択しません。",
      pathInput
    )
  );

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "danger";
  removeButton.dataset.removeUrlRule = "true";
  removeButton.dataset.help = "このURL別ルールを削除します。";
  removeButton.textContent = "削除";

  row.append(fields, removeButton);
  return row;
}

function addUrlRuleRow(rule = {}) {
  const row = createUrlRuleRow(rule);
  urlRulesList.append(row);
  updateRemoveButtons();
  return row;
}

function renderUrlRules(rules) {
  urlRulesList.replaceChildren();

  const rows = rules.length > 0 ? rules : [{}];
  rows.forEach((rule) => addUrlRuleRow(rule));
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const rows = Array.from(urlRulesList.querySelectorAll(".rule-row"));
  const shouldShowRemove = rows.length > 1;

  rows.forEach((row) => {
    const removeButton = row.querySelector("[data-remove-url-rule]");
    if (removeButton) {
      removeButton.hidden = !shouldShowRemove;
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

function loadSettings() {
  if (!storage) {
    enabledInput.checked = DEFAULTS.enabled;
    restorePromptFocusInput.checked = DEFAULTS.restorePromptFocus;
    targetPathInput.value = DEFAULTS.targetPath;
    renderUrlRules(DEFAULTS.urlRules);
    return;
  }

  storage.get(DEFAULTS, (settings) => {
    enabledInput.checked = Boolean(settings.enabled);
    restorePromptFocusInput.checked = settings.restorePromptFocus !== false;
    targetPathInput.value = normalizeTargetPath(
      settings.targetPath || DEFAULTS.targetPath
    );
    renderUrlRules(normalizeUrlRules(settings));
  });
}

function saveSettings() {
  const targetPath =
    normalizeTargetPath(targetPathInput.value) || DEFAULTS.targetPath;
  const urlRules = readUrlRules();

  if (!urlRules) {
    return;
  }

  if (!storage) {
    targetPathInput.value = targetPath;
    renderUrlRules(urlRules);
    setStatus("ローカル表示です。拡張として開くと保存できます。");
    return;
  }

  storage.set(
    {
      enabled: enabledInput.checked,
      restorePromptFocus: restorePromptFocusInput.checked,
      targetPath,
      urlRules,
      urlRuleMatch: "",
      urlRuleTargetPath: ""
    },
    () => {
      targetPathInput.value = targetPath;
      renderUrlRules(urlRules);
      setStatus("保存しました。開いているCopilotタブにも反映されます。");
    }
  );
}

document.querySelector("#save").addEventListener("click", saveSettings);
document.querySelector("#reset").addEventListener("click", () => {
  enabledInput.checked = DEFAULTS.enabled;
  restorePromptFocusInput.checked = DEFAULTS.restorePromptFocus;
  targetPathInput.value = DEFAULTS.targetPath;
  renderUrlRules(DEFAULTS.urlRules);
  saveSettings();
});

addUrlRuleButton.addEventListener("click", () => {
  const row = addUrlRuleRow();
  row.querySelector("[data-url-rule-match]")?.focus();
});

urlRulesList.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-url-rule]");
  if (!removeButton) {
    return;
  }

  removeButton.closest(".rule-row")?.remove();
  if (!urlRulesList.children.length) {
    addUrlRuleRow();
  }
  updateRemoveButtons();
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
