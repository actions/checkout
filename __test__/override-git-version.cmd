
mkdir override-git-version
cd override-git-version
echo @echo override git version 1.2.3 > git.cmd
echo "%CD%" >> $GITHUB_PATH
cd ..
