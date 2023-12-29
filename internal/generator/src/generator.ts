/* eslint-disable @typescript-eslint/no-explicit-any */
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as crypto from 'node:crypto';
import * as fs from 'fs-extra';
import * as process from 'process';
import { Stream } from 'node:stream';

const signKey = Buffer.from(core.getInput("sign_key", {required: true}), 'base64').toString('ascii');
const signPassphrase = core.getInput("sign_passphrase", {required: true});
const regex = `^${core.getInput("regex", {required: false}).trim()}$`;
const toolName = core.getInput("tool_name", {required: true});
const workspaceDir = process.env.GITHUB_WORKSPACE;
const cacheDir = `${workspaceDir}/internal/cache/${toolName}`;

async function calculateSignature(downloadUrl: string) : Promise<string> {
	core.debug(`Calculating signature: ${downloadUrl}`);
	const sign = crypto.createSign('RSA-SHA256');
	const response = await fetch(downloadUrl);
	await response.body?.pipeTo(Stream.Writable.toWeb(sign));
	const signature = sign.sign({key: signKey, passphrase: signPassphrase}, "base64");
	core.info(`URL: ${downloadUrl}\nSignature: ${signature}`);
	return signature;
}

async function buildCacheForToolRepoAssets(toolRepo: string) : Promise<void> {
	const token = core.getInput("GITHUB_TOKEN", {required: true});
	const octokit = github.getOctokit(token);
		await octokit.paginate(
			`GET /repos/${toolRepo}/releases`
		).then(buildCacheForReleases);
}

async function buildCacheForReleases(releases: Array<any>) : Promise<void> {
	releases.forEach(buildCacheForReleaseAssets);
}

async function buildCacheForReleaseAssets(release: any) : Promise<void> {
	await release.assets.forEach((asset: any)=>{buildCacheForReleaseAsset(release.tag_name, asset)});
}

async function buildCacheForReleaseAsset(tagName: string, asset: any) : Promise<void> {
	const assetName = asset.name;
	const downloadUrl = asset.browser_download_url
	if (isAssetIncluded(tagName, assetName, downloadUrl)) {
		await buildCacheForArtifact(tagName, downloadUrl);
	}
}

function isAssetIncluded(tagName: string, assetName: string, downloadUrl: string): boolean {
	const tagAndAssetName = `${tagName}/${assetName}` 
	const includedByRegex = regex ? tagAndAssetName.match(`${regex}`)!=null : true;
	const cached = isCached(downloadUrl);
	const status = !cached ? (includedByRegex?'included':'not included') : 'cached';
	core.info(`${tagAndAssetName} ${status} (regex: ${regex})`);
	return status=='included';	
}

function getCacheFileName(downloadUrl: string) : string {
	const url = new URL(downloadUrl);
	const name = cacheDir+"/"+url.hostname+url.pathname.replace(/\//g, '.')+'.json';
	return name;
}

function isCached(downloadUrl: string) : boolean {
	return fs.existsSync(getCacheFileName(downloadUrl));
}

async function buildCacheForArtifact(version: string, downloadUrl: string) : Promise<void> {
	const cacheFileName = getCacheFileName(downloadUrl);
	await fs.ensureFile(cacheFileName);
	const signature = await calculateSignature(downloadUrl);
	const contents = {
		version: version,
		downloadUrl: downloadUrl,
		signature: signature
	}
	await fs.writeFile(cacheFileName, JSON.stringify(contents), "utf-8");
}

async function buildCacheForTools(toolVersionsAndUrls: any) : Promise<void> {
	for (const property in toolVersionsAndUrls) {
		buildCacheForArtifact(property, toolVersionsAndUrls[property]);
	}
}

/**
 * Main entrypoint for this GitHub Action.
 */
async function main(): Promise<void> {
	try {
		const toolRepo = core.getInput("tool_repo");
		const toolUrls = core.getInput("tool_urls");
		if ( toolRepo ) {
			await buildCacheForToolRepoAssets(toolRepo);
		} else if ( toolUrls ) {
			await buildCacheForTools(JSON.parse(toolUrls));
		} else {
			throw "Either tool_repo or tool_urls input must be specified";
		}
	} catch (err) {
		core.setFailed("Action failed with error: " + err);
	}
}

main();
