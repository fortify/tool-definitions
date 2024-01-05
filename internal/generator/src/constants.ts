import * as core from '@actions/core';

// TODO: Fix input handling from matrix in publish.yml. If certain properties are not defined
//       in the setup job, these are passed as the string 'null' in the generate-tool-definitions
//       job. This causes default values as defined in action.yml not being applied, and receiving
//       'null' strings instead of the expected empty strings/null values/default action.yml values
//       on the getInput() calls below. For now, we work around this by explicitly converting 'null'
//       strings to null values, and applying defaults where appropriate. 

function defaultIfEmpty(s: string, def: string) {
    return nullIfEmpty(s)==null ? def : s;
}

function nullIfEmpty(s: string) : string|null {
    return s.trim()=='' || s.trim()=='null' ? null : s;
}

export const signKey = Buffer.from(core.getInput("signKey", {required: true}), 'base64').toString('ascii');
export const signPassphrase = core.getInput("signPassphrase", {required: true});
export const toolName = core.getInput("toolName", {required: true});
export const githubToken = core.getInput("GITHUB_TOKEN", {required: true});
export const tagRegex = nullIfEmpty(core.getInput("tagRegex", {required: false}).trim());
export const assetRegex = nullIfEmpty(core.getInput("assetRegex", {required: false}).trim());
export const toolRepo = nullIfEmpty(core.getInput("toolRepo", {required: false}));
export const toolUrls = nullIfEmpty(core.getInput("toolUrls", {required: false}));
export const semver = defaultIfEmpty(core.getInput("semver", {required: false}), "none");
export const artifactTypes = JSON.parse(defaultIfEmpty(core.getInput("artifactTypes", {required: false}), '{".*": "default"}')) as {[key: string]: string};
export const tagMappings = JSON.parse(defaultIfEmpty(core.getInput("tagMappings", {required: false}), '{"(.*)": "$1"}')); 
export const workspaceDir = process.env.GITHUB_WORKSPACE;