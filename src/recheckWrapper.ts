import { checkSync, Diagnostics, AttackPattern, Hotspot } from 'recheck';

export interface RecheckResult {
    status: 'safe' | 'vulnerable' | 'unknown';
    pattern: string;
    complexity?: {
        type: string;
        summary: string;
    };
    attack?: AttackPattern;
    hotspot?: Hotspot[];
}

export class RecheckWrapper {
    checkPattern(pattern: string, flags: string = ''): RecheckResult {
        try {
            const diagnostics: Diagnostics = checkSync(pattern, flags);

            if (diagnostics.status === 'safe') {
                return { status: 'safe', pattern };
            }

            if (diagnostics.status === 'vulnerable') {
                return {
                    status: 'vulnerable',
                    pattern,
                    complexity: diagnostics.complexity,
                    attack: diagnostics.attack,
                    hotspot: diagnostics.hotspot
                };
            }

            return { status: 'unknown', pattern };
        } catch (error) {
            console.error('Recheck error:', error);
            return { status: 'unknown', pattern };
        }
    }

    generateSummary(result: RecheckResult): string {
        if (result.status === 'safe') {
            return 'This regex is safe';
        }

        if (result.status === 'vulnerable') {
            return `Potential ReDoS`;
        }

        return 'Unable to analyze this regex';
    }

    formatAttackString(result: RecheckResult): string | null {
        return result.status === 'vulnerable' && result.attack ? result.attack.pattern : null;
    }
}
