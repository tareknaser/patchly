import * as vscode from 'vscode';

class PatchlyCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(doc: vscode.TextDocument) {
        return vscode.languages.getDiagnostics(doc.uri)
        .filter(d => d.source === 'Patchly')
        .map(d => new vscode.CodeLens(d.range, {
            title: '$(wrench) Patchly: Fix',
            command: 'patchly.suggestFix',
            arguments: [d.range.start, d.range.end, doc.uri]
        }));
    }
}

export { PatchlyCodeLensProvider };