# Folio 部署

Folio 是静态网页。解析、书目处理、MD 转 PDF、封面与导出在浏览器执行；服务器只提供 HTML、脚本、字体和演示资源，不接收书籍文件。

## Netlify 一键创建站点

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/XmyHee/folio-library)

1. 点击按钮，在 Netlify 按提示登录、授权和创建站点。
2. 仓库中的 `netlify.toml` 使用 Node.js 22、`npm run build` 和 `dist`，设置 `FOLIO_BASE_PATH=/`。
3. 完成后访问平台分配的 HTTPS 地址。先用合成或可公开的样例确认导入、刷新恢复和导出，再添加自己的文件。

按钮采用 [Netlify 官方部署入口](https://docs.netlify.com/deploy/create-deploys/#deploy-to-netlify-button)。本项目不代您创建第三方账户或接受服务条款。平台托管代码和静态资源，书籍不进入构建或托管服务器。

## Docker 一条命令启动

安装 Docker Engine / Docker Desktop，确认引擎已就绪。下载仓库 ZIP 并解压，或克隆仓库，然后在项目目录运行：

```sh
docker compose up --build -d
```

打开 <http://localhost:8080/>，自动进入 `/folio-library/`。默认端口仅绑定本机回环地址。Windows 若 Docker 提示需要管理员权限，请在系统中完成授权；不需要关闭安全保护或修改脚本执行策略。

查看状态与停止：

```sh
docker compose ps
docker compose down
```

容器不包含书籍数据库，也不挂载书库目录；停止容器不会清理浏览器书库。浏览器站点数据仍需自行备份。更新代码后重新执行启动命令即可构建新版。首次构建依赖网络，离线前应完成镜像与依赖准备。

Dockerfile 使用 Node.js 构建和 Nginx 静态服务。配置显式处理 PDF `.mjs` worker 的 JavaScript MIME 类型，并提供容器健康检查。GitHub Actions 会实际构建镜像、启动容器、检查 HTML / JS / CSS / worker / 字体，成功后才发布 Pages。

## 其他静态托管

默认 GitHub Pages 子路径：

```sh
npm ci
npm run check
```

把 `dist` 的内容发布到站点的 `/folio-library/` 目录。若站点以根路径发布，构建时设置 `FOLIO_BASE_PATH=/`：

```sh
FOLIO_BASE_PATH=/ npm run build
```

PowerShell：

```powershell
$env:FOLIO_BASE_PATH = "/"
npm run build
```

其他子目录使用带首尾斜杠的路径，例如 `/books/`。托管方应将 `.js` / `.mjs` 作为 JavaScript，`.css` 作为 CSS 提供，并保留 `fonts/` 中的字体文件。公网使用 HTTPS；本机 `localhost` 可以通过 HTTP 使用 Web Crypto 和工作线程。

## 离线与隐私边界

- 完整本地部署包含中文字体和工作线程。关闭“联网补全书目（ISBN）”后，核心导入、校正、封面、MD 转 PDF 和导出不依赖互联网服务。
- ISBN 联网开启时，会向 Google Books / Open Library 发送 ISBN；不发送书籍正文或文件。
- 本地服务需保持运行。在线站点没有 Service Worker 离线安装机制，浏览器缓存不保证断网后可重新打开。
- 云端静态托管方会收到正常网站访问请求。书库保存在浏览器，不在托管平台或 Docker 容器中；切换来源不会自动迁移书库。
- 无需上传文件不等于无限容量；单次 ZIP 内容上限 256 MiB，大库应分批处理。

开发者可在安装 Node.js 并完成本地 `npm run build` 后，对已运行的站点执行资源检查：

```sh
node deploy/check-static.mjs http://localhost:8080/folio-library/
```

这项检查验证静态资源路径、类型和字体；真实文件选择、转换与下载仍需浏览器实测。
