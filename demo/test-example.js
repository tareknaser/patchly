
/**  
 * Patchly ReDoS Vulnerability Examples
 *
 * This file contains examples of regular expressions that are vulnerable to ReDoS attacks,
 * along with examples of how to ignore specific vulnerabilities using comments.
*/


const vulnerableRegex1 = /^(a+)+$/;

// Real example from ansi-html (https://github.com/Tjatse/ansi-html/issues/19)
// According to ansi-html:
//  REMEDIATION
//  Remove the asterisk from the regular expression on line 62.

var ret = text.replace(/\033\[(\d+)*m/g)

// Real Example from axios (https://github.com/advisories/GHSA-cph5-m8f7-6c5x)
str.replace(/^\s*/, '').replace(/\s*$/, '');


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




function testVulnerablePattern(input) {
    return vulnerableRegex1.test(input);
}

function testSafePattern(input) {
    return safeRegex.test(input);
}
