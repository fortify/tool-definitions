import * as core from '@actions/core';

export const signKey = Buffer.from(core.getInput("sign_key", {required: true}), 'base64').toString('ascii');
export const signPassphrase = core.getInput("sign_passphrase", {required: true});
export const toolName = core.getInput("tool_name", {required: true});
export const githubToken = core.getInput("GITHUB_TOKEN", {required: true});
export const assetRegex = core.getInput("asset_regex", {required: false}).trim();
export const toolRepo = core.getInput("tool_repo", {required: false});
export const toolUrls = core.getInput("tool_urls", {required: false});
export const includeSemVer = core.getBooleanInput("add_semver", {required: false});
export const workspaceDir = process.env.GITHUB_WORKSPACE;