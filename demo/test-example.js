
/**  
 * Patchly ReDoS Vulnerability Examples
 *
 * This file contains examples of regular expressions that are vulnerable to ReDoS attacks,
 * along with examples of how to ignore specific vulnerabilities using comments.
*/


const vulnerableRegex1 = /^(a+)+$/;


/** -------------------------- SAME LINE IGNORE EXAMPLE -------------------------- */




const vulnerableRegexIgnored2 = /^(a+)+$/; // patchly-ignore-line redos




/** -------------------------- NEXT LINE IGNORE EXAMPLE -------------------------- */




// patchly-disable-next-line redos
const vulnerableRegexIgnored = /^(a+)+$/;




/** -------------------------- BLOCK IGNORE EXAMPLE -------------------------- */




/* patchly-disable redos */

const vulnerableRegex2 = /^(a+)+$/;

const vulnerableRegex3 = /^(a+)+$/;

/* patchly-enable redos */




/** -------------OTHER EXAMPLES ------------- */

const safeRegex = /^[a-z0-9]+$/;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


// Real world example in charset npm package. https://github.com/advisories/GHSA-9cp3-fh5x-xfcj
const charsetRealWorldExample = /(?:charset|encoding)\s*=\s*['"]? *([\w\-]+)/i

function testVulnerablePattern(input) {
    return vulnerableRegex1.test(input);
}

function testSafePattern(input) {
    return safeRegex.test(input);
}
