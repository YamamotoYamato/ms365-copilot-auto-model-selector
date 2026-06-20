# Class Diagram

この拡張はクラスを定義せず、`content.js` と `popup.js` の関数群で構成する。
ここでは、保守時に参照しやすいように主要な責務とデータ構造の関係を示す。

```mermaid
classDiagram
  class Manifest {
    +storage permission
    +m365.cloud.microsoft host permission
    +content_scripts: src/content.js
    +action.default_popup: src/popup.html
  }

  class ContentScript {
    -Config config
    -RuntimeState state
    +init()
    +loadConfig()
    +runSelection(reason)
    +holdEnterUntilModelSelected(event)
    +holdSendClickUntilModelSelected(event)
  }

  class Popup {
    -Settings settings
    -Translation TEXT
    +loadSettings()
    +saveSettings(options)
    +renderUrlRules(rules)
    +setLanguage(language, options)
  }

  class Config {
    +boolean enabled
    +string targetPath
    +UrlRule[] urlRules
    +string[] pickerHints
  }

  class RuntimeState {
    +boolean isSelecting
    +boolean isPromptComposing
    +number pendingSendAt
    +string pendingSendMode
    +number pendingTargetClickedAt
    +string lastStatus
  }

  class Settings {
    +boolean enabled
    +string targetPath
    +UrlRule[] urlRules
    +string uiLanguage
  }

  class UrlRule {
    +string urlIncludes
    +string targetPath
  }

  class ChromeStorageSync {
    +get(defaults, callback)
    +set(values, callback)
    +onChanged.addListener(callback)
  }

  class CopilotChatPage {
    +prompt input
    +send button
    +model picker
    +model menu
  }

  Manifest --> ContentScript : injects
  Manifest --> Popup : opens
  ContentScript --> Config : reads
  ContentScript --> RuntimeState : updates
  ContentScript --> CopilotChatPage : observes and clicks
  ContentScript --> ChromeStorageSync : load and watch config
  Popup --> Settings : edits
  Popup --> ChromeStorageSync : save and load settings
  Config --> UrlRule
  Settings --> UrlRule
```

## Responsibilities

- `content.js`: Copilot Chat の送信操作を一時保持し、設定に応じてモデルを選択してから送信する。
- `popup.js`: ポップアップ UI で設定を読み書きし、URL 別ルールや表示言語を管理する。
- `chrome.storage.sync`: ポップアップとコンテンツスクリプト間で共有する設定の保存先。
- `UrlRule`: URL に含まれる文字列と、その URL で使う選択パスを表す。`targetPath` が空の場合は、その URL で自動選択を無効にする。
