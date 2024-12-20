import * as core from '@actions/core';
import * as github from '@actions/github';
import * as constants from './constants';
import * as path from 'path';
import { VersionDescriptors, VersionDescriptor, PartialArtifactDescriptor } from './descriptors';
import { components } from "@octokit/openapi-types"

/** 
 * This module provides functionality for retrieving VersionDescriptors in
 * descending version order. Based on action inputs, the getVersionDescriptors() 
 * method will either generate version descriptors for a given GitHub repository, 
 * or from a given set of versions and download URLs. 
*/

export async function getVersionDescriptors() : Promise<VersionDescriptors> {
    let result : VersionDescriptors;
    if ( constants.toolRepo ) {
        result = await getGitHubVersionDescriptors(constants.toolRepo);
    } else if ( constants.toolUrls ) {
        result = await getVersionDescriptorsFromToolUrls(JSON.parse(constants.toolUrls));
    } else {
        throw "Either tool_repo or tool_urls input must be specified";
    }
    return result.addAliases().sortByVersion();
}

async function getVersionDescriptorsFromToolUrls(toolVersionDescriptorsAndUrls: {[key: string]: string[]}) : Promise<VersionDescriptors> {
    const result : VersionDescriptors = new VersionDescriptors();
    for (const version in toolVersionDescriptorsAndUrls) {
        const versionDescriptor = new VersionDescriptor(version, true);
        const downloadUrls = toolVersionDescriptorsAndUrls[version];
        for (const downloadUrl of downloadUrls) {
            await versionDescriptor.addBinary(new PartialArtifactDescriptor(path.basename(new URL(downloadUrl).pathname), downloadUrl));
        }
        result.push(versionDescriptor);
    }
    return result;
}

async function getGitHubVersionDescriptors(toolRepo: string) : Promise<VersionDescriptors> {
    const octokit = github.getOctokit(constants.githubToken);
    const ownerAndRepo = toolRepo.split('/');
    const owner = ownerAndRepo[0];
    const repo = ownerAndRepo[1];
    const awaitedResults = await octokit.paginate(octokit.rest.repos.listReleases, {
        owner: owner,
        repo: repo,
        per_page: 100
    }, response=>response.data.map(release=>getGitHubVersionDescriptor(release)) );
    return new VersionDescriptors(...(await Promise.all(awaitedResults)).flat());
}

async function getGitHubVersionDescriptor(release: components["schemas"]["release"]) : Promise<VersionDescriptors> {
    const result : VersionDescriptors = new VersionDescriptors();
    const version = mapTag(release.tag_name).replace(/^v(\d+.*)$/, '$1'); // Remove 'v' prefix if it is followed by at least one number;
    let releaseExcludeReason = getReleaseExcludeReason(release);
    if ( !releaseExcludeReason ) {
        const versionDescriptor = new VersionDescriptor(version, !release.prerelease);
        await addGitHubReleaseAssets(versionDescriptor, release);
        if ( versionDescriptor.hasBinaries() ) { 
            result.push(versionDescriptor); 
        } else {
            releaseExcludeReason = 'no matching assets';
        }
    }
    if ( releaseExcludeReason ) {
        core.info(`Ignoring release tag ${release.tag_name} (${releaseExcludeReason})`);
    }
    return result;
}

function mapTag(tag: string) : string {
    for ( const key in constants.tagMappings ) {
        const regex = `^${key}$`;
        if ( tag.match(regex) ) { 
            return tag.replace(new RegExp(regex), constants.tagMappings[key]); 
        }
    }
    return tag;
}

function getReleaseExcludeReason(release: components["schemas"]["release"]) : string|undefined {
    if ( release.draft ) {
        return 'draft release';
    } else if ( constants.tagRegex && !release.tag_name.match(`^${constants.tagRegex}$`) ) {
        return `doesn't match regex ^${constants.tagRegex}$`;
    }
    return;
}

async function addGitHubReleaseAssets(versionDescriptor : VersionDescriptor, release: components["schemas"]["release"]) : Promise<void> {
    for (const asset of release.assets) {
        if ( constants.assetRegex && !asset.name.match(`^${constants.assetRegex}$`) ) {
            core.info(`Ignoring asset ${asset.name} (${release.tag_name}); doesn't match regex ^${constants.assetRegex}$`);
        } else {
            core.info(`Adding asset ${release.tag_name}/${asset.name}`);
            await versionDescriptor.addBinary(new PartialArtifactDescriptor(asset.name, asset.browser_download_url));
        }
    }
}