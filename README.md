# Claudia

<div align="center">
  <p>
    <a href="README.md">🇺🇸 English</a> | 
    <a href="README_zh.md">🇨🇳 中文</a>
  </p>
</div>

## ✨ Features

### 🗂️ **Project & Session Management**
- **Visual Project Browser**: Navigate through all your Claude Code projects in `~/.claude/projects/`
- **Session History**: View and resume past coding sessions with full context
- **Smart Search**: Find projects and sessions quickly with built-in search
- **Session Insights**: See first messages, timestamps, and session metadata at a glance

### 🤖 **CC Agents**
- **Custom AI Agents**: Create specialized agents with custom system prompts and behaviors
- **Agent Library**: Build a collection of purpose-built agents for different tasks
- **Background Execution**: Run agents in separate processes for non-blocking operations
- **Execution History**: Track all agent runs with detailed logs and performance metrics

### 📊 **Usage Analytics Dashboard**
- **Cost Tracking**: Monitor your Claude API usage and costs in real-time
- **Token Analytics**: Detailed breakdown by model, project, and time period
- **Visual Charts**: Beautiful charts showing usage trends and patterns
- **Export Data**: Export usage data for accounting and analysis

### 🔌 **MCP Server Management**
- **Server Registry**: Manage Model Context Protocol servers from a central UI
- **Easy Configuration**: Add servers via UI or import from existing configs
- **Connection Testing**: Verify server connectivity before use
- **Claude Desktop Import**: Import server configurations from Claude Desktop

### ⏰ **Timeline & Checkpoints**
- **Session Versioning**: Create checkpoints at any point in your coding session
- **Visual Timeline**: Navigate through your session history with a branching timeline
- **Instant Restore**: Jump back to any checkpoint with one click
- **Fork Sessions**: Create new branches from existing checkpoints
- **Diff Viewer**: See exactly what changed between checkpoints

### 📝 **CLAUDE.md Management**
- **Built-in Editor**: Edit CLAUDE.md files directly within the app
- **Live Preview**: See your markdown rendered in real-time
- **Project Scanner**: Find all CLAUDE.md files in your projects
- **Syntax Highlighting**: Full markdown support with syntax highlighting

## 📦 Packaging

### 🚀 Quick Start

If you have bun installed, you can directly use the following commands to package:

```bash
# Complete production build (recommended) - includes MSI and EXE installers
bun run tauri:build

# Build MSI installer only
npx tauri build --target msi -c src-tauri/tauri.conf.release.json

# Build NSIS EXE installer only
npx tauri build --target nsis -c src-tauri/tauri.conf.release.json

# Build both formats simultaneously
npx tauri build --target "msi,nsis" -c src-tauri/tauri.conf.release.json
```

**Output Location**: `src-tauri/target/release/bundle/`
- MSI file: `msi/Claudia_0.1.65_x64_en-US.msi`
- EXE file: `nsis/Claudia_0.1.65_x64-setup.exe`

### System Requirements

#### Windows Platform
- Windows 10/11
- Node.js 18+ or Bun
- Rust toolchain
- Tauri CLI
- WiX Toolset v3 (for MSI packages)
- NSIS (for EXE packages, optional)

### Installing Dependencies

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Tauri CLI
cargo install tauri-cli

# Or use npm/yarn/bun
bun add -g @tauri-apps/cli

# Windows specific: Install WiX Toolset
# Download and install: https://github.com/wixtoolset/wix3/releases
# Or use Chocolatey
choco install wixtoolset

# Windows specific: Install NSIS (optional)
# Download and install: https://nsis.sourceforge.io/Download
# Or use Chocolatey
choco install nsis
```

### Build Process

1. **Prepare build environment**
```bash
# Clone or update project
git pull origin main

# Install dependencies
bun install

# Build necessary executables
bun run build:executables:current
```

2. **Frontend build**
```bash
# Build frontend application (production mode)
bun run build
```

3. **Backend build and packaging**
```bash
# Complete production build (includes frontend and backend)
bun run tauri:build
```

## ⚙️ Model Configuration

### Overview

Claudia supports configuring multiple AI models through environment variable groups. Each environment variable group represents a configuration environment (such as development, testing, production), and **only one group can be enabled at a time**, achieving true exclusivity.

### Environment Variable Naming Convention

#### Model Definition

Each model needs to be defined through the following environment variables:

```
MID_{number}          - Model unique identifier (required)
MNAME_{number}        - Model display name (optional, defaults to ID)
MDESC_{number}        - Model description (optional)
```

### Claude Configuration Example

```
MID_1=claude-3-5-sonnet-20241022
MNAME_1=Claude 3.5 Sonnet
MDESC_1=Anthropic's balanced performance model

MID_2=claude-3-opus-20240229
MNAME_2=Claude 3 Opus
MDESC_2=Most powerful Claude model

# API Configuration (Required)
ANTHROPIC_BASE_URL=https://api.anthropic.com/v1
ANTHROPIC_AUTH_TOKEN=sk-ant-...
```

### Usage

1. **Create environment variable groups**
   - Create new environment variable groups in the "Environment Variables" tab of the settings page
   - Set descriptive names for groups (e.g., "Claude Production", "Claude Development", etc.)

2. **Add model variables**
   - Add model-related environment variables in the group according to naming conventions
   - Ensure `MID_*` variables contain valid model identifiers
   - Numbers start from 1 and can be non-consecutive

3. **Enable configuration (exclusive mode)**
   ⚠️ **Important**: Only one environment variable group can be enabled at a time!
   - When enabling a new group, all other groups will be automatically disabled
   - After enabling a group, all models defined in it will be displayed in the model selector
   - When disabling a group, related models are removed from the selector

4. **Verify configuration**
   - Check if the correct models are displayed in the model selector
   - Send test messages to confirm models work properly
   - Check console logs for detailed loading information
