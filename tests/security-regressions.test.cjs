const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");

function read(name) {
    return fs.readFileSync(path.join(root, name), "utf8");
}

function allSource() {
    return fs.readdirSync(srcDir)
        .filter((name) => name.endsWith(".ts"))
        .map((name) => fs.readFileSync(path.join(srcDir, name), "utf8"))
        .join("\n");
}

test("runtime source contains no embedded production-style Server Action ID literals", () => {
    for (const file of fs.readdirSync(srcDir).filter((name) => name.endsWith(".ts"))) {
        const source = fs.readFileSync(path.join(srcDir, file), "utf8");
        assert.doesNotMatch(source, /["'][0-9a-f]{40,512}["']/i, `${file} contains a production-style Server Action literal`);
    }
});

test("runtime source contains no hard-coded Server Action fallback constants", () => {
    const source = allSource();
    assert.doesNotMatch(source, /FALLBACK_LOGIN_ACTION/);
    assert.doesNotMatch(source, /FALLBACK_SUBMIT_ACTION/);
    assert.doesNotMatch(source, /KNOWN_(?:LOGIN|SUBMIT)_ACTION/);
});

test("runtime source does not restore private Next.js _rsc navigation", () => {
    const source = allSource();
    assert.doesNotMatch(source, /createRscKey/);
    assert.doesNotMatch(source, /searchParams\.set\(\s*["']_rsc["']/);
    assert.doesNotMatch(source, /[?&]_rsc=/);
});

test("Server Action implementation does not persist or log discovered IDs", () => {
    const source = read("src/actions.ts");
    assert.doesNotMatch(source, /SecretStorage|globalState|workspaceState|writeFile|appendFile/);
    assert.doesNotMatch(source, /console\.(?:log|info|warn|error|debug)/);
});

test("submission implementation uses course_problem_id and does not use cp_problem_id", () => {
    const source = read("src/submissions.ts");
    assert.match(source, /course_problem_id\s*:\s*problemId/);
    assert.doesNotMatch(source, /cp_problem_id/);
});

test("authentication keeps the current SecretStorage key", () => {
    const source = read("src/auth.ts");
    assert.match(source, /micknorj\.tools\.ijudge\.accessToken/);
});

test("repository tracks tests while VSIX packaging excludes them", () => {
    const gitignore = read(".gitignore");
    const vscodeignore = read(".vscodeignore");
    assert.doesNotMatch(gitignore, /^tests\/?$/m);
    assert.match(vscodeignore, /^tests\/\*\*$/m);
});

test("current source and reconstructed tests contain no former username", () => {
    const files = [
        ...fs.readdirSync(srcDir).map((name) => path.join(srcDir, name)),
        ...fs.readdirSync(__dirname).filter((name) => name.endsWith(".cjs")).map((name) => path.join(__dirname, name)),
    ];
    for (const file of files) {
        const formerUsername = ["mick", "nj"].join("");
        assert.equal(fs.readFileSync(file, "utf8").toLowerCase().includes(formerUsername), false, `${path.basename(file)} contains the former username`);
    }
});
