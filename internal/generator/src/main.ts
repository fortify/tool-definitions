import * as core from '@actions/core';
import * as constants from './constants';
import * as loader from './loader';
import * as v1Writer from './writer-v1';
import * as dirPacker from './dir-packer';

/**
 * Main entrypoint for this GitHub Action. In "dir" mode, packs a directory
 * into a signed zip. Otherwise, loads version descriptors from a GitHub repo
 * or URLs and writes v1 tool definitions.
 */
async function main(): Promise<void> {
	try {
		if (constants.dir) {
			await dirPacker.pack(constants.dir);
		} else {
			const versionDescriptors = await loader.getVersionDescriptors();
			v1Writer.write(versionDescriptors);
		}
	} catch (err) {
		core.setFailed("Action failed with error: " + err);
	}
}

main();
