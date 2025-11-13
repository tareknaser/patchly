const vscode = acquireVsCodeApi();

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send');
const typingEl = document.getElementById('typing');

/* ---------- Input UX ---------- */

// Auto-resize textarea
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = inputEl.scrollHeight + 'px';
});

// Submit on Enter, newline on Shift+Enter
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

function sendMessage() {
  const message = inputEl.value.trim();
  if (!message) return;

  vscode.postMessage({ type: 'sendMessage', message });
  inputEl.value = '';
  inputEl.style.height = 'auto';
}

/* ---------- VS Code <-> Webview bridge ---------- */

window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'userMessage':
      renderMessage(msg.message, 'user');
      break;
    case 'assistantMessage':
      renderMessage(msg.message, 'assistant');
      break;
    case 'typing':
      typingEl.classList.toggle('show', !!msg.isTyping);
      typingEl.setAttribute('aria-hidden', (!msg.isTyping).toString());
      break;
  }
});

/* ---------- Markdown-ish rendering ---------- */

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
}

// Basic parser: fenced blocks (```lang\ncode```), inline code, headings, bold/italic,
// simple lists, paragraphs with <br> for single newlines.
function renderMarkdown(src) {
  let text = src;

  // Fenced code blocks
  text = text.replace(/```([a-zA-Z0-9_+\-]*)\n([\s\S]*?)```/g, (m, lang, code) => {
    const language = (lang || '').trim().toLowerCase() || 'plain';
    const safe = escapeHtml(code);
    return `<pre class="codeblock" data-lang="${language}"><code class="lang-${language}">${safe}</code></pre>`;
  });

  // Inline code
  text = text.replace(/`([^`]+)`/g, (m, code) => `<code>${escapeHtml(code)}</code>`);

  // Headings + emphasis
  text = text
    .replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s+(.+)$/gm,    '<h1>$1</h1>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g,     '<em>$1</em>');

  // Lists: consecutive "- item" lines → <ul>
  text = text.replace(/(?:^|\n)(- .+(?:\n- .+)*)/g, (m, block) => {
    const items = block
      .trim()
      .split(/\n/)
      .map(line => line.replace(/^- +/, ''))
      .map(li => `<li>${li}</li>`)
      .join('');
    return `\n<ul>${items}</ul>`;
  });

  // Paragraphs: split on double newlines; transform single newlines to <br>
  text = text
    .split(/\n{2,}/)
    .map(chunk => (/^\s*<(h\d|ul|ol|pre|blockquote|table|p)\b/i.test(chunk)
        ? chunk
        : `<p>${chunk.replace(/\n/g, '<br>')}</p>`))
    .join('\n');

  return text;
}

/* ---------- Enhancements: Copy button on code blocks ---------- */

function enhanceCodeBlocks(container) {
  const pres = container.querySelectorAll('pre.codeblock');
  pres.forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.textContent = 'Copy';
    btn.className = 'copy-btn';
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code')?.innerText || '';
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      } catch {
        btn.textContent = 'Failed';
        setTimeout(() => (btn.textContent = 'Copy'), 1200);
      }
    });
    pre.appendChild(btn);
  });
}

/* ---------- Render helpers ---------- */

function renderMessage(content, role) {
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;
  wrapper.innerHTML = renderMarkdown(content);

  messagesEl.appendChild(wrapper);
  enhanceCodeBlocks(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
