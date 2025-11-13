import * as vscode from 'vscode';

export interface PatchlyConfig {
    analyzeOnType: boolean;
}

export class ConfigManager {
    private static _instance: ConfigManager | undefined;
    private _config: PatchlyConfig = {
        analyzeOnType: false, // default behavior
    };

    private watcher: vscode.FileSystemWatcher | undefined;

    private constructor() {}

    static get instance(): ConfigManager {
        if (!this._instance) {
            this._instance = new ConfigManager();
        }
        return this._instance;
    }

    /**
     * Load configuration from patchly.config file.
     * If the file does not exist, create it with default values.
     */
    private async loadConfig(uri?: vscode.Uri): Promise<void> {
        let configUri: vscode.Uri | undefined;

        try {
            if (uri) {
                // Called from watcher: we know exactly which file changed
                configUri = uri;
            } else {
                // Initial load: try first workspace folder if there is one
                const folders = vscode.workspace.workspaceFolders;
                if (!folders || folders.length === 0) {
                    this._config = { analyzeOnType: false };
                    return;
                }
                configUri = vscode.Uri.joinPath(folders[0].uri, 'patchly.config');
            }

            const fileData = await vscode.workspace.fs.readFile(configUri);
            const text = Buffer.from(fileData).toString('utf8');

            const parsed = JSON.parse(text);

            const nextConfig: PatchlyConfig = {
                analyzeOnType:
                    typeof parsed.analyzeOnType === 'boolean'
                        ? parsed.analyzeOnType
                        : false,
            };

            this._config = nextConfig;
        } catch (err: any) {
            const msg = String(err ?? '');
            const code = (err as any)?.code;

            // File not found → create it with defaults
            if (code === 'FileNotFound' || msg.includes('ENOENT')) {
                this._config = { analyzeOnType: false };

                try {
                    // If we somehow have no URI yet, try to derive one from the first workspace folder
                    if (!configUri) {
                        const folders = vscode.workspace.workspaceFolders;
                        if (!folders || folders.length === 0) {
                            return;
                        }
                        configUri = vscode.Uri.joinPath(folders[0].uri, 'patchly.config');
                    }

                    const content = JSON.stringify(this._config, null, 2) + '\n';
                    const bytes = Buffer.from(content, 'utf8');
                    await vscode.workspace.fs.writeFile(configUri, bytes);
                } catch (writeErr: any) {}

                return;
            }

            // Other errors → fallback to defaults, but don't try to recreate file

            this._config = { analyzeOnType: false };
        }
    }

    /**
     * Initialize config manager: load config + watch for changes.
     */
    init(context: vscode.ExtensionContext) {

        // Initial best-effort load (no URI yet)
        void this.loadConfig();

        // Watch ANY patchly.config in the environment
        this.watcher = vscode.workspace.createFileSystemWatcher('**/patchly.config');

        this.watcher.onDidChange(uri => {
            void this.loadConfig(uri);
        });

        this.watcher.onDidCreate(uri => {
            void this.loadConfig(uri);
        });

        this.watcher.onDidDelete(uri => {
            this._config = { analyzeOnType: false };
        });

        context.subscriptions.push(this.watcher);
    }

    /**
     * Current config snapshot
     */
    get config(): PatchlyConfig {
        return this._config;
    }

    /**
     * Convenience getter for the analyzeOnType flag
     */
    get analyzeOnType(): boolean {
        return this._config.analyzeOnType;
    }
}

export const configManager = ConfigManager.instance;
