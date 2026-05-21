import * as core from '@actions/core';
import * as constants from './constants';
import * as crypto from 'node:crypto';
import * as fs from 'fs-extra';
import * as path from 'node:path';
import yazl from 'yazl';

/**
 * This module handles the "dir" mode: takes a directory, creates a zip
 * containing each file alongside its detached RSA-SHA256 signature file
 * (<filename>.rsa_sha256), and writes the result to v1/<toolName>.zip.
 */

function signFile(content: Buffer): string {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(content);
    return sign.sign({key: constants.signKey, passphrase: constants.signPassphrase}, 'base64');
}

export async function pack(dir: string): Promise<void> {
    const sourceDir = path.resolve(constants.workspaceDir!, dir);
    const outputDir = path.resolve(constants.workspaceDir!, 'v1');
    const outputPath = path.join(outputDir, `${constants.toolName}.zip`);

    if (!fs.existsSync(sourceDir)) {
        throw new Error(`Directory not found: ${sourceDir}`);
    }

    await fs.ensureDir(outputDir);

    const files = fs.readdirSync(sourceDir).filter(f => {
        const stat = fs.statSync(path.join(sourceDir, f));
        return stat.isFile();
    });

    if (files.length === 0) {
        throw new Error(`No files found in directory: ${sourceDir}`);
    }

    core.info(`Packing ${files.length} file(s) from ${sourceDir} into ${outputPath}`);

    const zipfile = new yazl.ZipFile();

    for (const file of files) {
        const filePath = path.join(sourceDir, file);
        const content = fs.readFileSync(filePath);
        zipfile.addBuffer(content, file);

        const signature = signFile(content);
        zipfile.addBuffer(Buffer.from(signature, 'utf-8'), `${file}.rsa_sha256`);
        core.info(`  Added ${file} + ${file}.rsa_sha256`);
    }

    zipfile.end();

    await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(outputPath);
        zipfile.outputStream.pipe(output);
        output.on('close', resolve);
        output.on('error', reject);
    });

    const stat = fs.statSync(outputPath);
    core.info(`Created ${outputPath} (${stat.size} bytes)`);
}
