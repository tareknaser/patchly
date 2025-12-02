import * as vscode from 'vscode';
import { PatchlyDiagnostic } from './redosDetector';

export class PatchlyCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

    provideCodeActions(
        document: vscode.TextDocument,
        _range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext
    ): vscode.CodeAction[] | undefined {
        const patchlyDiagnostics = context.diagnostics.filter(
            d => d.source === 'Patchly'
        ) as PatchlyDiagnostic[];

        if (patchlyDiagnostics.length === 0) {
            return undefined;
        }

        const actions: vscode.CodeAction[] = [];
        for (const diagnostic of patchlyDiagnostics) {
            actions.push(
                this.createFixAction(diagnostic, document),
                this.createLearnAction(diagnostic),
                this.createIgnoreAction(diagnostic, document)
            );
        }

        return actions;
    }

    private createFixAction(diagnostic: PatchlyDiagnostic, document: vscode.TextDocument): vscode.CodeAction {
        const action = new vscode.CodeAction('Patchly: Fix', vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'patchly.suggestFix',
            title: 'Suggest Fix',
            arguments: [diagnostic.range.start, diagnostic.range.end, document.uri, diagnostic.recheckResult?.complexity, diagnostic.recheckResult?.attack, diagnostic.recheckResult?.pattern]
        };
        action.diagnostics = [diagnostic];
        return action;
    }

    private createLearnAction(diagnostic: PatchlyDiagnostic): vscode.CodeAction {
        const action = new vscode.CodeAction('Patchly: Explain', vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'patchly.learnMore',
            title: 'Learn More',
            arguments: [diagnostic.recheckResult?.complexity, diagnostic.recheckResult?.pattern, diagnostic.recheckResult?.attack]
        };
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        return action;
    }

    private createIgnoreAction(diagnostic: PatchlyDiagnostic, document: vscode.TextDocument): vscode.CodeAction {
        const action = new vscode.CodeAction('Patchly: Ignore', vscode.CodeActionKind.QuickFix);
        action.command = {
            command: 'patchly.ignoreWarning',
            title: 'Ignore Warning',
            arguments: [diagnostic.range.start.line, document.uri]
        };
        action.diagnostics = [diagnostic];
        return action;
    }
}
