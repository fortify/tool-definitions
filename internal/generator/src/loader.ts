import * as core from '@actions/core';
import * as github from '@actions/github';
import * as constants from './constants';
import { VersionDescriptors, VersionDescriptor, PartialArtifactDescriptor } from './descriptors';
import { components } from "@octokit/openapi-types"

export async function getVersionDescriptors() : Promise<VersionDescriptors> {
    let result : VersionDescriptors;
    if ( constants.toolRepo ) {
        result = await getGitHubVersionDescriptors(constants.toolRepo);
    } else if ( constants.toolUrls ) {
        result = await getVersionDescriptorsFromJSON(JSON.parse(constants.toolUrls));
    } else {
        throw "Either tool_repo or tool_urls input must be specified";
    }
    return result.addAliases().sortByVersion();
}

async function getVersionDescriptorsFromJSON(toolVersionDescriptorsAndUrls: {[key: string]: string}) : Promise<VersionDescriptors> {
    const result : VersionDescriptors = new VersionDescriptors();
    for (const version in toolVersionDescriptorsAndUrls) {
        const partialArtifactDescriptor = new PartialArtifactDescriptor(toolVersionDescriptorsAndUrls[version]);
        result.push(await new VersionDescriptor(version, true).push(partialArtifactDescriptor));
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
    const version = release.tag_name.replace(/^v(\d+.*)$/, '$1'); // Remove 'v' prefix if it is followed by at least one number;
    let releaseExcludeReason = getReleaseExcludeReason(release);
    if ( !releaseExcludeReason ) {
        const versionDescriptor = new VersionDescriptor(version, !release.prerelease);
        await addGitHubReleaseAssets(versionDescriptor, release);
        if ( versionDescriptor.hasArtifacts() ) { 
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
            await versionDescriptor.push(new PartialArtifactDescriptor(asset.browser_download_url));
        }
    }
}