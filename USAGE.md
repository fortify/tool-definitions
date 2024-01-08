
<!-- START-INCLUDE:repo-usage.md -->

## Usage instructions

The primary goal of the tool definition files hosted in this repository is for Fortify tool installations using either [fcli](https://github.com/fortify/fcli) or the Fortify [setup](https://github.com/fortify/github-action/?tab=readme-ov-file#fortifygithub-actionsetup) GitHub Action. Please see the corresponding documentation for more information on how to use these tool definition files. 

Current versions of tool installation files are in the `v1` directory of this repository, both as individual yaml files and combined in the `v1/tool-definitions.yaml.zip` file. For [fcli](https://github.com/fortify/fcli) and the Fortify [setup](https://github.com/fortify/github-action/?tab=readme-ov-file#fortifygithub-actionsetup) GitHub Action, only the zip-file is used.

### Customized tool definitions

In some cases, customers may choose to host their own modified versions of these tool definitions. For example, such modified tool definition files could list only a subset of tool versions that are allowed to be installed by end users, or the download URLs could point to internally hosted tool installation bundles. The latter is especially useful to allow for tool installations on systems that are not allowed to download tool installation bundles from github.com or tools.fortify.com.

To accomplish this, customers can simply:
* Download a copy of all current tool definition yaml files (or the zip-file)
* Modify these yaml files as needed, for example:
    * Remove some of the versions listed in the yaml files to disallow end users from installing these versions through [fcli](https://github.com/fortify/fcli) and the Fortify [setup](https://github.com/fortify/github-action/?tab=readme-ov-file#fortifygithub-actionsetup) GitHub Action
    * Remove version aliases to require users to specify a specific version when installing tools, not allowing 'latest' or 'v1' for example
    * Change download URLs to point to an internal copy of the tool installation bundles
* Create a new zip-file containing all tool definition files
* Configure [fcli](https://github.com/fortify/fcli) or the Fortify [setup](https://github.com/fortify/github-action/?tab=readme-ov-file#fortifygithub-actionsetup) GitHub Action to use the customized tool definitions zip-file
    
Some notes:
* The structure of the yaml files should be kept intact
* The names of the yaml files should be kept intact; all existing yaml files must be included in the zip-file
* The file signature of each tool artifact should be kept intact; if you change download URLs, these must point to an exact copy of the original artifact
* You should regularly verify that contents of your customized yaml files are still up to date, for example:
    * Add new tool versions
    * Add new properties for existing tool definition to allow for new [fcli](https://github.com/fortify/fcli) or the Fortify [setup](https://github.com/fortify/github-action/?tab=readme-ov-file#fortifygithub-actionsetup) GitHub Action functionality to function correctly
    
### Custom integrations

Where needed, custom integrations may use these tool definition files to allow for downloading the various tool artifacts. To allow for the use cases described in the previous section, ideally such integrations should by default download the latest tool definitions from this repository, but allow for overriding the tool definitions URL/location to allow for customized tool definitions to be used. Information about current tool definition yaml file structure is in the next section.

### Tool definition v1 file structure

Following is a general description of the tool definition yaml file structure:

```yaml
schema_version: 1.0        # Version of the yaml schema used for this file
versions:                  # Top-level element listing all tool versions
  - version: 1.0.0         # Single tool version definition
    aliases:               # Optional list of version aliases, primarily
      - latest             # used to define semantic version numbers/aliases
      - "1"
      - "1.0"
    stable: true           # Boolean indicating whether this is a stable version
    artifacts:
      <type/platform>:     # 'default' for cross-platform artifacts, or
                           # <linux|darwin|windows>/<x86|x64|arm64> for
                           # platform-specific artifacts
        downloadUrl: ...   # Download URL for this artifact
        rsa_sha256: ...    # Base64-encoded RSA SHA256 signature for the artifact, 
                           # can be verified using id_rsa.pub in the root of the
                           # tool-definitions repository
                    
```


    

<!-- END-INCLUDE:repo-usage.md -->


---

*[This document was auto-generated from USAGE.template.md; do not edit by hand](https://github.com/fortify/shared-doc-resources/blob/main/USAGE.md)*
