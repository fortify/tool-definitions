import * as core from '@actions/core';
import * as loader from './loader';
import * as v1Writer from './writer-v1';

/**
 * Main entrypoint for this GitHub Action. This will use the loader.ts module
 * to load a VersionDescriptors instance (as defined in descriptor.ts), then
 * use the writer-v1.ts module to write the 'version 1' tool descriptors.
 */
async function main(): Promise<void> {
	try {
		const versionDescriptors = await loader.getVersionDescriptors();
		v1Writer.write(versionDescriptors);
	} catch (err) {
		core.setFailed("Action failed with error: " + err);
	}
}

main();
