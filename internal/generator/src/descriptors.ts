import * as core from '@actions/core';
import * as constants from './constants';
import * as crypto from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'path';
import { default as Stream } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import * as semver from 'semver'

/** 
 * This module defines various classes that hold version and artifact
 * data, combined with various utility methods operating on those versions
 * and artifacts.
*/

/**
 * This class holds zero or more VersionDescriptor instances, providing
 * regular Array methods as well as some methods specific to VersionDescriptors. 
 */
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

/**
 * This class holds information about an individual version, like version 
 * name/number, version aliases and artifacts belonging to this version. 
 * Several utility methods are available, for example for comparing instances
 * of this class, adding new artifacts, and for adding the appropriate aliases.
 */
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
            if ( this.version==semver.maxSatisfying(allVersions, "*", false) ) {
                this.aliases.push('latest');    
            }
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

/** 
 * This class holds information about artifacts, like download URL and
 * hashes/signatures. Instances of this class are usually created through
 * the PartialArtifactDescriptor::asArtifactDescriptor method.
 * 
 * Note that PartialArtifactDescriptor will cache instances of this class;
 * when adding/renaming properties in this class, existing cache entries
 * must be manually removed in order to regenerate the previously cached
 * entries.
 * 
 * As such, ideally this class should only contain properties that are
 * relatively expensive to calculate, thereby reducing the need to 
 * (frequently) add or rename properties.
*/
export class ArtifactDescriptor {
    constructor(downloadUrl : string, rsa_sha256: string, sha256: string) {
        this.downloadUrl = downloadUrl;
        this.rsa_sha256 = rsa_sha256;
        this.sha256 = sha256;
    }
    downloadUrl : string;
    rsa_sha256 : string;
    sha256 : string;
}

/** 
 * This class partially defines an artifact (only download URL for now), and can be used 
 * to generate a complete ArtifactDescriptor instance through the asArtifactDescriptor()
 * method on this class. ArtifactDescriptor instances will be cached; if no cache entry
 * is found for a given version and download URL, this class will calculate the various
 * ArtifactDescriptor properties and generate a new cache entry for the new ArtifactDescriptor
 * instance.
*/
export class PartialArtifactDescriptor {
    static #cacheDir = `${constants.workspaceDir}/internal/cache/${constants.toolName}`;
    constructor(downloadUrl : string) {
        this.downloadUrl = downloadUrl;
    }
    downloadUrl : string;
    
    async asArtifactDescriptor(versionDescriptor: VersionDescriptor) : Promise<ArtifactDescriptor> {
        const cacheFileName = this.#getCacheFileName(versionDescriptor.version, this.downloadUrl);
        if ( fs.existsSync(cacheFileName) ) {
            core.info(`Resolved from cache: ${cacheFileName}`);
            return JSON.parse(fs.readFileSync(cacheFileName).toString()) as ArtifactDescriptor;
        } else {
            core.info(`Generating data for ${this.downloadUrl}`);
            const fullArtifactDescriptor = await this.#createArtifactDescriptor(this.downloadUrl);
            if ( versionDescriptor.stable ) {
                // Only write cache entry for stable versions
                core.info(`Caching data for ${this.downloadUrl}`);
                await fs.ensureFile(cacheFileName);
                await fs.writeFile(cacheFileName, JSON.stringify(fullArtifactDescriptor, null, 2), "utf-8");
            }
            return fullArtifactDescriptor;
        }
    }

    #getCacheFileName(version: string, downloadUrl: string) : string {
        const url = new URL(downloadUrl);
        const name = `${PartialArtifactDescriptor.#cacheDir}/${version}-${path.basename(url.pathname)}.json`;
        return name;
    }
    
    async #createArtifactDescriptor(downloadUrl: string) : Promise<ArtifactDescriptor> {
        const sign = crypto.createSign('RSA-SHA256');
        const hash = crypto.createHash('sha256');
        const response = await fetch(downloadUrl);
        const readable = Stream.Readable.fromWeb(response.body as ReadableStream<Uint8Array>)
        // For some reason, readable.pipe(sign).pipe(hash) doesn't work
        for await (const chunk of readable) {
            sign.update(chunk);
            hash.update(chunk);
        }
        const rsa_sha256 = sign.sign({key: constants.signKey, passphrase: constants.signPassphrase}, "base64");
        const sha256 = hash.digest('hex');
        return new ArtifactDescriptor(downloadUrl, rsa_sha256, sha256);
    }
}