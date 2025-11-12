import * as vscode from 'vscode';
import { chat, getOpenAIClient, AIMessage } from './aiProvider';
import { RecheckResult } from './recheckWrapper';

export class ChatViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'patchly.chatView';
    private _view?: vscode.WebviewView;
    private _conversationHistory: Array<{ role: 'system' | 'user' | 'assistant', content: string }> = [];

    constructor(private readonly extensionContext: vscode.ExtensionContext) {}

    public resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionContext.extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async data => {
            if (data.type === 'sendMessage') {
                await this._handleUserMessage(data.message);
            }
        });
    }

    public async startConversation(recheckResult: RecheckResult, pattern: string) {
        const complexityType = recheckResult.complexity?.type || 'unknown';
        const attackPattern = recheckResult.attack?.pattern || 'N/A';

        this._conversationHistory = [];
        // TODO: Design the LLM interaction
        // - What LLM model to use?
        // - Few-shot examples?
        // - System prompt design
        // Check out [Guided Learning in Gemini](https://blog.google/outreach-initiatives/education/guided-learning/) 
        //       and [Study and learn mode in OpenAI][https://openai.com/index/chatgpt-study-mode/]
        this._conversationHistory.push({
            role: 'system',
            content: `
You are Patchly, a specialized AI coding tutor. Your goal is to help a developer understand a ReDoS vulnerability that **you (Patchly) have just detected**. 
The user has just clicked on your warning, so they have very little context.

Your teaching method MUST be Socratic and guided:
1.  **Do NOT give the full answer upfront.** Your purpose is to make the developer *think* and discover the "why" themselves.
2.  **Start by asking an open-ended, guiding question** to probe their understanding of the pattern you've shown them.
3.  **Examples of good questions:** "Looking at the pattern \`...\`, what part of it looks like it could cause a lot of repetition?" or "What do you already know about how the \`+\` and \`*\` characters work in regex?"
4.  **Use the attack string as a *hint later on***, not at the beginning. (e.g., "You're on the right track! Now, what if someone gave us an input like this: \`${attackPattern}\`? What would the regex engine have to do?").
5.  **Always be encouraging, friendly, and supportive.** Assume the user is smart but just new to this specific topic.
        `
        });
        this._conversationHistory.push({
            role: 'assistant',
            content: `Hi there! I've detected a potential **${complexityType} ReDoS** vulnerability in your code.

It's in this regex pattern:\`${pattern}\`

I'm here to help you understand *why* it's a risk and how to fix it.

To get us started, what are your first thoughts when you look at that pattern? Or, we can start with a simpler question: **What part of that pattern looks the most 'repetitive' or 'complex' to you?**
`
        });

        await vscode.commands.executeCommand('patchly.chatView.focus');
        await new Promise(resolve => setTimeout(resolve, 100));

        if (this._view) {
            this._view.webview.postMessage({
                type: 'assistantMessage',
                message: this._conversationHistory[this._conversationHistory.length - 1].content
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
      
            const response = await chat(this._conversationHistory as AIMessage[], { model: 'gpt-4o-mini', temperature: 0.3 });
      
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

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Patchly Chat</title>
    <style>
        * {
            box-sizing: border-box;
        }

        body {
            padding: 0;
            margin: 0;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
        }

        #chat-container {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        #messages {
            flex: 1;
            overflow-y: auto;
            padding: 12px 8px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        /* Custom scrollbar styling */
        #messages::-webkit-scrollbar {
            width: 8px;
        }

        #messages::-webkit-scrollbar-track {
            background: var(--vscode-sideBar-background);
        }

        #messages::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 4px;
        }

        #messages::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }

        .message {
            max-width: 85%;
            padding: 10px 14px;
            border-radius: 12px;
            line-height: 1.6;
            word-wrap: break-word;
            white-space: pre-wrap;
            animation: fadeIn 0.3s ease-in;
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(5px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .user-message {
            align-self: flex-end;
            background-color: var(--vscode-inputValidation-infoBackground);
            border-right: 3px solid var(--vscode-button-background);
            margin-left: 8px;
            margin-right: 8px;
        }

        .assistant-message {
            align-self: flex-start;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-left: 3px solid var(--vscode-charts-blue);
            margin-left: 8px;
            margin-right: 8px;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
        }

        .assistant-message p {
            margin: 0.5em 0;
        }

        .assistant-message p:first-child {
            margin-top: 0;
        }

        .assistant-message p:last-child {
            margin-bottom: 0;
        }

        .assistant-message code {
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
        }

        .assistant-message strong {
            color: var(--vscode-textLink-foreground);
            font-weight: 600;
        }

        .typing-indicator {
            align-self: flex-start;
            padding: 12px 16px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            border-left: 3px solid var(--vscode-charts-blue);
            display: none;
            margin-left: 8px;
        }

        .typing-indicator.show {
            display: flex;
            align-items: center;
            gap: 4px;
            animation: fadeIn 0.2s ease-in;
        }

        .typing-indicator span {
            display: inline-block;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: var(--vscode-foreground);
            opacity: 0.4;
            animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) {
            animation-delay: 0.2s;
        }

        .typing-indicator span:nth-child(3) {
            animation-delay: 0.4s;
        }

        @keyframes typing {
            0%, 60%, 100% {
                opacity: 0.4;
                transform: scale(1);
            }
            30% {
                opacity: 1;
                transform: scale(1.2);
            }
        }

        #input-container {
            padding: 10px 12px;
            border-top: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-sideBar-background);
        }

        #input-box {
            display: flex;
            gap: 8px;
            align-items: flex-end;
        }

        #message-input {
            flex: 1;
            padding: 10px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            resize: none;
            min-height: 38px;
            max-height: 120px;
            line-height: 1.4;
            transition: border-color 0.2s ease;
        }

        #message-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 1px var(--vscode-focusBorder);
        }

        #message-input::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        #send-button {
            padding: 10px 18px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: var(--vscode-font-size);
            font-weight: 500;
            transition: background-color 0.2s ease, transform 0.1s ease;
            white-space: nowrap;
        }

        #send-button:hover:not(:disabled) {
            background-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }

        #send-button:active:not(:disabled) {
            transform: translateY(0);
        }

        #send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .welcome-message {
            padding: 30px 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            animation: fadeIn 0.5s ease-in;
        }

        .welcome-message h3 {
            margin-top: 0;
            margin-bottom: 12px;
            color: var(--vscode-foreground);
            font-size: 1.3em;
            font-weight: 600;
        }

        .welcome-message p {
            margin: 8px 0;
            line-height: 1.6;
        }

        .welcome-message .hint {
            font-size: 0.85em;
            margin-top: 20px;
            padding: 12px;
            background-color: var(--vscode-editor-background);
            border-left: 3px solid var(--vscode-charts-blue);
            border-radius: 4px;
            text-align: left;
        }
    </style>
</head>
<body>
    <div id="chat-container">
        <div id="messages">
            <div class="welcome-message">
                <h3>Learn About ReDoS</h3>
                <p>Ask me anything about Regular Expression Denial of Service vulnerabilities!</p>
                <div class="hint">
                    Click "Explain" from the hover menu to start with context about a specific issue.
                </div>
            </div>
        </div>
        <div class="typing-indicator" id="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
        </div>
        <div id="input-container">
            <div id="input-box">
                <textarea id="message-input" placeholder="Ask a question..." rows="1"></textarea>
                <button id="send-button">Send</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesContainer = document.getElementById('messages');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const typingIndicator = document.getElementById('typing-indicator');

        // Auto-resize textarea
        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = messageInput.scrollHeight + 'px';
        });

        // Send message on button click
        sendButton.addEventListener('click', sendMessage);

        // Send message on Ctrl/Cmd + Enter
        messageInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                sendMessage();
            }
        });

        function sendMessage() {
            const message = messageInput.value.trim();
            if (!message) return;

            // Send to extension
            vscode.postMessage({
                type: 'sendMessage',
                message: message
            });

            // Clear input
            messageInput.value = '';
            messageInput.style.height = 'auto';
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'userMessage':
                    addMessage(message.message, 'user');
                    break;
                case 'assistantMessage':
                    addMessage(message.message, 'assistant');
                    break;
                case 'typing':
                    if (message.isTyping) {
                        typingIndicator.classList.add('show');
                    } else {
                        typingIndicator.classList.remove('show');
                    }
                    break;
            }
        });

        // A disgust hack to parse basic markdown (code, bold, italics, headings, lists) into HTML. I am not proud.
        function parseMarkdown(text) {
            return text
                .replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>')
                .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
                .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
                .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
                .replace(/^#{3} (.+)$/gm, '<h3>$1</h3>')
                .replace(/^#{2} (.+)$/gm, '<h2>$1</h2>')
                .replace(/^#{1} (.+)$/gm, '<h1>$1</h1>')
                .replace(/^- (.+)$/gm, '<li>$1</li>')
                .replace(/(<li>.*<\\/li>)/s, '<ul>$1</ul>')
                .replace(/\\n\\n/g, '</p><p>')
                .replace(/^(.+)$/gm, function(match) {
                    if (!match.match(/<\\/?[a-z][^>]*>/i)) {
                        return '<p>' + match + '</p>';
                    }
                    return match;
                });
        }

        function addMessage(content, role) {
            const messageDiv = document.createElement('div');
            messageDiv.className = \`message \${role}-message\`;
            messageDiv.innerHTML = parseMarkdown(content);

            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    </script>
</body>
</html>`;
    }
}