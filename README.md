# Patchly

Patchly is an AI-powered VS Code extension that identifies and explains ReDoS vulnerabilities in JavaScript and TypeScript without interrupting the developer’s workflow. It applies human-centered design to make learning about security simple and engaging.

Patchly reveals information gradually based on your interest:

1. Passive Awareness: Subtle yellow underlines show vulnerable patterns
2. Quick Summary: Hover to see a brief explanation
3. Technical Details: View detailed diagnostics in the Problems panel
4. Choose The Next Step (lightbulb menu):

   1. Automatic Fix: Apply a suggested fix directly in your code
   2. Interactive Learning: A guided learning chat to learn more about the vulnerability
   3. Ignore: Dismiss the warning

The idea is to give developers full control. They decide how much info they want, no auto fixes or pop-ups getting in the way, and they can learn at their own speed.

## Configuration

Patchly can be configured with a `patchly.config` file in the root of your workspace.  
If the file does not exist, Patchly will create it on activation with default values.

Example:

```json
{
  "analyzeOnType": false
}
```

### Available settings

| Key             | Description                                                                                                                                                                                                        | Type    | Default | Possible values                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------- | -------------------------------------- |
| `analyzeOnType` | Controls when Patchly analyzes your code for vulnerabilities. If `true`, Patchly runs analysis on **typing** and on **save**. If `false`, Patchly only analyzes when you **save** the file. | boolean | `false`  | `true` (typing + save), `false` (save only) |


## Installation & Usage

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup.

## License

MIT
