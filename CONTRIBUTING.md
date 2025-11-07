```bash
npm install
npm compile

# Add your OpenAI API key
# Edit src/chatViewProvider.ts

# Package and install
npm install -g @vscode/vsce


vsce package
# I am using VS Code Insiders (the pre-release version of VS Code) so to avoid
# messing with my main VS Code setup. You can replace `code-insiders` with `code` if you use
# the stable version of VS Code.
code-insiders --install-extension patchly-0.0.1.vsix
```
