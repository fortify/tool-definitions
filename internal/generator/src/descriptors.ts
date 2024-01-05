import * as core from '@actions/core';
import * as constants from './constants';
import * as crypto from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { default as Stream } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import * as semver from 'semver'

export class VersionDescriptors extends Array<VersionDescriptor> {
    addAliases() : VersionDescriptors {
        const allVersions = this.map(v=>v.version);
        this.forEach(v=>v.addAliases(allVersions));
        return this;
    }
    sortByVersion(descending = true) : VersionDescriptors {
        return this.sort((v1,v2)=>descending ? v2.compareTo(v1) : v1.compareTo(v2) );
    }
}

export class VersionDescriptor {
    constructor(version:string, stable:boolean) {
        this.version = version;
        this.stable = stable && !semver.prerelease(version);
    }
    version : string;
    stable : boolean;
    aliases : string[] = [];
    #artifacts : ArtifactDescriptor[] = [];
    async push(partialArtifactDescriptor : PartialArtifactDescriptor) : Promise<VersionDescriptor> {
        this.#artifacts.push(await partialArtifactDescriptor.asArtifactDescriptor(this));
        return this;
    }
    getArtifacts() : Readonly<ArtifactDescriptor[]> {
        return this.#artifacts;
    }
    hasArtifacts() : boolean {
        return this.#artifacts.length > 0;
    }
    compareTo(other: VersionDescriptor) : number {
        if ( this===other ) { return 0; }
        if ( this.stable && !other.stable ) { return 1; }
        if ( !this.stable && other.stable ) { return -1; }
        if ( semver.valid(this.version) && semver.valid(other.version) ) { return semver.compare(this.version, other.version); }
        return this.version.localeCompare(other.version);
    }
    getVersionAndAliases() : Array<string> {
        return this.aliases.concat(this.version);
    }
    addAliases(allVersions: Array<string>) : void {
        if ( semver.valid(this.version) && this.stable ) {
            const major = `${semver.major(this.version)}`;
            const minor = `${semver.minor(this.version)}`;
            const majorMinor = `${major}.${minor}`;
            this.#addAlias(allVersions, major, ["major"]);
            this.#addAlias(allVersions, majorMinor, ["major", "minor"]);
        }
    }
    #addAlias(allVersions: Array<string>, alias: string, matchingTypes: Array<string>) {
        if ( matchingTypes.includes(constants.semver) ) {
            if ( this.version==semver.maxSatisfying(allVersions, alias, false) ) {
                this.aliases.push(alias);        
            }
        }
    }
}

export class ArtifactDescriptor {
    constructor(partialArtifactDescriptor : PartialArtifactDescriptor) {
        this.downloadUrl = partialArtifactDescriptor.downloadUrl;
    }
    downloadUrl : string;
    rsa_sha256 = "";
    sha256 = "";
}

export class PartialArtifactDescriptor {
    static #cacheDir = `${constants.workspaceDir}/internal/cache/${constants.toolName}`;
    constructor(downloadUrl : string) {
        this.downloadUrl = downloadUrl;
    }
    downloadUrl : string;
    
    async asArtifactDescriptor(versionDescriptor: VersionDescriptor) : Promise<ArtifactDescriptor> {
        const cacheFileName = this.#getCacheFileName(versionDescriptor.version, this.downloadUrl);
        if ( versionDescriptor.stable && fs.existsSync(cacheFileName) ) {
            core.info(`Resolved from cache: ${cacheFileName}`);
            return JSON.parse(fs.readFileSync(cacheFileName).toString()) as ArtifactDescriptor;
        } else {
            core.info(`Caching data for ${this.downloadUrl}`);
            await fs.ensureFile(cacheFileName);
            const fullArtifactDescriptor = await this.#updateArtifactDescriptor(new ArtifactDescriptor(this));
            await fs.writeFile(cacheFileName, JSON.stringify(fullArtifactDescriptor, null, 2), "utf-8");
            return fullArtifactDescriptor;
        }
    }

    #getCacheFileName(version: string, downloadUrl: string) : string {
        const url = new URL(downloadUrl);
        const name = `${PartialArtifactDescriptor.#cacheDir}/${version}-${path.basename(url.pathname)}.json`;
        return name;
    }
    
    async #updateArtifactDescriptor(artifact: ArtifactDescriptor) : Promise<ArtifactDescriptor> {
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
}