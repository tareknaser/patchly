import * as vscode from 'vscode';
import { ReDoSDetector, PatchlyDiagnostic } from './redosDetector';
import { PatchlyCodeActionProvider } from './codeActions';
import { ChatViewProvider } from './chatViewProvider';

let diagnosticCollection: vscode.DiagnosticCollection;
let chatViewProvider: ChatViewProvider;

export function activate(context: vscode.ExtensionContext) {
    chatViewProvider = new ChatViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider)
    );

    diagnosticCollection = vscode.languages.createDiagnosticCollection('patchly');
    context.subscriptions.push(diagnosticCollection);

    const codeActionProvider = new PatchlyCodeActionProvider();
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            { language: 'javascript', scheme: 'file' },
            codeActionProvider,
            { providedCodeActionKinds: PatchlyCodeActionProvider.providedCodeActionKinds }
        ),
        vscode.languages.registerCodeActionsProvider(
            { language: 'typescript', scheme: 'file' },
            codeActionProvider,
            { providedCodeActionKinds: PatchlyCodeActionProvider.providedCodeActionKinds }
        )
    );

    if (vscode.window.activeTextEditor) {
        analyzeDocument(vscode.window.activeTextEditor.document);
    }

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) analyzeDocument(editor.document);
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document === vscode.window.activeTextEditor?.document) {
                analyzeDocument(event.document);
            }
        }),
        vscode.workspace.onDidSaveTextDocument(document => {
            analyzeDocument(document);
        })
    );

    // TODO: LLM-powered fix generation
    context.subscriptions.push(
        vscode.commands.registerCommand('patchly.suggestFix', async (diagnostic: PatchlyDiagnostic, document: vscode.TextDocument) => {
            if (!diagnostic.recheckResult) {
                vscode.window.showErrorMessage('No vulnerability info available');
                return;
            }

            const dummyFix = {
                explanation: "This pattern has nested quantifiers causing exponential backtracking.",
                fixedPattern: "/^a+$/",
                comment: "// Fixed: Removed nested quantifier"
            };

            const edit = new vscode.WorkspaceEdit();
            const lineStart = new vscode.Position(diagnostic.range.start.line, 0);
            edit.insert(document.uri, lineStart, `${dummyFix.comment}\n`);
            edit.replace(document.uri, diagnostic.range, dummyFix.fixedPattern);

            const success = await vscode.workspace.applyEdit(edit);
            if (success) {
                vscode.window.showInformationMessage(`Fixed! ${dummyFix.explanation}`);
            } else {
                vscode.window.showErrorMessage('Could not apply fix');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('patchly.learnMore', (diagnostic: PatchlyDiagnostic) => {
            if (!diagnostic.recheckResult) {
                vscode.window.showErrorMessage('No vulnerability info available');
                return;
            }

            chatViewProvider.startConversation(diagnostic.recheckResult, diagnostic.recheckResult.pattern);
        })
    );

    // TODO: Implement ignore warning functionality
    context.subscriptions.push(
        vscode.commands.registerCommand('patchly.ignoreWarning', async () => {
            vscode.window.showInformationMessage('Ignore feature not implemented yet');
        })
    );
}

function analyzeDocument(document: vscode.TextDocument) {
    if (document.languageId !== 'javascript' && document.languageId !== 'typescript') {
        return;
    }

    const detector = new ReDoSDetector();
    const vulnerabilities = detector.detectVulnerabilities(document.getText(), document);
    diagnosticCollection.set(document.uri, vulnerabilities);
}

export function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
}
