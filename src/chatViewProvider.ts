import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { chat, getOpenAIClient, AIMessage } from './aiProvider';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'patchly.chatView';
  private _view?: vscode.WebviewView;
  private _conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

  constructor(private readonly extensionContext: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionContext.extensionUri, 'media'),
      ],
    };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      if (msg?.type === 'sendMessage' && typeof msg.message === 'string') {
        await this._handleUserMessage(msg.message);
      }
    });
  }

  public async startConversation(complexity: string, pattern: string, attack: string) {
    const complexityType = complexity || 'unknown';
    const attackPattern = attack || 'N/A';

    this._conversationHistory = [];

    this._conversationHistory.push({
      role: 'system',
      content: `
You are Patchly, a specialized AI coding tutor focused on ReDoS in regex.

Goals:
1) When the conversation starts, give a very short plain language primer on ReDoS for this user. Use one short paragraph or a bulleted list with at most 5 bullet points. Keep it brief.
2) Right after the primer, invite the user to choose what they want to do next by offering a small menu of options like:
   - Explore a bad example and see how the attack string breaks it
   - Work together on fixing the current regex pattern
   - Learn more about regex and ReDoS defenses at a high level
   - Something else the user has in mind
3) Wait for the user to pick or type their preference before going deep into any one path.
4) In later turns, stay interactive and Socratic. Ask short questions, react to their answers, and avoid long lectures.
5) Use the attack string as a concrete example when it is helpful, and show small JavaScript focused code snippets that they can copy and run.
`
    });

    const initPayload = {
      mode: 'INIT',
      complexity: complexityType,
      pattern,
      attack: attackPattern,
      firstReplyContract: {
        sections: [
          'shortPrimer',
          'interactiveMenu',
          'oneGuidingQuestion'
        ],
        limits: { maxLines: 16, maxCodeBlocks: 2 }
      }
    };

    this._conversationHistory.push({
      role: 'user',
      content:
        `Generate the FIRST assistant message now using this JSON:\n` +
        `\`\`\`json\n${JSON.stringify(initPayload, null, 2)}\n\`\`\`\n` +
        `The first reply must:\n` +
        `- Give a very brief explanation of what ReDoS is and why this pattern and attack might be risky.\n` +
        `- Then present a numbered list of 3 or 4 options, for example:\n` +
        `  1) Explore a bad example and attack it\n` +
        `  2) Get help fixing this regex\n` +
        `  3) Learn more about regex and ReDoS\n` +
        `  4) Something else I want to ask\n` +
        `- End by asking the user to choose one option (by number or text).\n` +
        `Do not ask for more information yet and do not include any system level explanations.`
    });

    // Focus the view and show typing indicator
    await vscode.commands.executeCommand('patchly.chatView.focus');
    await new Promise((r) => setTimeout(r, 60));
    this._view?.webview.postMessage({ type: 'typing', isTyping: true });

    try {
      const client = getOpenAIClient();
      if (!client) {
        this._view?.webview.postMessage({ type: 'typing', isTyping: false });
        this._view?.webview.postMessage({
          type: 'assistantMessage',
          message: 'OpenAI API is not configured. Set OPENAI_API_KEY or patchly.openaiApiKey.'
        });
        return;
      }

      // Let the LLM produce the very first interactive tutor message
      const text = await chat(this._conversationHistory as AIMessage[], {
        model: 'gpt-5.1',
        temperature: 0.1
      });

      const reply = text || 'Sorry, I could not generate a response.';

      this._conversationHistory.push({ role: 'assistant', content: reply });
      this._view?.webview.postMessage({ type: 'typing', isTyping: false });
      this._view?.webview.postMessage({ type: 'assistantMessage', message: reply });
    } catch (err) {
      this._view?.webview.postMessage({ type: 'typing', isTyping: false });
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      this._view?.webview.postMessage({
        type: 'assistantMessage',
        message: `${errorMsg}. Check your API key?`
      });
    }
  }

  private async _handleUserMessage(message: string, isSystemPrompt = false) {
    this._conversationHistory.push({ role: 'user', content: message });

    if (!isSystemPrompt && this._view) {
      this._view.webview.postMessage({ type: 'userMessage', message });
    }

    this._view?.webview.postMessage({ type: 'typing', isTyping: true });

    try {
      const client = getOpenAIClient();
      if (!client) {
        this._view?.webview.postMessage({ type: 'typing', isTyping: false });
        this._view?.webview.postMessage({
          type: 'assistantMessage',
          message: 'OpenAI API is not configured. Set OPENAI_API_KEY or patchly.openaiApiKey.'
        });
        return;
      }

      const response = await chat(this._conversationHistory as AIMessage[], {
        model: 'gpt-5.1',
        temperature: 0.3
      });

      const text = response || 'Sorry, I could not generate a response.';
      this._conversationHistory.push({ role: 'assistant', content: text });

      this._view?.webview.postMessage({ type: 'typing', isTyping: false });
      this._view?.webview.postMessage({ type: 'assistantMessage', message: text });
    } catch (error) {
      this._view?.webview.postMessage({ type: 'typing', isTyping: false });
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this._view?.webview.postMessage({
        type: 'assistantMessage',
        message: `${errorMsg}. Check your API key?`
      });
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = this.getNonce();

    const mediaRoot = vscode.Uri.joinPath(
      this.extensionContext.extensionUri,
      'media',
      'chat'
    );

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'main.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'styles.css'));

    const htmlPath = path.join(
      this.extensionContext.extensionPath,
      'media',
      'chat',
      'index.html'
    );

    let html = fs.readFileSync(htmlPath, 'utf8');

    html = html
      .replace(/%CSP_SOURCE%/g, webview.cspSource)
      .replace(/%SCRIPT_URI%/g, String(scriptUri))
      .replace(/%STYLE_URI%/g, String(styleUri))
      .replace(/%NONCE%/g, nonce);

    return html;
  }

  private getNonce() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }
}
