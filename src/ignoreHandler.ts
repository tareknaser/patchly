import * as vscode from 'vscode';

export type RuleId = 'redos';

export interface IgnoreState {
  /** Exact lines to ignore (0 based) */
  disabledLines: Set<number>;
  /** Lines for which the NEXT line should be ignored */
  disabledNextLines: Set<number>;
  /** Ranges (code blocks) to ignore */
  disabledBlocks: vscode.Range[];
}

const DEFAULT_RULE: RuleId = 'redos';

const LINE_IGNORE_REGEX = /\/\/\s*patchly-ignore-line(?:\s+([^\s]+))?/;
const DISABLE_NEXT_REGEX = /\/\/\s*patchly-disable-next-line(?:\s+([^\s]+))?/;
const BLOCK_DISABLE_OPEN_REGEX = /\/\*\s*patchly-disable(?:\s+([^\s]+))?\s*\*\//;
const BLOCK_DISABLE_CLOSE_REGEX = /\/\*\s*patchly-enable(?:\s+([^\s]+))?\s*\*\//;

export class IgnoreHandler {
  private cache = new Map<string, { version: number; state: IgnoreState }>();

  parse(document: vscode.TextDocument, rule: RuleId = DEFAULT_RULE): IgnoreState {
    const key = document.uri.toString();
    const cached = this.cache.get(key);
    console.log(key, cached)
    if (cached && cached.version === document.version) return cached.state;

    const text = document.getText();

    const disabledLines = new Set<number>();
    const disabledNextLines = new Set<number>();
    const disabledBlocks: vscode.Range[] = [];

    // Line based
    for (let line = 0; line < document.lineCount; line++) {
      const s = document.lineAt(line).text;

      const m1 = s.match(LINE_IGNORE_REGEX);
      if (m1 && (!m1[1] || m1[1] === rule)) disabledLines.add(line);

      const m2 = s.match(DISABLE_NEXT_REGEX);
      if (m2 && (!m2[1] || m2[1] === rule)) disabledNextLines.add(line);
    }

    // Block based
    const token = new RegExp(`${BLOCK_DISABLE_OPEN_REGEX.source}|${BLOCK_DISABLE_CLOSE_REGEX.source}`, 'g');
    const stack: { idx: number; rule?: string }[] = [];
    let m: RegExpExecArray | null;

    while ((m = token.exec(text)) !== null) {
      const raw = m[0];
      const openMatch = raw.match(BLOCK_DISABLE_OPEN_REGEX);
      const closeMatch = raw.match(BLOCK_DISABLE_CLOSE_REGEX);

      if (openMatch) {
        // Start of disabled region is right AFTER the open token
        stack.push({ idx: m.index + raw.length, rule: openMatch[1] });
      } else if (closeMatch) {
        const closeRule = closeMatch[1];
        // Find nearest open
        for (let i = stack.length - 1; i >= 0; i--) {
          const open = stack[i];
          const openMatches = !open.rule || open.rule === rule;
          const closeMatches = !closeRule || closeRule === rule;
          if (openMatches && closeMatches) {
            stack.splice(i, 1);
            const start = document.positionAt(open.idx);
            const end = document.positionAt(m.index);
            if (end.isAfterOrEqual(start)) disabledBlocks.push(new vscode.Range(start, end));
            break;
          }
        }
      }
    }

    const state: IgnoreState = { disabledLines, disabledNextLines, disabledBlocks };
    this.cache.set(key, { version: document.version, state });
    return state;
  }

  isIgnored(range: vscode.Range, document: vscode.TextDocument, state: IgnoreState): boolean {
    const line = range.start.line;

    // Ignore exact line
    if (state.disabledLines.has(line)) return true;

    // Ignore next line
    if (state.disabledNextLines.has(line - 1)) return true;

    // Any overlap with a disabled block
    for (const r of state.disabledBlocks) {
      if (range.intersection(r)) return true;
    }
    return false;
  }

  async ignoreNextLine(document: vscode.TextDocument, startLine: number, rule: RuleId = DEFAULT_RULE): Promise<boolean> {
    if (startLine < 0 || startLine > document.lineCount) {
      return false;
    }

    const uri = document.uri;
    const lineStart = new vscode.Position(startLine, 0);
    const comment = `//patchly-disable-next-line ${rule}\n`;

    const edit = new vscode.WorkspaceEdit();
    edit.insert(uri, lineStart, comment);

    const success = await vscode.workspace.applyEdit(edit);
    if (success) {
      this.clear(document);
    }
    return success;
  }

  clear(document?: vscode.TextDocument) {
    if (!document) this.cache.clear();
    else this.cache.delete(document.uri.toString());
  }
}
