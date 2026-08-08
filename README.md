# MS365 Copilot Auto Model Selector

[日本語](README_JA.md)

A Chrome extension that selects your preferred model right before sending a message in Microsoft 365 Copilot Chat. By default, it selects `GPT 5.6 Think deeper`.

## Supported Languages

The extension is designed for Microsoft 365 Copilot Chat in English and Japanese. The extension popup UI also supports English and Japanese, and can be switched from the popup.

## Installation

1. Download and extract the latest zip from [Releases](https://github.com/YamamotoYamato/ms365-copilot-auto-model-selector/releases).
2. Open `chrome://extensions` in Chrome.
3. Enable `Developer mode`.
4. Click `Load unpacked` and select the extracted `ms365-copilot-auto-model-selector` folder.

## Usage

1. Open `https://m365.cloud.microsoft/chat/`.
2. Sign in to Microsoft 365.
3. Write and send a message as usual.
4. The extension temporarily holds the send action, selects the configured model from the model menu, then sends the message.

The extension does not select a model on page load or DOM changes. In both wide and narrow layouts, model selection runs only immediately before sending.

If the model menu path changes, update it from the extension popup. Specify click targets in order, separated by commas, such as `GPT, GPT 5.6 Think deeper`. For a direct item such as `Think Deeper`, specify only that name.

To use a different model for specific URLs, configure `URL別ルール` in the popup. When the current URL contains the configured text, the URL-specific selection path is used instead of the default `選択順`. Rules are evaluated from top to bottom, and the first matching rule is used. Rules can be reordered with the up/down buttons. By default, URLs containing `/chat/agent/new` disable automatic model selection, and URLs containing `/chat/agent` select `Think Deeper`. Leaving `URL別の選択順` empty disables automatic model selection for that URL.

After updating the extension, reload it in `chrome://extensions`, then reload the Copilot Chat tab.

## Notes

- Permissions are limited to `https://m365.cloud.microsoft/*` and `storage`.
- Prompts and conversation content are not sent externally. The extension only checks locally whether the input box is non-empty before send-time model selection.
- When IME composition is active in the input box, the extension does not hold the send action, so conversion is not interrupted.
- If the target model cannot be clicked, the extension keeps holding the send action for up to 3 seconds so the message is not sent as Auto. After 3 seconds, the hold state is released without sending the message.
- The popup can configure automatic selection, the default selection path, and URL-specific selection paths. Changes are saved automatically.
- To tolerate Microsoft UI changes, the extension looks for targets using visible text, ARIA attributes, and open menu state instead of fixed selectors.

## License

This project is dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). SPDX-License-Identifier: `CC0-1.0`. See `LICENSE` for details.

## Changelog

See `CHANGELOG.md`.
