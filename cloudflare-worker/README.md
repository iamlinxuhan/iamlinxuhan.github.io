# 下载加速 Worker 部署指南

项目子页面里的下载按钮指向：

```
https://dl.linxuhan.top/<项目>/<tag>/<文件名>
```

例如：

```
https://dl.linxuhan.top/NCM-Studio/v4.0.1/ncm-studio-windows-x86_64-setup.exe
https://dl.linxuhan.top/GomokuAI/v4.3.1/GomokuAI_Windows_amd_x86_64_setup.exe
```

这个地址由 Cloudflare Worker 转发到 GitHub Release，并把文件缓存在 Cloudflare 边缘节点。
第一次下载会回源 GitHub，之后同一节点再有人下载就直接走缓存，国内访问会稳定很多。

Worker 只放行 `GomokuAI` 和 `NCM-Studio` 两个仓库、只接受符合规则的文件名，不保存任何密钥。

---

## 一、创建 Worker

> **Workers & Pages 在「账户」层级，不在某个域名的侧边栏里。**
> 如果你现在看到的是「概述 / DNS / SSL / Workers 路由」这种域名菜单，
> 说明还在域名内部：点左上角账号名或 **Back to Domains** 回到账户首页。
> 直接打开这个地址最快：
> <https://dash.cloudflare.com/?to=/:account/workers-and-pages>

1. 打开上面的地址，确认页面标题是 **Workers & Pages**。
2. 点 **Create application** → **Create Worker**。
3. 名称填写 `linxuhan-dl`，点 **Deploy**。
4. 部署完成后点 **Edit code**（编辑代码），把编辑器里的默认代码全部删掉。
5. 打开本目录的 [`worker.js`](worker.js)，全选复制，粘贴进编辑器。
6. 点右上角 **Deploy**。看到 “Deployed” 就成功了。

此时 Worker 会有一个 `https://linxuhan-dl.<你的账号>.workers.dev` 的地址，可以先访问：

```
https://linxuhan-dl.<你的账号>.workers.dev/NCM-Studio/v4.0.1/SHA256SUMS
```

能下载到文件，说明转发逻辑没问题。接下来把它绑到自己的域名上。

## 二、绑定 `dl.linxuhan.top`

Worker 详情页 → **域**（Domains）标签页，在「自定义域和路由」里操作。两种方式任选其一。

**方法 A：自定义域名**

1. 点 **添加域名**，填 `dl.linxuhan.top`，确认。
2. Cloudflare 会自动建一条代理 DNS 记录并签发证书，状态变成 **活动** 即可。

**方法 B：路由**（方法 A 提示「没有区域匹配」时用这个）

1. 点 **添加路由**。
2. **区域** 选 `linxuhan.top`——这个框只认主域名，不要填 `dl.linxuhan.top`。
3. **路由** 填 `dl.linxuhan.top/*`（结尾的 `/*` 不能少）。
4. 环境选 **生产环境**，保存。路由通常几十秒内生效。

> 不要用「连接域名 / Connect a domain」：它只能连整块区域，会把整个站点都接管给 Worker。
>
> 英文界面分别是 **Custom domain** / **Route**，区域即 Zone。

> 如果提示域名已被占用，先到 **DNS → Records** 看看有没有旧的 `dl` 记录，删掉再加。
>
> 如果 `linxuhan.top` 不在当前 Cloudflare 账号里，就先用 `workers.dev` 地址：
> 把 `NCM-Studio/index.html` 和 `GomokuAI/index.html` 里的
> `https://dl.linxuhan.top` 全部替换成你的 `https://linxuhan-dl.<账号>.workers.dev`：
>
> ```bash
> WORKER_URL="https://linxuhan-dl.YOUR_SUBDOMAIN.workers.dev"
> sed -i "s#https://dl\.linxuhan\.top#${WORKER_URL}#g" \
>   NCM-Studio/index.html GomokuAI/index.html
> ```
>
> 把 `YOUR_SUBDOMAIN` 换成控制台显示的那一段即可。

**先部署 Worker、确认 `dl.linxuhan.top` 可用，再推送这两个子页面。**
否则页面上的下载按钮会暂时返回 404；此时页底的「GitHub Releases」链接仍然可用。

## 三、验证

先确认转发与响应头（`-I` 只发 HEAD，不下载文件；HEAD 不参与缓存）：

```bash
curl -I https://dl.linxuhan.top/NCM-Studio/v4.0.1/ncm-studio-windows-x86_64-setup.exe
```

预期看到 `HTTP/2 200` 和：

```
content-disposition: attachment; filename="ncm-studio-windows-x86_64-setup.exe"
```

再用小文件验证缓存（`SHA256SUMS` 只有几百字节，下载很快）：

```bash
curl -sD - -o /dev/null https://dl.linxuhan.top/NCM-Studio/v4.0.1/SHA256SUMS
```

第一次或换一个边缘节点时看到 `x-download-cache: MISS`；
在同一个节点上再执行一次，它会变成 `HIT`，说明缓存生效：

```
cache-control: public, max-age=31536000, immutable
x-download-cache: HIT
```

断点续传测试（只取前 1024 字节）：

```bash
curl -L -r 0-1023 -o /tmp/part.bin \
  https://dl.linxuhan.top/NCM-Studio/v4.0.1/ncm-studio-linux-x86_64.AppImage
ls -l /tmp/part.bin   # 应该是 1024 字节
```

大文件第一次下载时，Worker 会一边回源一边把响应写进缓存；文件越大，第一次的等待越接近直连 GitHub。
之后再下载就是边缘缓存的速度。

## 四、缓存的几条规则

- 下载文件按 **tag** 区分，同一个 tag 的文件不会变，所以缓存一年是安全的。
- 缓存键不含查询参数；页面链接不需要加 `?v=`。
- Range 请求（断点续传）直接回源，不写缓存，因此不会把残缺片段缓存下来。
- Cloudflare 免费计划的单文件缓存上限是 512 MB，本项目的安装包都远小于这个数。
- 发布新版本后，页面里的 tag 会变成新版本，新文件自动走新的缓存键。旧缓存到期后自动清理，不需要手动操作。
- 如果确实需要立刻清掉某个文件：Cloudflare 控制台 → **Caching** → **Cache Purge** → 按完整 URL 清除。

## 五、更新页面里的版本

发新版后需要改两处：

1. `NCM-Studio/index.html` 或 `GomokuAI/index.html`：
   - 页首的 `<span class="version">v4.0.1</span>`；
   - 下载区的「最新版本 · v4.0.1」；
   - 每个下载链接中的 `/v4.0.1/`；
   - `SHA256SUMS` 链接（仅 NCM-Studio）。
2. `readmes/NCM-Studio.md`、`readmes/GomokuAI.md`：
   重新从项目仓库复制一份中文 README，保持页面内容与仓库一致。
   徽章已经改成本地 SVG，放在 `readmes/assets/<项目>/assets/badges/`；
   NCM-Studio 的截图放在 `readmes/assets/NCM-Studio/docs/screenshots/`，
   README 若有新截图，记得一并复制过来。

## 六、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| `404 未知的项目或文件名` | 项目名只能是 `GomokuAI` / `NCM-Studio`；文件名只能包含字母、数字、`.`、`_`、`+`、`-` |
| `404 上游返回 404` | tag 或文件名写错，或 Release 还没发布；到 GitHub Releases 页面核对 |
| 自定义域名一直 `Pending` | DNS 记录冲突，或证书签发需要几分钟；检查 **DNS → Records** |
| 下载速度仍然很慢 | 第一次是回源 GitHub；再试一次，响应头里看 `x-download-cache` 是否为 `HIT` |
| `curl` 返回 `522` | 回源超时，通常是 GitHub 暂时不可达；稍后重试 |
| 浏览器下载的是网页而不是文件 | 检查 URL 是否指向了 GitHub 的 release 页面而不是具体资产文件名 |

## 七、可选：用 Wrangler 部署

不想在网页编辑器里粘贴，也可以用命令行：

```bash
npm install -g wrangler
wrangler login
wrangler deploy cloudflare-worker/worker.js --name linxuhan-dl
```

自定义域名仍然在控制台的 **Settings → Domains & Routes** 里添加。
