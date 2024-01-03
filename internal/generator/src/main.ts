import * as core from '@actions/core';
import * as artifact from './artifact';

/**
 * Main entrypoint for this GitHub Action.
 */
async function main(): Promise<void> {
	try {
		const artifactsByVersion = await artifact.getArtifactsByVersion();
		artifactsByVersion.forEach((value,key)=>core.info(`${key}: ${value.reduce((s,v)=>s+=v.downloadUrl+',','')}`));
	} catch (err) {
		core.setFailed("Action failed with error: " + err);
	}
}

main();
