# 仓库指南

## 项目结构与模块组织

Python 入口文件 `__init__.py` 负责将编译后的前端注册到 ComfyUI。项目和注册表元数据位于 `pyproject.toml`。前端开发位于 `ui/`：React/TypeScript 源代码放在 `ui/src/`，共享工具放在 `ui/src/utils/`，测试放在 `ui/src/__tests__/`，翻译文件放在 `ui/public/locales/{en,zh}/`。Vite 会将生成的资源写入根目录下的 `dist/`；不要手动编辑生成文件。GitHub 发布自动化配置位于 `.github/workflows/react-build.yml`。

## 构建、测试与开发命令

前端命令应在 `ui/` 目录中运行：

- `npm ci`：按照 `package-lock.json` 安装精确版本的依赖。
- `npm run dev`：启动 Vite 开发服务器；默认 ComfyUI 运行在 `127.0.0.1:8188`。
- `npm run watch`：持续将扩展重新构建到 `../dist/`，用于本地 ComfyUI 测试。
- `npm run build`：执行类型检查并创建生产构建。
- `npm run lint`、`npm run typecheck` 和 `npm test`：分别运行 ESLint、TypeScript 检查和 Jest 测试。

Python 工具命令应在仓库根目录运行。首次使用或依赖发生变化时，运行 `uv sync --extra dev` 初始化或更新本地环境。日常静态检查使用 `uv run ruff check .` 和 `uv run mypy`。使用 `uv run ruff format --check __init__.py prompt_all_in_one/*.py tests/*.py` 检查 Python 格式，使用 `uv run pytest` 运行后端测试。

## 编码风格与命名约定

按照 `.editorconfig` 的定义，文件使用 UTF-8 编码、LF 换行符、末尾换行，并且不得包含行尾空格。Python 使用四个空格缩进、snake_case 命名、Ruff 格式化以及严格的 mypy 类型检查。前端文件的格式以 Prettier 和 ESLint 为准；提交前运行 `npm run format` 和 `npm run lint:fix`。React 组件使用 PascalCase 命名（如 `App.tsx`），工具文件使用 camelCase 或具有描述性的小写名称（如 `i18n.ts`），测试文件使用 `.test.ts` 或 `.test.tsx` 后缀。面向用户的字符串应同时维护在两种语言文件中，不要直接写在组件里。

## 测试指南

Jest 和 React Testing Library 在 jsdom 中运行。组件测试放在 `ui/src/__tests__/` 中，应测试可观察行为而不是实现细节。目前未设置覆盖率阈值，但新增功能和回归修复都应包含针对性测试。Python 测试从 `tests/` 目录发现；添加后端逻辑时，应在该目录中创建 `test_*.py` 文件。

## 提交与拉取请求指南

Git 提交消息必须使用简体中文。使用简短的祈使句主题，可选择添加作用域和 Conventional Commits 类型，例如 `feat(ui): 新增提示词历史面板`。需要提交正文时，也应使用简体中文说明主要变更。每个提交应保持聚焦。拉取请求应说明修改动机和用户可见行为、关联相关问题、列出验证命令，并为 UI 变更附上截图或录屏。禁止提交 API 密钥或本地环境文件；注册表凭据应存储在 GitHub Secret `REGISTRY_ACCESS_TOKEN` 中。
