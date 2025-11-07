import * as vscode from 'vscode';
import { RecheckWrapper, RecheckResult } from './recheckWrapper';

export interface PatchlyDiagnostic extends vscode.Diagnostic {
    recheckResult?: RecheckResult;
}

export class ReDoSDetector {
    private recheckWrapper: RecheckWrapper;

    constructor() {
        this.recheckWrapper = new RecheckWrapper();
    }

    detectVulnerabilities(text: string, document: vscode.TextDocument): PatchlyDiagnostic[] {
        const diagnostics: PatchlyDiagnostic[] = [];
        const regexPattern = /\/(?![*\/])(.+?)(?<!\\)\/([gimsuvy]*)/g;

        let match;
        while ((match = regexPattern.exec(text)) !== null) {
            const regexContent = match[1];
            const flags = match[2] || '';
            const recheckResult = this.recheckWrapper.checkPattern(regexContent, flags);

            if (recheckResult.status === 'vulnerable') {
                const startPos = document.positionAt(match.index);
                const endPos = document.positionAt(match.index + match[0].length);
                const range = new vscode.Range(startPos, endPos);
                const summary = this.recheckWrapper.generateSummary(recheckResult);

                const diagnostic: PatchlyDiagnostic = new vscode.Diagnostic(
                    range,
                    summary,
                    vscode.DiagnosticSeverity.Warning
                );

                diagnostic.source = 'Patchly';
                diagnostic.code = 'redos-vulnerability';

                const complexityType = recheckResult.complexity?.type || 'unknown';
                const attackString = recheckResult.attack?.pattern || 'N/A';
                const detailedInfo = `Pattern: ${recheckResult.pattern}
Complexity: ${complexityType}
Attack String: ${attackString}`;

                diagnostic.relatedInformation = [
                    new vscode.DiagnosticRelatedInformation(
                        new vscode.Location(document.uri, range),
                        detailedInfo
                    )
                ];

                diagnostic.recheckResult = recheckResult;
                diagnostics.push(diagnostic);
            }
        }

        return diagnostics;
    }
}
