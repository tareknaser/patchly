import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { chat, getOpenAIClient, AIMessage } from './aiProvider';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'patchly.chatView';
    private _view?: vscode.WebviewView;
    private _conversationHistory: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [];

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
        - Give a SHORT, plain-language primer FIRST when the conversation starts (what ReDoS is, why it matters, how the given attack string stresses the shown pattern). Keep it under ~10 lines, with a numbered or bulleted list.
        - Immediately after the primer, pivot to a guiding question (Socratic), encouraging the dev to reason about the specific risky subpattern.
        - In later turns, continue Socratic teaching. Use the attack string as a concrete example and suggest safer rewrites that are compatible with JavaScript, but don't flood the user—offer one or two fixes at a time.
        - Be friendly, concise, and practical. Prefer code snippets the user can copy/paste to test performance locally.
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
                'attackWalkthrough',
                'microBenchmark',
                'oneGuidingQuestion'
              ],
              limits: { maxLines: 18, maxCodeBlocks: 2 }
            }
          };
      
          this._conversationHistory.push({
            role: 'user',
            content:
              `Generate the FIRST assistant message now using this JSON:\n` +
              `\`\`\`json\n${JSON.stringify(initPayload, null, 2)}\n\`\`\`\n` +
              `Do not ask for more info yet.`
          });
      
          // 3) Focus the view and show typing
          await vscode.commands.executeCommand('patchly.chatView.focus');
          await new Promise(r => setTimeout(r, 60));
          this._view?.webview.postMessage({ type: 'typing', isTyping: true });
      
          // 4) Call LLM to produce the very first assistant message (no hard-coding)
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

            this._view?.webview.postMessage({
                type: 'assistantMessage',
                message: 'Hello! Let\’s explore the ReDoS vulnerability together.'
            });
      
            const text = await chat(this._conversationHistory as AIMessage[], { model: 'gpt-4.1', temperature: 0.1 });
            const reply = text || 'Sorry, couldn’t generate a response.';
      
            this._conversationHistory.push({ role: 'assistant', content: reply });
            this._view?.webview.postMessage({ type: 'typing', isTyping: false });
            this._view?.webview.postMessage({ type: 'assistantMessage', message: reply });
          } catch (err) {
            this._view?.webview.postMessage({ type: 'typing', isTyping: false });
            const errorMsg = err instanceof Error ? err.message : 'Unknown error';
            this._view?.webview.postMessage({ type: 'assistantMessage', message: `${errorMsg}. Check your API key?` });
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
      
            const response = await chat(this._conversationHistory as AIMessage[], { model: 'gpt-4.1', temperature: 0.3 });
      
            const text = response || 'Sorry, couldn’t generate a response.';
            this._conversationHistory.push({ role: 'assistant', content: text });
      
            this._view?.webview.postMessage({ type: 'typing', isTyping: false });
            this._view?.webview.postMessage({ type: 'assistantMessage', message: text });
        } catch (error) {
            this._view?.webview.postMessage({ type: 'typing', isTyping: false });
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this._view?.webview.postMessage({ type: 'assistantMessage', message: `${errorMsg}. Check your API key?` });
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
        .replace(/%CSP_SOURCE%/g, webview.cspSource).replace(/%SCRIPT_URI%/g, String(scriptUri))
        .replace(/%STYLE_URI%/g, String(styleUri))
        .replace(/%NONCE%/g, nonce);

        return html;
    }

    private getNonce() {
        const chars =
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let out = '';
        for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
        return out;
      }
}