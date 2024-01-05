import * as core from '@actions/core';
import * as loader from './loader';
import * as v1Writer from './writer-v1';

/**
 * Main entrypoint for this GitHub Action.
 */
async function main(): Promise<void> {
	try {
		const versionDescriptors = await loader.getVersionDescriptors();
		//versionDescriptors.forEach(v=>core.info(`${v.version}: ${v.getVersionAndAliases().reduce((s,v)=>s+=v+',','')}`));
		v1Writer.write(versionDescriptors);
	} catch (err) {
		core.setFailed("Action failed with error: " + err);
	}
}

main();
