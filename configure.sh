#! /bin/bash

echo "#!/bin/sh" > .git/hooks/pre-commit
echo './doc-resources/update-repo-docs.sh' >> .git/hooks/pre-commit 
for dir in internal/generator; do
  (cd $dir && npm install)
  echo "(cd "$dir" && NODE_OPTIONS=--openssl-legacy-provider npm run build && git add dist/)" >> .git/hooks/pre-commit
done

chmod +x .git/hooks/pre-commit 
