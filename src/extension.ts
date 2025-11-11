import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import { ReDoSDetector, PatchlyDiagnostic } from './redosDetector';
import { PatchlyCodeActionProvider } from './codeActions';
import { ChatViewProvider } from './chatViewProvider';
import { PatchlyHoverProvider } from './hoverProvider';
import { PatchlyCodeLensProvider } from './codeLensProvider';
import { configManager } from './configManager';
import { IgnoreHandler } from './ignoreHandler';

dotenv.config({ path: `${__dirname}/../.env` }); 

let diagnosticCollection: vscode.DiagnosticCollection;
let chatViewProvider: ChatViewProvider;

const ignoreHandler = new IgnoreHandler();

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
    let timer: NodeJS.Timeout | undefined;

    return (...args: Parameters<T>) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(() => fn(...args), delay);
    };
}

function analyzeDocument(document: vscode.TextDocument) {
    if (document.languageId !== 'javascript' && document.languageId !== 'typescript') {
        return;
    }
    const detector = new ReDoSDetector();
    const vulnerabilities = detector.detectVulnerabilities(document.getText(), document);
    diagnosticCollection.set(document.uri, vulnerabilities);
}

const debouncedAnalyzeDocument = debounce(analyzeDocument, 1000);

export function activate(context: vscode.ExtensionContext) {
    // Register configuration manager
    configManager.init(context);

    // Register chat view
    chatViewProvider = new ChatViewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider)
    );

    // Register hover provider
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            [{language:'javascript'},{language:'typescript'},{language:'javascriptreact'},{language:'typescriptreact'}],
            new PatchlyHoverProvider()
        )
    );

    // Register code lens provider
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            [{ language: 'javascript' }, { language: 'typescript' },
            { language: 'javascriptreact' }, { language: 'typescriptreact' }],
            new PatchlyCodeLensProvider()
        )
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
    
    // Register Analyzers
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) analyzeDocument(editor.document);
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            if (!configManager.analyzeOnType) {
                console.log('Analyze on type is disabled; skipping analysis.');
                return;
            }
            if (event.document === vscode.window.activeTextEditor?.document) {
                debouncedAnalyzeDocument(event.document);
            }
        }),
        vscode.workspace.onDidSaveTextDocument(document => {
            analyzeDocument(document);
        })
    );

    // TODO: LLM-powered fix generation
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'patchly.suggestFix',
            async (start: vscode.Position, end: vscode.Position, documentURI: string) => {
                if (!start || !end || !documentURI) {
                    vscode.window.showErrorMessage('No vulnerability info available');
                    return;
                }
    
                const uri = vscode.Uri.parse(documentURI);
                const document = await vscode.workspace.openTextDocument(uri);
                const range = new vscode.Range(start, end);
                const originalText = document.getText(range);
    
                // TODO: Call AI to get the fixed pattern instead of dummyFix
                const dummyFix = {
                    fixedPattern: '/^a+$/',
                };
    
                // Build a preview with before/after
                const previewDetail = `${dummyFix.fixedPattern}`;
    
                const picks: vscode.QuickPickItem[] = [
                    {
                        label: 'Apply fix',
                        detail: previewDetail,
                    },
                    {
                        label: 'Cancel',
                    },
                ];
    
                const choice = await vscode.window.showQuickPick(picks, {
                    placeHolder: 'Patchly suggested fix',
                    ignoreFocusOut: true, // stays open if user clicks in editor
                    matchOnDetail: false,
                });
    
                if (!choice || choice.label !== 'Apply fix') {
                    // User cancelled or closed the picker
                    return;
                }
    
                const edit = new vscode.WorkspaceEdit();
                edit.replace(uri, range, dummyFix.fixedPattern);
    
                const success = await vscode.workspace.applyEdit(edit);
                if (!success) {
                    vscode.window.showErrorMessage('Could not apply fix');
                } else {
                    vscode.window.showInformationMessage('Patchly applied the suggested fix.');
                }
            }
        )
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

    context.subscriptions.push(
        vscode.commands.registerCommand('patchly.ignoreWarning', async (startLine: number, documentURI: string) => {
            if (startLine === undefined || startLine === null || !documentURI) {
                vscode.window.showErrorMessage(`Could not ignore warning ${startLine}, ${documentURI}`);
                return;
            }
            try {
                const uri = vscode.Uri.parse(documentURI);
                const document = await vscode.workspace.openTextDocument(uri);
                const success = await ignoreHandler.ignoreNextLine(document, startLine);

                if (!success) {
                    vscode.window.showErrorMessage('Could not ignore warning');
                }
            } catch (error) {
                vscode.window.showErrorMessage('Could not ignore warning');
            }
        })
    );
}

export function deactivate() {
    if (diagnosticCollection) {
        diagnosticCollection.dispose();
    }
}
