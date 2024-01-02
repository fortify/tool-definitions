/* eslint-disable @typescript-eslint/no-explicit-any */
import * as core from '@actions/core';
import * as github from '@actions/github';
import * as crypto from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as process from 'process';
import { default as Stream } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'


class GHRelease {
    constructor(ghRelease: any) {
        this.version = ghRelease.tag_name.replace(/^v(\d+.*)$/, '$1'); // Remove 'v' prefix if it is followed by at least one number
        this.draft = ghRelease.draft;
        this.prerelease = ghRelease.prerelease;
        this.assets = ghRelease.assets.map((ghAsset: any)=>new GHAsset(this, ghAsset));
    }
    version;
    draft;
    prerelease;
    assets : GHAsset[];
}

class GHAsset {
    constructor(ghRelease: GHRelease, ghAsset: any) {
        this.release= ghRelease;
        this.name = ghAsset.name;
        this.downloadUrl = ghAsset.browser_download_url
    }
    release;
    name;
    downloadUrl;
}

class CacheEntry {
    constructor(version : string, downloadUrl : string, stable: boolean) {
        this.version = version;
        this.downloadUrl = downloadUrl;
        this.stable = stable;
    }
    version;
    downloadUrl;
    stable;
    rsa_sha256 = "";
    sha256 = "";
}

const signKey = Buffer.from(core.getInput("sign_key", {required: true}), 'base64').toString('ascii');
const signPassphrase = core.getInput("sign_passphrase", {required: true});
const regex = `^${core.getInput("regex", {required: false}).trim()}$`;
const toolName = core.getInput("tool_name", {required: true});
const workspaceDir = process.env.GITHUB_WORKSPACE;
const cacheDir = `${workspaceDir}/internal/cache/${toolName}`;

async function buildCacheForTools(toolVersionsAndUrls: any) : Promise<void> {
    for (const property in toolVersionsAndUrls) {
        buildCacheForArtifact(property, toolVersionsAndUrls[property], true);
    }
}

async function buildCacheForToolRepoAssets(toolRepo: string) : Promise<void> {
	const token = core.getInput("GITHUB_TOKEN", {required: true});
	const octokit = github.getOctokit(token);
		(await octokit.paginate(
			`GET /repos/${toolRepo}/releases`
		)).forEach(ghRelease=>buildCacheForRelease(new GHRelease(ghRelease)));

}

async function buildCacheForRelease(release: GHRelease) : Promise<void> {
	release.assets.forEach(asset=>{buildCacheForReleaseAsset(release, asset)});
}

async function buildCacheForReleaseAsset(release: GHRelease, asset: GHAsset) : Promise<void> {
	if (isCacheUpdateRequired(release, asset)) {
		await buildCacheForArtifact(release.version, asset.downloadUrl, !release.prerelease);
	}
}

async function buildCacheForArtifact(version: string, downloadUrl: string, stable: boolean) : Promise<void> {
    const cacheFileName = getCacheFileName(version, downloadUrl);
    await fs.ensureFile(cacheFileName);
    const cacheEntry = new CacheEntry(version, downloadUrl, stable);
    await updateCacheEntry(cacheEntry);
    await fs.writeFile(cacheFileName, JSON.stringify(cacheEntry, null, 2), "utf-8");
}

function isCacheUpdateRequired(release: GHRelease, asset: GHAsset) : boolean {
    const tagAndAssetName = `${release.version}/${asset.name}`
    var status = '';
    var updateRequired = false;
    if ( release.draft ) { 
        status = 'excluded (draft release)' 
    } else if ( regex && !tagAndAssetName.match(`${regex}`) ) {
        status = `excluded (doesn't match ${regex})`;
    } else if ( release.prerelease ) {
        status = 'included (recalculating cache for pre-release)';
        updateRequired = true;
    } else if ( isCached(release.version, asset.downloadUrl) ) {
        status = 'excluded (already cached)';
    } else {
        status = 'included (not yet cached)'
        updateRequired = true;
    }
    core.info(`${tagAndAssetName} ${status}`);
    return updateRequired;  
}

function getCacheFileName(version: string, downloadUrl: string) : string {
	const url = new URL(downloadUrl);
	const name = `${cacheDir}/${version}-${path.basename(url.pathname)}.json`;
	return name;
}

function isCached(version: string, downloadUrl: string) : boolean {
	return fs.existsSync(getCacheFileName(version, downloadUrl));
}

async function updateCacheEntry(cacheEntry: CacheEntry) : Promise<void> {
    const sign = crypto.createSign('RSA-SHA256');
    const hash = crypto.createHash('sha256');
    const downloadUrl = cacheEntry.downloadUrl;
    const response = await fetch(downloadUrl);
    const readable = Stream.Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
    for await (const chunk of readable) {
        sign.update(chunk);
        hash.update(chunk);
    }
    cacheEntry.rsa_sha256 = sign.sign({key: signKey, passphrase: signPassphrase}, "base64");
    cacheEntry.sha256 = hash.digest('hex');
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
