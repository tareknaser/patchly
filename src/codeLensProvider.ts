import * as vscode from 'vscode';
import { PatchlyDiagnostic } from './redosDetector';

class PatchlyCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(
      doc: vscode.TextDocument,
      _token: vscode.CancellationToken
    ): vscode.CodeLens[] {
      const patchlyDiagnostics = vscode.languages
        .getDiagnostics(doc.uri)
        .filter(d => d.source === 'Patchly') as PatchlyDiagnostic[];
  
      return patchlyDiagnostics.map(diagnostic => 
        new vscode.CodeLens(diagnostic.range, {
          title: '$(wrench) Patchly: Fix',
          command: 'patchly.suggestFix',
          arguments: [
            diagnostic.range.start,
            diagnostic.range.end,
            doc.uri.toString(),
            diagnostic.recheckResult?.complexity,
            diagnostic.recheckResult?.attack,
            diagnostic.recheckResult?.pattern
          ]
        })
      );
    }
  }

export { PatchlyCodeLensProvider };