import * as vscode from 'vscode';
import OpenAI from 'openai';

/**
 * Minimal Message shape compatible with OpenAI
 */

export type AIMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

export type ChatOptions = {
    model?: string;         // default gpt-4.1
    temperature?: number;   // default 0.3
    maxTokens?: number;     // default undefined
    signal?: AbortSignal;   // optional abort signal
}

let _client: OpenAI | null = null;
let _warnedMissingKey = false;

/**
 * Read config
 */

function getConfig() {
    const apiKey = process.env.OPENAI_API_KEY;
    return {
        apiKey,
    };
}

/**
 * Returns a cached OpenAI client. If no API key is present, shows a single
 * warning and returns null so callers can gracefully degrade.
 */

export function getOpenAIClient(): OpenAI | null {
   if (_client) {
       return _client;
   }

   const { apiKey } = getConfig();

    if (!apiKey) {
         if (!_warnedMissingKey) {
              vscode.window.showWarningMessage(
                'Patchly: No OpenAI API key found. Please set the OPENAI_API_KEY environment variable to enable AI features.'
              );
              _warnedMissingKey = true;
         }
         return null;
    }

    _client = new OpenAI({
        apiKey,
    });

    return _client;
}

/**
 * Convenience helper for non streaming chat completions.
 * Returns the assistant text
 */

export async function chat(messages: AIMessage[], options?: ChatOptions): Promise<string> {
    const client = getOpenAIClient();
    if (!client) {
        return '';
    }

    const {
        model = 'gpt-4.1',
        temperature = 0.3,
        signal,
    } = options || {};

    const response = await client.chat.completions.create({
        model,
        temperature,
        messages
    }, { signal });

    return response.choices?.[0]?.message?.content ?? '';
}

/**
 * Streaming Chat Applications
 */

export async function* chatStream(messages: AIMessage[], options?: ChatOptions): AsyncGenerator<string> {
    const client = getOpenAIClient();
    if (!client) {
        return;
    }

    const {
        model = 'gpt-4.1',
        temperature = 0.3,
        maxTokens,
        signal,
    } = options || {};

    const stream = await client.chat.completions.create({
        model,
        temperature,
        max_tokens: maxTokens,
        messages,
        stream: true,
    }, { signal });

    for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
    }
}

/**
 * Utility to quickly verify API setup and show a user-friendly message.
 * Call this from acitivation to fail fast.
 */
export async function verifyAISetup(): Promise<boolean> {
    const client = getOpenAIClient();
    if (!client) {
        return false;
    }

    try {
        // Make a lightweight request to verify the API key
        await client.models.list();
        return true;
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown error verifying OpenAI setup';
        vscode.window.showErrorMessage(`Patchly AI setup error: ${msg}`);
        return false;
    }
}

