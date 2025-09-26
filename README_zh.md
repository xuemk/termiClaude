# TermiClaude

<div align="center">
  <p>
    <a href="README.md">🇺🇸 English</a> | 
    <a href="README_zh.md">🇨🇳 中文</a>
  </p>
</div>

## ✨ 功能特性

### 🗂️ **项目和会话管理**
- **可视化项目浏览器**：在 `~/.claude/projects/` 中浏览所有 Claude Code 项目
- **会话历史**：查看并恢复带有完整上下文的过往编码会话
- **智能搜索**：通过内置搜索快速查找项目和会话
- **会话洞察**：一目了然地查看首条消息、时间戳和会话元数据

### 🤖 **CC 代理**
- **自定义 AI 代理**：创建具有自定义系统提示和行为的专业代理
- **代理库**：为不同任务构建专用代理集合
- **后台执行**：在独立进程中运行代理，实现非阻塞操作
- **执行历史**：跟踪所有代理运行，包含详细日志和性能指标

### 📊 **使用分析仪表板**
- **成本跟踪**：实时监控您的 Claude API 使用情况和成本
- **令牌分析**：按模型、项目和时间段详细分解
- **可视化图表**：显示使用趋势和模式的美观图表
- **数据导出**：导出使用数据用于会计和分析

### 🔌 **MCP 服务器管理**
- **服务器注册表**：从中央 UI 管理模型上下文协议服务器
- **简易配置**：通过 UI 添加服务器或从现有配置导入
- **连接测试**：在使用前验证服务器连接性
- **Claude Desktop 导入**：从 Claude Desktop 导入服务器配置

### ⏰ **时间线和检查点**
- **会话版本控制**：在编码会话的任何时点创建检查点
- **可视化时间线**：通过分支时间线导航会话历史
- **即时恢复**：一键跳转到任何检查点
- **分叉会话**：从现有检查点创建新分支
- **差异查看器**：查看检查点之间的确切变化

### 📝 **CLAUDE.md 管理**
- **内置编辑器**：直接在应用内编辑 CLAUDE.md 文件
- **实时预览**：实时查看 markdown 渲染效果
- **项目扫描器**：查找项目中的所有 CLAUDE.md 文件
- **语法高亮**：完整的 markdown 支持和语法高亮

## 📦 打包方式

### 🚀 快速开始

如果您已经安装了 bun，可以直接使用以下命令打包：

```bash
# 完整生产构建（推荐）- 包含 MSI 和 EXE 安装包
bun run tauri:build

# 只构建 MSI 安装包
npx tauri build --target msi -c src-tauri/tauri.conf.release.json

# 只构建 NSIS EXE 安装包
npx tauri build --target nsis -c src-tauri/tauri.conf.release.json

# 同时构建两种格式
npx tauri build --target "msi,nsis" -c src-tauri/tauri.conf.release.json
```

**输出位置**：`src-tauri/target/release/bundle/`
- MSI 文件：`msi/TermiClaude_1.0.0_x64_en-US.msi`
- EXE 文件：`nsis/TermiClaude_1.0.0_x64-setup.exe`

### 系统要求

#### Windows 平台
- Windows 10/11
- Node.js 18+ 或 Bun
- Rust 工具链
- Tauri CLI
- WiX Toolset v3（用于 MSI 包）
- NSIS（用于 EXE 包，可选）

### 安装依赖

```bash
# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装 Tauri CLI
cargo install tauri-cli

# 或使用 npm/yarn/bun
bun add -g @tauri-apps/cli

# Windows 特定：安装 WiX Toolset
# 下载并安装：https://github.com/wixtoolset/wix3/releases
# 或使用 Chocolatey
choco install wixtoolset

# Windows 特定：安装 NSIS（可选）
# 下载并安装：https://nsis.sourceforge.io/Download
# 或使用 Chocolatey
choco install nsis
```

### 构建流程

1. **准备构建环境**
```bash
# 克隆或更新项目
git pull origin main

# 安装依赖
bun install

# 构建必要的可执行文件
bun run build:executables:current
```

2. **前端构建**
```bash
# 构建前端应用（生产模式）
bun run build
```

3. **后端构建和打包**
```bash
# 完整的生产构建（包含前后端）
bun run tauri:build
```

## ⚙️ 模型配置指南

### 概述

TermiClaude 支持通过环境变量组来配置多个AI模型。每个环境变量组代表一个配置环境（如开发、测试、生产），**同时只能启用一个组**，实现真正的互斥性。

### 环境变量命名约定

#### 模型定义

每个模型需要通过以下环境变量来定义：

```
MID_{序号}          - 模型的唯一标识符（必需）
MNAME_{序号}        - 模型的显示名称（可选，默认使用ID）
MDESC_{序号}        - 模型的描述信息（可选）
```

### Claude配置示例

```
MID_1=claude-3-5-sonnet-20241022
MNAME_1=Claude 3.5 Sonnet
MDESC_1=Anthropic的平衡性能模型

MID_2=claude-3-opus-20240229
MNAME_2=Claude 3 Opus
MDESC_2=最强大的Claude模型

# API配置（必需）
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_AUTH_TOKEN=sk-ant-...
```

### 使用方法

1. **创建环境变量组**
   - 在设置页面的"环境变量"标签页中创建新的环境变量组
   - 为组设置描述性名称（如"Claude生产环境"、"Claude开发环境"等）

2. **添加模型变量**
   - 在组中按照命名约定添加模型相关的环境变量
   - 确保 `MID_*` 变量包含有效的模型标识符
   - 序号从1开始，可以不连续

3. **启用配置（互斥模式）**
   ⚠️ **重要**：同时只能启用一个环境变量组！
   - 启用新组时，所有其他组会自动禁用
   - 启用组后，其中定义的所有模型将在模型选择器中显示
   - 禁用组时，相关模型从选择器中移除

4. **验证配置**
   - 检查模型选择器中是否显示了正确的模型
   - 发送测试消息确认模型可以正常使用
   - 查看控制台日志了解详细的加载信息

### API配置说明

- **API密钥**：所有服务都需要有效的API密钥进行身份验证
- **基础URL**：必须为每个服务提供商正确配置
- **速率限制**：不同提供商有不同的速率限制策略
- **模型名称**：使用各提供商指定的确切模型标识符
- **身份验证**：某些提供商可能需要额外的身份验证令牌
