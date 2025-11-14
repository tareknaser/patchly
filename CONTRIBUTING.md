```bash
npm install
npm run compile

# Add your OpenAI API key
# copy .env.example to your root directory and rename it .env
# Add your API key to the .env file

# Package and install
npm install -g @vscode/vsce


vsce package
# I am using VS Code Insiders (the pre-release version of VS Code) so to avoid
# messing with my main VS Code setup. You can replace `code-insiders` with `code` if you use
# the stable version of VS Code.
code-insiders --install-extension patchly-0.0.1.vsix
```
