import * as vscode from 'vscode';
import { getOpenAIClient } from './aiProvider';
import { RecheckWrapper, RecheckResult } from './recheckWrapper';

type FixResult = { fixedPattern: string };

export class FixGenerator {
  private fixCache = new Map<string, FixResult>();
  private recheckWrapper: RecheckWrapper;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.recheckWrapper = new RecheckWrapper();
  }

  /** Register the Patchly "suggest fix" command. */
  register() {
    const disposable = vscode.commands.registerCommand(
      'patchly.suggestFix',
      this.handleSuggestFix.bind(this)
    );
    this.context.subscriptions.push(disposable);
  }

  private async handleSuggestFix(start: vscode.Position, end: vscode.Position, documentURI: string) {
    const uri = vscode.Uri.parse(documentURI);
    await this.focusDocAndDismissHover(uri, start);

    const document = await vscode.workspace.openTextDocument(uri);
    const range = new vscode.Range(start, end);
    const originalText = document.getText(range);

    const recheck = this.recheckWrapper.checkPattern(originalText);
    const riskHint = this.formatRiskForPrompt(recheck);

    const controller = new AbortController();
    const fix = await vscode.window.withProgress<FixResult | null>({
      location: vscode.ProgressLocation.Notification,
      title: 'Patchly',
      cancellable: true
    }, async (_progress, token) => {
      token.onCancellationRequested(() => controller.abort());
      try {
        return await this.getFix(originalText, controller.signal, riskHint);
      } catch (e: any) {
        if (e?.name === 'AbortError') return null;
        throw e;
      }
    });

    if (!fix?.fixedPattern) return;

    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, range, fix.fixedPattern, {
      label: 'Patchly: Apply suggested fix',
      description: fix.fixedPattern,
      needsConfirmation: false
    });
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) vscode.window.showErrorMessage('Could not apply suggested fix.');
  }

  /**
   * One-shot JSON call (no timeout), with caching and "must-differ" guard.
   * - Adds riskHint (complexity + worst-case input).
   * - Enforces JSON output.
   * - If unchanged or invalid, hardens deterministically and forces a diff.
   * - Always rechecks safety.
   */
  private async getFix(originalText: string, signal?: AbortSignal, riskHint?: string): Promise<FixResult> {
    // Reuse only if we previously produced a *changed* fix for this exact input
    const cached = this.fixCache.get(originalText);
    if (cached && !this.sameRegexLiterals(cached.fixedPattern, originalText)) return cached;

    const client = getOpenAIClient();
    if (!client) return { fixedPattern: originalText || '/^$/' };

    const originalLiteral = this.asLiteral(originalText); // guarantees "/.../flags"
    const sys =
      'You are Patchly. Output ONLY JSON: {"fixedPattern":"..."} for a JS regex literal (/.../flags) that avoids catastrophic backtracking. ' +
      'No prose, no fences. Do NOT return the original literal. Do NOT use atomic groups or possessive quantifiers.';
    const user =
      `Vulnerable regex (JS literal): ${originalLiteral}\n` +
      (riskHint ? `Risk: ${riskHint.replace(/```/g, '')}\n` : '') +
      `Return exactly: {"fixedPattern":"..."} (no extra text).`;

    const resp: any = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.1,
      max_tokens: 96,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user }
      ]
    }, { signal });

    let text = resp?.choices?.[0]?.message?.content ?? '';

    let out: FixResult | null = null;
    try { out = JSON.parse(text) as FixResult; }
    catch {
      const m = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
      try { out = JSON.parse(m) as FixResult; } catch { /* ignore */ }
    }

    let fixed = out?.fixedPattern || '';
    if (!fixed) fixed = this.hardenLiteral(originalLiteral);

    if (!/^\/.*\/[a-z]*$/i.test(fixed)) fixed = this.wrapAsLiteral(fixed);

    fixed = this.hardenLiteral(fixed);

    if (this.sameRegexLiterals(fixed, originalLiteral)) {
      fixed = this.enforceMustDiffer(fixed);
    }

    try {
      const rc = this.recheckWrapper.checkPattern(fixed);
      if ((rc as any)?.status && (rc as any).status !== 'safe') {
        fixed = this.enforceMustDiffer(this.hardenLiteral(originalLiteral));
      }
    } catch {
      // ignore checker errors
    }

    const result = { fixedPattern: fixed };
    if (!this.sameRegexLiterals(fixed, originalLiteral)) {
      this.fixCache.set(originalText, result);
    }
    return result;
  }

  private formatRiskForPrompt(r: RecheckResult | undefined): string {
    if (!r) return '';
    const complexity = r?.complexity?.type ?? 'unknown';
    const attack = r?.attack?.pattern;
    let out = `Complexity=${complexity}`;
    if (attack && String(attack).trim().length) {
      out += `; WorstCase="${String(attack).trim()}"`;
    }
    return out;
  }

  private asLiteral(text: string): string {
    const t = text.trim();
    if (/^\/.*\/[a-z]*$/i.test(t)) return t;
    return this.wrapAsLiteral(t);
  }

  private sameRegexLiterals(a: string, b: string): boolean {
    const pa = this.splitLiteral(this.asLiteral(a));
    const pb = this.splitLiteral(this.asLiteral(b));
    return pa.body === pb.body && pa.flags === pb.flags;
  }

  private splitLiteral(lit: string): { body: string; flags: string } {
    const m = lit.match(/^\/([\s\S]*)\/([a-z]*)$/i);
    const body = (m ? m[1] : lit).replace(/\s+/g, '');
    const flags = (m ? m[2] : '').split('').sort().join('');
    return { body, flags };
  }

  private hardenLiteral(lit: string): string {
    const { body: rawBody, flags } = this.splitLiteral(lit);
    let body = rawBody;

    // ensure anchors
    if (!body.startsWith('^')) body = '^' + body;
    if (!body.endsWith('$')) body = body + '$';

    // tame wildcards (common ReDoS culprits)
    body = body.replace(/\.\+/g, '[^\\n]+').replace(/\.\*/g, '[^\\n]*');

    // prefer non-global for single-spot fixes
    const newFlags = flags.replace(/g/i, '');

    return `/${body}/${newFlags}`;
  }

  /**
   * Force a syntactic difference without semantic drift:
   * wrap ONLY the inner (between ^ and $) with a non-capturing group.
   */
  private enforceMustDiffer(lit: string): string {
    const { body, flags } = this.splitLiteral(lit);

    const hasStart = body.startsWith('^');
    const hasEnd = body.endsWith('$');
    const inner = body.slice(hasStart ? 1 : 0, hasEnd ? -1 : body.length);

    const wrappedInner = `(?:${inner})`;
    const rebuilt =
      (hasStart ? '^' : '') +
      wrappedInner +
      (hasEnd ? '$' : '');

    return `/${rebuilt}/${flags}`;
  }

  private wrapAsLiteral(bodyOrLiteral: string): string {
    if (/^\/.*\/[a-z]*$/i.test(bodyOrLiteral)) return bodyOrLiteral;
    return `/${bodyOrLiteral.replace(/\//g, '\\/')}/`;
  }

  private async focusDocAndDismissHover(uri: vscode.Uri, cursor: vscode.Position) {
    try {
      const editor = await vscode.window.showTextDocument(uri, {
        preserveFocus: false,
        preview: true,
        viewColumn: vscode.ViewColumn.Active,
      });
      editor.selection = new vscode.Selection(cursor, cursor);
      editor.revealRange(new vscode.Range(cursor, cursor), vscode.TextEditorRevealType.InCenterIfOutsideViewport);

      // Try a few times in case UI timing is racy
      for (let i = 0; i < 3; i++) {
        try { await vscode.commands.executeCommand('editor.action.hideHover'); } catch {}
        try { await vscode.commands.executeCommand('cursorMove', { to: 'right', by: 'character', value: 1 }); } catch {}
        try { await vscode.commands.executeCommand('cursorMove', { to: 'left',  by: 'character', value: 1 }); } catch {}
        await new Promise(res => setTimeout(res, 20));
      }
    } catch {
      // ignore focus errors
    }
  }
}
