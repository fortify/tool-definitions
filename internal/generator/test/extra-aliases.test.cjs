const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const yaml = require('yaml');

function generate(t, extraAliases, versions = ['25.4.2', '26.2.0', '26.2.1']) {
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-extra-aliases-'));
    t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
    const cacheDir = path.join(workspace, 'internal/cache/sc-client');
    fs.mkdirSync(cacheDir, { recursive: true });
    const toolUrls = {};
    for (const version of versions) {
        const name = `client-${version}.zip`;
        const downloadUrl = `https://example.invalid/${name}`;
        toolUrls[version] = [downloadUrl];
        fs.writeFileSync(path.join(cacheDir, `${version}-${name}.json`), JSON.stringify({
            name, downloadUrl, rsa_sha256: 'cached-test-signature', sha256: 'cached-test-digest'
        }));
    }
    const env = {
        ...process.env,
        GITHUB_WORKSPACE: workspace,
        INPUT_SIGNKEY: Buffer.from('unused-cached-artifacts-only').toString('base64'),
        INPUT_SIGNPASSPHRASE: 'unused',
        INPUT_TOOLNAME: 'sc-client',
        INPUT_DIR: '',
        INPUT_TOOLREPO: '',
        INPUT_TOOLURLS: JSON.stringify(toolUrls),
        INPUT_SEMVER: 'minor',
        INPUT_BINARYPLATFORMS: '{".*":"java"}',
        INPUT_TAGMAPPINGS: '{}',
        INPUT_EXTRAVERSIONPROPERTIES: '{".*":{"jre":"17"}}'
    };
    if (extraAliases === undefined) {
        delete env.INPUT_EXTRAALIASES;
    } else {
        env.INPUT_EXTRAALIASES = typeof extraAliases === 'string' ? extraAliases : JSON.stringify(extraAliases);
    }
    const result = spawnSync(process.execPath, [path.join(__dirname, '../dist/index.js')], {
        env, encoding: 'utf8', timeout: 15000
    });
    assert.ifError(result.error);
    const outputFile = path.join(workspace, 'v1/sc-client.yaml');
    return {
        status: result.status,
        log: result.stdout + result.stderr,
        definition: fs.existsSync(outputFile) ? yaml.parse(fs.readFileSync(outputFile, 'utf8')) : undefined
    };
}

function succeeded(result) {
    assert.equal(result.status, 0, result.log);
    assert.ok(result.definition, result.log);
    return result.definition;
}

function failed(result, message) {
    assert.notEqual(result.status, 0, result.log);
    assert.match(result.log, message);
    assert.equal(result.definition, undefined, 'Failed mappings must not publish a definition');
}

test('extra aliases resolve generated minor aliases and exact versions without changing other metadata', t => {
    const expected = succeeded(generate(t));
    expected.versions.find(v => v.version === '26.2.1').aliases.push('26.3');
    expected.versions.find(v => v.version === '25.4.2').aliases.push('26.1', 'pinned');
    const actual = succeeded(generate(t, { '26.1': '25.4', '26.3': '26.2', pinned: '25.4.2' }));
    assert.deepEqual(actual, expected);
});

test('minor alias targets follow a new patch and support the next yearly sensor release', t => {
    const definition = succeeded(generate(t, { '26.3': '26.2', '27.1': '26.4' },
        ['26.2.1', '26.2.2', '26.4.0', '26.4.1']));
    assert.deepEqual(definition.versions.map(v => [v.version, v.aliases]), [
        ['26.4.1', ['latest', '26.4', '27.1']],
        ['26.4.0', []],
        ['26.2.2', ['26.2', '26.3']],
        ['26.2.1', []]
    ]);
});

test('missing targets fail generation, including a future client version', t => {
    failed(generate(t, { '26.3': '26.2', '27.1': '26.4' }),
        /Cannot add extra alias "27\.1"; no version or generated alias "26\.4" found/);
});

test('extra aliases cannot redirect actual versions or generated aliases', t => {
    for (const alias of ['26.2.1', '26.2', 'latest']) {
        failed(generate(t, { [alias]: '25.4' }), /already resolves to "26\.2\.1", not "25\.4\.2"/);
    }
    const unchanged = succeeded(generate(t, { '26.2': '26.2.1', '26.2.1': '26.2' }));
    assert.deepEqual(unchanged, succeeded(generate(t)));
});

test('extra alias chaining is rejected in either input order', t => {
    for (const mapping of [
        { '26.3': '26.2', next: '26.3' },
        { next: '26.3', '26.3': '26.2' }
    ]) {
        failed(generate(t, mapping), /no version or generated alias "26\.3" found/);
    }
});

test('omitted, empty and matrix null inputs preserve existing output', t => {
    const expected = succeeded(generate(t));
    for (const input of ['', 'null', '{}']) {
        assert.deepEqual(succeeded(generate(t, input)), expected);
    }
});

test('malformed mappings fail instead of silently publishing incomplete aliases', t => {
    for (const input of ['[]', '"text"', '42', '{"26.3":42}', '{"":"26.2"}', '{"26.3":" "}']) {
        failed(generate(t, input), /extraAliases must/);
    }
    failed(generate(t, '{'), /SyntaxError/);
});
