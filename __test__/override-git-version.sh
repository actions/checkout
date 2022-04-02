#!/bin/sh

mkdir override-git-version
cd override-git-version
echo "#!/bin/sh" > git
echo "echo override git version 1.2.3" >> git
chmod +x git
echo "$(pwd)" >> $GITHUB_PATH
cd ..
