import * as core from '@actions/core';
import * as github from '@actions/github';
import * as crypto from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { default as Stream } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import * as constants from './constants';
import { components } from "@octokit/openapi-types"

export class Artifact {
    constructor(version : string, downloadUrl : string, stable: boolean) {
        this.version = version;
        this.downloadUrl = downloadUrl;
        this.stable = stable;
    }
    version : string;
    downloadUrl : string;
    stable : boolean;
    rsa_sha256 = "";
    sha256 = "";
    
    /*
    compareByVersion(other: Artifact) {
        // 1. Split the strings into their parts.
        const a1 = this.version.split('.');
        const b1 = other.version.split('.');
        // 2. Contingency in case there's a 4th or 5th version
        const len = Math.min(a1.length, b1.length);
        // 3. Look through each version number and compare.
        for (let i = 0; i < len; i++) {
            const a2 = +a1[ i ] || 0;
            const b2 = +b1[ i ] || 0;
            
            if (a2 !== b2) {
                return a2 > b2 ? -1 : 1;        
            }
        }
        
        // 4. We hit this if the all checked versions so far are equal
        //
        return b1.length - a1.length;
        
    }
    */
}

export async function getArtifactsByVersion() : Promise<Map<string,Array<Artifact>>> {
    const artifacts = await getArtifacts();
    const addToMap = function(map: Map<string,Array<Artifact>>, artifact: Artifact) {
        const arr = map.get(artifact.version) ?? [];
        arr.push(artifact);
        return map.set(artifact.version, arr);
    };
    return artifacts.reduce(addToMap, new Map<string,Array<Artifact>>());
}

export async function getArtifacts() : Promise<Array<Artifact>> {
    let result : Array<Artifact>;
    if ( constants.toolRepo ) {
        result = await getGitHubArtifacts(constants.toolRepo);
    } else if ( constants.toolUrls ) {
        result = await getToolUrlArtifacts(JSON.parse(constants.toolUrls));
    } else {
        throw "Either tool_repo or tool_urls input must be specified";
    }
    return result;
} 

const cacheDir = `${constants.workspaceDir}/internal/cache/${constants.toolName}`;

async function getToolUrlArtifacts(toolVersionsAndUrls: {[key: string]: string}) : Promise<Array<Artifact>> {
    const result : Array<Artifact> = [];
    for (const property in toolVersionsAndUrls) {
        result.push(await getFullArtifact(new Artifact(property, toolVersionsAndUrls[property], true)));
    }
    return result;
}

async function getGitHubArtifacts(toolRepo: string) : Promise<Array<Artifact>> {
    const octokit = github.getOctokit(constants.githubToken);
    const ownerAndRepo = toolRepo.split('/');
    const owner = ownerAndRepo[0];
    const repo = ownerAndRepo[1];
    const awaitedResults = await octokit.paginate(octokit.rest.repos.listReleases, {
        owner: owner,
        repo: repo,
        per_page: 100
    }, response=>response.data.map(release=>getGitHubReleaseArtifacts(release)) );
    return (await Promise.all(awaitedResults)).flat();
}

async function getGitHubReleaseArtifacts(release: components["schemas"]["release"]) : Promise<Array<Artifact>> {
    const result : Array<Artifact> = [];
    if ( release.draft ) {
        core.info(`Ignoring draft release ${release.tag_name}`);
    }
    const version = release.tag_name.replace(/^v(\d+.*)$/, '$1'); // Remove 'v' prefix if it is followed by at least one number;
    for (const asset of release.assets) {
        const tagAndAssetName = `${version}/${asset.name}`
        if ( constants.assetRegex && !tagAndAssetName.match(`^${constants.assetRegex}$`) ) {
            core.info(`Ignoring asset ${tagAndAssetName}; doesn't match regex ${constants.assetRegex}`);
        } else {
            result.push(await getFullArtifact(new Artifact(version, asset.browser_download_url, !release.prerelease)));
        }
    }
    return result;
}

async function getFullArtifact(partialArtifact : Artifact) : Promise<Artifact> {
    const cacheFileName = getCacheFileName(partialArtifact.version, partialArtifact.downloadUrl);
    if ( partialArtifact.stable && fs.existsSync(cacheFileName) ) {
        core.info(`Resolved from cache: ${cacheFileName}`);
        return JSON.parse(fs.readFileSync(cacheFileName).toString()) as Artifact;
    } else {
        core.info(`Caching data for ${partialArtifact.downloadUrl}`);
        await fs.ensureFile(cacheFileName);
        const fullArtifact = await updateArtifact(partialArtifact);
        await fs.writeFile(cacheFileName, JSON.stringify(fullArtifact, null, 2), "utf-8");
        return fullArtifact;
    }
}

function getCacheFileName(version: string, downloadUrl: string) : string {
    const url = new URL(downloadUrl);
    const name = `${cacheDir}/${version}-${path.basename(url.pathname)}.json`;
    return name;
}

async function updateArtifact(artifact: Artifact) : Promise<Artifact> {
    const sign = crypto.createSign('RSA-SHA256');
    const hash = crypto.createHash('sha256');
    const downloadUrl = artifact.downloadUrl;
    const response = await fetch(downloadUrl);
    const readable = Stream.Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
    for await (const chunk of readable) {
        sign.update(chunk);
        hash.update(chunk);
    }
    artifact.rsa_sha256 = sign.sign({key: constants.signKey, passphrase: constants.signPassphrase}, "base64");
    artifact.sha256 = hash.digest('hex');
    return artifact;
}