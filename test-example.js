
const vulnerableRegex1 = /^(a+)+$/;

const safeRegex = /^[a-z0-9]+$/;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function testVulnerablePattern(input) {
    return vulnerableRegex1.test(input);
}

function testSafePattern(input) {
    return safeRegex.test(input);
}
