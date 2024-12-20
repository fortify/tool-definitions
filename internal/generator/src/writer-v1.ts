import { VersionDescriptors, VersionDescriptor, ArtifactDescriptor } from './descriptors';
import * as constants from './constants';
import * as yaml from 'yaml';
import * as fs from 'fs-extra';

const outputDir = `${constants.workspaceDir}/v1`;
const outputFile = `${outputDir}/${constants.toolName}.yaml`;

/** 
 * This method is responsible for writing the `v1` tool descriptors to the `<workspace>/v1`
 * directory, based on the given version descriptors loaded by loader.ts and passed to this
 * method by main.ts. 
 * 
 * This method uses various `Data` classes defined below to define the output structure, and 
 * then uses the `yaml` module to convert this into yaml format before writing the output to
 * the output file. 
 * 
 * The `Data` classes all extend from `Map` instead of using plain class fields to ensure 
 * output order. If we'd use plain class fields, then for example each version entry might
 * first list aliases and artifacts, before listing the actual version number. This wouldn't
 * be an issue for programmatic processing, but does affect human readibility of the output
 * file. Especially if users want to modify these files (for example overriding download URLs
 * or reducing the set of supported versions), human readibility is just as important. 
*/
export async function write(versionDescriptors: VersionDescriptors) : Promise<void> {
    const output = new OutputData(versionDescriptors);
    await fs.ensureFile(outputFile);
    await fs.writeFile(outputFile, yaml.stringify(output, null, 2), "utf-8");
}

class OutputData extends Map<string, string|Array<VersionData>> {
    constructor(versionDescriptors: VersionDescriptors) {
        super();
        this.set("schema_version", "1.1");
        this.set("versions", versionDescriptors.map(vd=>new VersionData(vd)));
    }
}

class VersionData extends Map<string,string|boolean|Map<string,ArtifactData>|Array<string>|Map<string,string>> {
    constructor(versionDescriptor: VersionDescriptor) {
        super();
        this.set("version", versionDescriptor.version);
        this.set("aliases", versionDescriptor.aliases);
        this.set("stable", versionDescriptor.stable);
        const artifacts : Map<string,ArtifactData> = new Map(); 
        versionDescriptor.getBinaries().forEach(artifactDescriptor=>addArtifact(artifacts, artifactDescriptor));
        this.set("binaries", artifacts);
        const extraProperties = getExtraProperties(versionDescriptor.version, constants.extraVersionProperties);
        if ( extraProperties ) {
            this.set("extraProperties", extraProperties);
        }
    }
}

class ArtifactData extends Map<string,string> {
    constructor(artifactDescriptor: ArtifactDescriptor) {
        super()
        this.set("name", artifactDescriptor.name);
        this.set("downloadUrl", artifactDescriptor.downloadUrl);
        this.set("rsa_sha256", artifactDescriptor.rsa_sha256);
    }
}

function addArtifact(artifacts : Map<string,ArtifactData>, artifactDescriptor : ArtifactDescriptor) {
    const artifactType = getArtifactType(artifactDescriptor);
    if ( artifacts.has(artifactType) ) {
        throw `Multiple artifacts with same type '${artifactType}':\n\t${artifactDescriptor.downloadUrl}\n\t${artifacts.get(artifactType)!.get('downloadUrl')}`;
    }
    artifacts.set(artifactType, new ArtifactData(artifactDescriptor));
}

function getArtifactType(artifactDescriptor: ArtifactDescriptor) : string {
    for ( const regex in constants.binaryPlatforms ) {
        if ( artifactDescriptor.downloadUrl.toLowerCase().match(`^${regex}$`) ) { 
            return constants.binaryPlatforms[regex];
        }
    }
    throw `No artifact platform mapping found for ${artifactDescriptor.downloadUrl}`;
}

function getExtraProperties(valueToMatch: string, propertiesByRegex: {[key: string]: {[key: string]: string}}) : Map<string,string> | null {
    const result = new Map<string,string>();
    for ( const regex in propertiesByRegex ) {
        if ( valueToMatch.match(`^${regex}$`) ) {
            const properties = propertiesByRegex[regex];  
            for ( const property in properties ) {
                result.set(property, properties[property]);
            }
        }
    }
    return result.size==0 ? null : result;
}