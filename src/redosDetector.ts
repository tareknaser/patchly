import * as vscode from 'vscode';
import { RecheckWrapper, RecheckResult } from './recheckWrapper';
import { IgnoreHandler } from './ignoreHandler'

export interface PatchlyDiagnostic extends vscode.Diagnostic {
    recheckResult?: RecheckResult;
}

const RULE_TOKEN = 'redos'

export class ReDoSDetector {
    private recheckWrapper: RecheckWrapper;
    private ignoreHandler: IgnoreHandler;

    constructor() {
        this.recheckWrapper = new RecheckWrapper();
        this.ignoreHandler = new IgnoreHandler();
    }

    detectVulnerabilities(text: string, document: vscode.TextDocument): PatchlyDiagnostic[] {
        const diagnostics: PatchlyDiagnostic[] = [];
        const regexPattern = /\/(?![*\/])(.+?)(?<!\\)\/([gimsuvy]*)/g;
      
        const ignoreState = this.ignoreHandler.parse(document, RULE_TOKEN);
      
        let match: RegExpExecArray | null;
        while ((match = regexPattern.exec(text)) !== null) {
          const range = new vscode.Range(
            document.positionAt(match.index),
            document.positionAt(match.index + match[0].length)
          );

          if (this.ignoreHandler.isIgnored(range, document, ignoreState)) continue;
      
          const regexContent = match[1];
          const flags = match[2] || '';
          const recheckResult = this.recheckWrapper.checkPattern(regexContent, flags);
      
          if (recheckResult.status === 'vulnerable') {
            const summary = this.recheckWrapper.generateSummary(recheckResult);
            const diagnostic: PatchlyDiagnostic = new vscode.Diagnostic(
              range, summary, vscode.DiagnosticSeverity.Warning
            );
            diagnostic.source = 'Patchly';
            diagnostic.code = RULE_TOKEN;
      
            const complexityType = recheckResult.complexity?.type || 'unknown';
            const attackString = recheckResult.attack?.pattern || 'N/A';
      
            diagnostic.recheckResult = recheckResult;
            diagnostics.push(diagnostic);
          }
        }
      
        return diagnostics;
      }
}
