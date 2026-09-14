const test = require("node:test");
const assert = require("node:assert/strict");

const {
    findFlatObjects,
    getBooleanField,
    getNumberField,
    getStringField,
    normalizeNextPayload,
} = require("../out/payload.js");

test("normalizes a Next.js flight payload fragment", () => {
    const inner = `{"courseId":78,"courseName":"Programming","enrolled":true}`;
    const source = `<script>self.__next_f.push([1,${JSON.stringify(inner)}])</script>`;
    assert.match(normalizeNextPayload(source), /"courseId":78/);
});

test("normalizes escaped quote forms used in serialized payloads", () => {
    const source = String.raw`{\u0022courseId\u0022:78,\"courseName\":\"Programming\"}`;
    const normalized = normalizeNextPayload(source);
    assert.match(normalized, /"courseId":78/);
    assert.match(normalized, /"courseName":"Programming"/);
});

test("findFlatObjects returns an enclosing flat object once", () => {
    const source = `prefix {"courseId":78,"courseName":"A","enrolled":true} suffix`;
    assert.deepEqual(findFlatObjects(source, "courseId"), [
        `{"courseId":78,"courseName":"A","enrolled":true}`,
    ]);
});

test("field helpers parse escaped strings, numeric values and booleans", () => {
    const object = `{"name":"A\\nB","integer":78,"decimal":1.25e2,"yes":true,"no":false}`;
    assert.equal(getStringField(object, "name"), "A\nB");
    assert.equal(getNumberField(object, "integer"), 78);
    assert.equal(getNumberField(object, "decimal"), 125);
    assert.equal(getBooleanField(object, "yes"), true);
    assert.equal(getBooleanField(object, "no"), false);
});

test("field helpers return undefined for missing or incompatible values", () => {
    const object = `{"name":7,"integer":"78","yes":1}`;
    assert.equal(getStringField(object, "name"), undefined);
    assert.equal(getNumberField(object, "integer"), undefined);
    assert.equal(getBooleanField(object, "yes"), undefined);
});
