import * as core from '@actions/core';

export const signKey = Buffer.from(core.getInput("signKey", {required: true}), 'base64').toString('ascii');
export const signPassphrase = core.getInput("signPassphrase", {required: true});
export const toolName = core.getInput("toolName", {required: true});
export const githubToken = core.getInput("GITHUB_TOKEN", {required: true});
export const tagRegex = core.getInput("tagRegex", {required: false}).trim();
export const assetRegex = core.getInput("assetRegex", {required: false}).trim();
export const toolRepo = core.getInput("toolRepo", {required: false});
export const toolUrls = core.getInput("toolUrls", {required: false});
export const semver = core.getInput("semver", {required: false});
export const artifactTypes = JSON.parse(core.getInput("artifactTypes", {required: true})) as {[key: string]: string};
export const workspaceDir = process.env.GITHUB_WORKSPACE;