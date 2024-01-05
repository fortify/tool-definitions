import { VersionDescriptors, VersionDescriptor, ArtifactDescriptor } from './descriptors';
import * as constants from './constants';
import * as yaml from 'yaml';
import * as fs from 'fs-extra';

const outputDir = `${constants.workspaceDir}/v1`;
const outputFile = `${outputDir}/${constants.toolName}.yaml`;

export async function write(versionDescriptors: VersionDescriptors) : Promise<void> {
    const output = new OutputData(versionDescriptors);
    await fs.ensureFile(outputFile);
    await fs.writeFile(outputFile, yaml.stringify(output, null, 2), "utf-8");
}

class OutputData extends Map<string, string|Array<VersionData>> {
    constructor(versionDescriptors: VersionDescriptors) {
        super();
        this.set("defaultVersion", versionDescriptors[0].version);
        this.set("versions", versionDescriptors.map(vd=>new VersionData(vd)));
    }
}

class VersionData extends Map<string,string|boolean|Map<string,ArtifactData>|Array<string>> {
    constructor(versionDescriptor: VersionDescriptor) {
        super();
        this.set("version", versionDescriptor.version);
        this.set("aliases", versionDescriptor.aliases);
        this.set("stable", versionDescriptor.stable);
        const artifacts : Map<string,ArtifactData> = new Map(); 
        versionDescriptor.getArtifacts().forEach(artifactDescriptor=>addArtifact(artifacts, artifactDescriptor));
        this.set("artifacts", artifacts);
    }
}

class ArtifactData extends Map<string,string> {
    constructor(artifactDescriptor: ArtifactDescriptor) {
        super()
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
    for ( const regex in constants.artifactTypes ) {
        if ( artifactDescriptor.downloadUrl.toLowerCase().match(`^${regex}$`) ) { 
            return constants.artifactTypes[regex];
        }
    }
    throw `No artifact type mapping found for ${artifactDescriptor.downloadUrl}`;
}