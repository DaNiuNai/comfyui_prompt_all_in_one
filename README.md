# comfyui-prompt-all-in-one

面向 ComfyUI 的提示词编辑、整理和翻译扩展。项目由
[`sd-webui-prompt-all-in-one`](https://github.com/Physton/sd-webui-prompt-all-in-one)
迁移而来，使用两个专用 `STRING` 节点和 React 侧边栏代替 A1111 固定的正/负提示词输入框。

## 功能

- `Prompt All in One · Positive` 与 `Prompt All in One · Negative` 两个 V3 节点，原样输出 `STRING`。
- 标签拆分、直接编辑、拖拽排序、批量启用/禁用/删除、权重增减、括号包装、格式化和黑名单。
- 完整中英文分组提示词词库，支持搜索和一键插入。
- 正向、负向分别保存最近 100 条编辑历史，并提供独立收藏夹。
- 原项目的在线翻译服务以及兼容 OpenAI API 的提示词生成。
- 检测 ComfyUI 已安装的 Checkpoint、LoRA 和 Embedding 引用。
- 简体中文和英文界面，适配 ComfyUI 明暗主题。
- 按 ComfyUI 用户隔离历史、收藏、设置和服务凭据。
- 从旧版 `storage` 文件夹一次性导入历史、收藏和非敏感设置。

## 安装

推荐通过 ComfyUI Manager 搜索 `comfyui-prompt-all-in-one` 安装。

手动开发安装：

```powershell
Set-Location E:\ComfyUI-Dev\custom_nodes
git clone https://github.com/DaNiuNai/comfyui_prompt_all_in_one.git
Set-Location .\comfyui_prompt_all_in_one
uv pip install --python ..\..\.venv\Scripts\python.exe -r requirements.txt
Set-Location .\ui
npm ci
npm run build
```

完成后重启 ComfyUI。发布包通常已经包含 `dist/`，只有直接从源码开发时才需要手动构建前端。

## 使用

1. 在工作流中添加正向或负向 Prompt All in One 节点。
2. 选中节点，然后打开左侧的 Prompt All in One 标签页；也可以点击节点上的 `Open Prompt Editor`。
3. 在侧边栏编辑标签，将节点的 `STRING` 输出连接到对应的文本编码节点。
4. 编辑框失焦、切换节点或完成编辑时会写入历史；连续相同内容不会重复保存。

节点上的标准多行文本框始终可直接编辑。侧边栏保存的禁用状态、译文和排序信息随工作流节点属性一起序列化，实际输出仍是普通字符串。

### LoRA 与模型检测

侧边栏只检测 `<lora:name:weight>`、`embedding:name` 和 `checkpoint:name` 引用是否存在。ComfyUI 不会像 A1111 一样解析 `<lora:...>` 并自动加载模型；必须在工作流中使用 LoRA Loader 等对应节点。

### 旧数据导入

在“设置 → 导入旧数据”中选择旧项目的 `storage` 文件夹：

- `txt2img` 与 `img2img` 历史合并到正向分类。
- `txt2img_neg` 与 `img2img_neg` 合并到负向分类。
- 导入采用合并模式，可先预览；重复导入是幂等的。
- API 密钥不会上传或导入，必须在新扩展中重新填写。

浏览器只上传白名单中的 JSON 文件，后端不接受任意服务器磁盘路径。

## 数据与安全

用户数据位于：

```text
ComfyUI/user/<用户 ID>/prompt_all_in_one/
```

服务凭据仅保存在对应用户的服务端 JSON 中，接口只返回脱敏值，日志不会主动输出密钥。凭据目前没有额外加密，请依靠操作系统文件权限保护 ComfyUI 用户目录，并避免将该目录纳入版本控制或公开备份。

翻译和 AI 操作会把所选文本发送到用户配置的第三方服务；普通工作流执行不会触发任何外部请求。离线 mBART、运行时安装依赖、A1111 主题 CSS 和远程自更新不在迁移范围内。

## 开发与验证

前端命令在 `ui/` 中运行：

```powershell
npm ci
npm run typecheck
npm run lint
npm test -- --runInBand
npm run build
```

Python 命令在项目根目录运行：

```powershell
uv sync --extra dev
uv run ruff check .
uv run mypy
uv run pytest
```

`dist/` 是 Vite 生成目录，请勿手工修改。

## 许可证与来源

本项目使用 GPL-3.0-only。迁移的词库、翻译服务元数据和适配器保留原项目的 MIT 许可，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
