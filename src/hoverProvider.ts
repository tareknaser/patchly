import * as vscode from 'vscode';
import { PatchlyDiagnostic } from './redosDetector';

export class PatchlyHoverProvider implements vscode.HoverProvider {
  provideHover(doc: vscode.TextDocument, pos: vscode.Position): vscode.ProviderResult<vscode.Hover> {
    const diags = vscode.languages.getDiagnostics(doc.uri)
      .filter(d => d.range.contains(pos) && d.source === 'Patchly') as PatchlyDiagnostic[];
    if (!diags.length) return;

    const d = diags[0];
    const r = d.recheckResult;
    const pattern = r?.pattern ?? doc.getText(d.range);
    const complexity = r?.complexity?.type ?? 'unknown';
    const attack = r?.attack?.pattern ?? 'N/A';

    // command links
    const argsFix = encodeURIComponent(JSON.stringify([d.range.start, d.range.end, doc.uri, complexity, attack, pattern]));
    const argsExplain = encodeURIComponent(JSON.stringify([complexity, pattern, attack]));
    const argsIgnoreNext = encodeURIComponent(JSON.stringify([d.range.start.line, doc.uri]));

    const md = new vscode.MarkdownString();
    md.isTrusted = true; // enables command links

    md.appendMarkdown(
`
**Why**: ${complexity} backtracking detected.

**Regex**  
\`\`\`js
/${pattern}/
\`\`\`

**Worst-case input**  
\`\`\`
${attack}
\`\`\`

[Fix](command:patchly.suggestFix?${argsFix}) | [Explain](command:patchly.learnMore?${argsExplain}) | [Ignore](command:patchly.ignoreWarning?${argsIgnoreNext})
`);
    return new vscode.Hover(md, d.range);
  }
}
