[![构建和测试](https://github.com/actions/checkout/actions/workflows/test.yml/badge.svg)](https://github.com/actions/checkout/actions/workflows/test.yml)

#签出V4

此操作将在下签出您的存储库`$GITHUB_WORKSPACE`，以便您的工作流可以访问它。

对于触发工作流的ref/SHA，默认情况下只提取一个提交。一组`提取深度:0`获取所有分支和标签的所有历史记录。参考[这里](https://docs.github.com/actions/using-workflows/events-that-trigger-workflows)为了了解哪个提交`$GITHUB_SHA`指向不同的事件。

auth令牌保存在本地git配置中。这使您的脚本能够运行经过身份验证的git命令。该令牌在作业后清理过程中被删除。一组`坚持-凭据:错误`选择退出。

当Git 2.18或更高版本不在您的路径中时，回退到REST API来下载文件。

#怎么样

请参考[发布页面](https://github.com/actions/checkout/releases/latest)获取最新的发行说明。

#使用

<!-开始使用->
```亚姆
- uses: actions/checkout@v4
使用:
#带有所有者的存储库名称。例如，动作/签出
# Default:$ { { github。知识库} }
存储库:“”

#要结帐的分支、标签或SHA。当签出存储库时
#触发了工作流，这默认为该事件的参考或SHA。
#否则，使用默认分支。
引用:“”

#用于获取存储库的个人访问令牌(PAT)。PAT已配置
#使用本地git配置，这使您的脚本能够运行经过身份验证的git
#命令。作业后步骤移除PAT。
    #
#我们建议使用所需权限最少的服务帐户。也
#生成新PAT时，选择最少的必要范围。
    #
#[了解有关创建和使用加密机密的更多信息](https://help . github . com/en/actions/automating-your-workflow-with-github-actions/creating-and-use-encrypted-secrets)
    #
# Default: ${{ github.token }}
令牌:“”

#用于获取存储库的SSH密钥。SSH密钥是用本地配置的
# git config，它使您的脚本能够运行经过身份验证的git命令。这
#作业后步骤删除SSH密钥。
    #
#我们建议使用所需权限最少的服务帐户。
    #
#[了解有关创建和使用加密机密的更多信息](https://help . github . com/en/actions/automating-your-workflow-with-github-actions/creating-and-use-encrypted-secrets)
ssh-key:" "

#除用户和全局主机密钥数据库之外的已知主机。公开的宋承宪
#可以使用实用程序“ssh-keyscan”获得主机的密钥。举个例子，
# ` ssh-keyscan github。com `github.com的公钥总是隐式的
#已添加。
嘘已知主机:""

#是否执行严格的主机密钥检查。为真时，添加选项
# `StrictHostKeyChecking=yes '和` CheckHostIP =否'到嘘命令行。使用
#输入“嘘——已知主机"来配置其他主机。
#默认值:真
ssh-strict:" "

#连接到远程SSH主机时使用的用户。默认情况下，“git”是
#已使用。
#默认值:git
ssh-用户:“”

#是否使用本地git配置来配置令牌或SSH密钥
#默认值:真
持久凭据:“”

#放置存储库的GITHUB _ WORKSPACE下的相对路径
路径:“”

#何鸿燊的《去清理ffdx &去重置硬盘头》
#默认值:真
清理:“”

#根据给定的过滤器部分克隆。如果设置，则覆盖稀疏校验。
#默认值:空
筛选器:“”

#对给定的模式进行稀疏校验。每个模式都应该用
#新线条。
#默认值:空
稀疏签出:“”

#指定执行稀疏检出时是否使用锥形模式。
#默认值:真
稀疏校验锥形模式:“”

#要提取的提交数量。0表示所有分支和标记的所有历史记录。
#默认值:1
提取深度:“”

#是否提取标记，即使提取深度> 0。
#默认值:假
提取标记:“”

#提取时是否显示进度状态输出。
#默认值:真
显示进度:“”

#是否下载吉特-LFS文件
#默认值:假
lfs:" "

#是否签出子模块:`真的'表示签出子模块,或`递归'表示
#递归签出子模块。
    #
#当没有提供" ssh-key "输入时，SSH URLs以
# `git@github.com:`皈依HTTPS教。
    #
#默认值:假
子模块:“”

#通过运行“git”，将存储库路径添加为饭桶全局配置的safe.directory
#配置-全局-添加保险箱。目录<路径>`
#默认值:真
set-safe-directory:" "

#您尝试从中克隆的开源代码库实例的基本统一资源定位器将使用
#环境默认从工作流所在的同一实例中提取
#除非特别说明,否则从开始运行网址。的例子有https://github.com或
# https://my-ghes-server.example.com
github-服务器-url:" "
```
<!-结束使用-->

#情节

- [仅获取根文件](#只提取根文件)
- [只获取根文件`。开源代码库`和`科学研究委员会`文件夹](#只取根文件和github-和-src-文件夹)
- [仅获取一个文件](#只取一个文件)
- [获取所有标签和分支的所有历史记录](#获取所有标签和分支的所有历史记录)
- [签出不同的分支](#结帐-不同的分行)
- [结账头](#结帐头)
- [签出多个回购(并排)](#结帐-多个回购-并排)
- [签出多个回购(嵌套)](#结帐-多重回购-嵌套)
- [签出多个回购(私有)](#结帐-多次回购-私人)
- [签出拉请求头提交而不是合并提交](#检查出-拉出-请求-头部-提交-合并-提交)
- [已关闭事件的签出请求](#结帐-拉取-关闭时请求-事件)
- [使用内置令牌推送提交](#使用内置令牌推送提交)

##仅获取根文件

```亚姆
- uses: actions/checkout@v4
使用:
稀疏检出:。
```

##只获取根文件`。开源代码库`和`科学研究委员会`文件夹

```亚姆
- uses: actions/checkout@v4
使用:
稀疏校验:
。开源代码库
科学研究委员会
```

##仅获取一个文件

```亚姆
- uses: actions/checkout@v4
使用:
稀疏校验:
README.md
稀疏校验圆锥模式:假
```

##获取所有标签和分支的所有历史记录

```亚姆
- uses: actions/checkout@v4
使用:
提取深度:0
```

##签出不同的分支

```亚姆
- uses: actions/checkout@v4
使用:
参考:我的分行
```

##结账头

```亚姆
- uses: actions/checkout@v4
使用:
提取深度:2
-运行:git结帐头
```

##签出多个回购(并排)

```亚姆
-名称:结帐
用途：动作/结帐@v4
使用:
路径:主路径

-名称:结帐工具回购
用途：动作/结帐@v4
使用:
存储库:我的组织/我的工具
路径:我的工具
```
> -如果您的辅助存储库是私有的，您需要添加中注明的选项[签出多个回购(私有)](#结帐-多次回购-私人)

##签出多个回购(嵌套)

```亚姆
-名称:结帐
用途：动作/结帐@v4

-名称:结帐工具回购
用途：动作/结帐@v4
使用:
存储库:我的组织/我的工具
路径:我的工具
```
> -如果您的辅助存储库是私有的，您需要添加中注明的选项[签出多个回购(私有)](#结帐-多次回购-私人)

##签出多个回购(私有)

```亚姆
-名称:结帐
用途：动作/结帐@v4
使用:
路径:主路径

-名称:结账专用工具
用途:动作/结帐@v4
使用:
存储库:我的组织/我的私有工具
令牌:${{机密。GH_PAT }} # `GH_PAT '是包含您的小块的秘密
路径:我的工具
```

> - `${{ github.token }}`的范围是当前存储库，所以如果您想签出一个不同的私有存储库，您需要提供自己的存储库[小块](https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line).


##签出拉请求头提交而不是合并提交

```yaml
- uses: actions/checkout@v4
使用:
ref:$ { { github。事件。拉取请求。头。sha } }
```

##已关闭事件的签出请求

```yaml
开启:
拉取请求:
分支:[主]
类型:[打开、同步、关闭]
工作:
构建:
运行:Ubuntu-最新版
步骤:
- uses: actions/checkout@v4
```

##使用内置令牌推送提交

```yaml
开:推
工作:
构建:
运行:Ubuntu-最新版
步骤:
- uses: actions/checkout@v4
-运行:
date > generated.txt
#注意：以下帐户信息不适用于GHES
饭桶配置user.name "github-actions[bot]"
饭桶配置用户。邮箱" 41898282+github-actions[bot]@用户。没有回复github .com "
饭桶添加。
饭桶提交-m "生成"
饭桶推送
```
*注意:*用户电子邮件是`{user.id}+{user.login}@users.noreply.github.com`。请参阅用户应用程序接口:https://api.github.com/users/github-actions%5Bbot%5D

#许可证

这个项目中的脚本和文档发布在[麻省理工学院许可证](许可证)
