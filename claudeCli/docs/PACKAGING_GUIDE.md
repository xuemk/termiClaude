# Claudia 打包指南

## 🚀 快速开始

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
- MSI 文件：`msi/Claudia_0.1.65_x64_en-US.msi`
- EXE 文件：`nsis/Claudia_0.1.65_x64-setup.exe`

---

## 概述

本指南详细介绍如何将 Claudia 应用打包成可分发的安装包，特别是 Windows 平台的 MSI 和 EXE 安装包。

## 系统要求

### Windows 平台
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

## 配置文件说明

### 生产环境配置

项目包含两个主要的 Tauri 配置文件：

1. **`src-tauri/tauri.conf.release.json`** - 生产环境打包配置
2. **`src-tauri/tauri.conf.debug.json`** - 调试环境配置

### 打包目标配置

在 `tauri.conf.release.json` 中的 `bundle.targets` 配置了支持的打包格式：

```json
{
  "bundle": {
    "targets": [
      "deb",      // Linux Debian 包
      "rpm",      // Linux RPM 包
      "appimage", // Linux AppImage
      "app",      // macOS 应用包
      "dmg",      // macOS 磁盘镜像
      "msi",      // Windows MSI 安装包
      "nsis"      // Windows NSIS EXE 安装包
    ]
  }
}
```

## Windows 打包

### 1. MSI 安装包

MSI（Microsoft Installer）是 Windows 的标准安装包格式，适合企业环境部署。

#### 构建 MSI 包

```bash
# 构建生产版本 MSI
bun run tauri:build

# 或者只构建 MSI 目标
tauri build --target msi -c src-tauri/tauri.conf.release.json
```

#### MSI 包特性

- 支持标准的 Windows 安装/卸载流程
- 集成到 Windows 控制面板的"程序和功能"
- 支持企业级部署（GPO、SCCM等）
- 自动处理文件关联和快捷方式
- 支持升级和回滚

### 2. NSIS EXE 安装包

NSIS（Nullsoft Scriptable Install System）创建的 EXE 安装包，更加灵活和可定制。

#### 构建 NSIS 包

```bash
# 构建 NSIS EXE 包
tauri build --target nsis -c src-tauri/tauri.conf.release.json
```

#### NSIS 包特性

- 更小的安装包体积
- 高度可定制的安装界面
- 支持自定义安装逻辑
- 更好的压缩率
- 支持多语言安装界面

### 3. 同时构建两种格式

```bash
# 同时构建 MSI 和 NSIS
tauri build --target "msi,nsis" -c src-tauri/tauri.conf.release.json
```

## 构建流程详解

### 1. 准备构建环境

```bash
# 克隆或更新项目
git pull origin main

# 安装依赖
bun install

# 构建必要的可执行文件
bun run build:executables:current
```

### 2. 前端构建

```bash
# 构建前端应用（生产模式）
bun run build
```

### 3. 后端构建和打包

```bash
# 完整的生产构建（包含前后端）
bun run tauri:build
```

### 4. 输出文件位置

构建完成后，安装包文件位于：

```
src-tauri/target/release/bundle/
├── msi/
│   └── Claudia_0.1.65_x64_en-US.msi
└── nsis/
    └── Claudia_0.1.65_x64-setup.exe
```

## 高级配置

### 1. 自定义安装包信息

在 `tauri.conf.release.json` 中配置应用信息：

```json
{
  "productName": "Claudia",
  "version": "0.1.65",
  "identifier": "claudia.asterisk.so",
  "bundle": {
    "copyright": "© 2025 Asterisk. All rights reserved.",
    "category": "DeveloperTool",
    "shortDescription": "GUI app and Toolkit for Claude Code",
    "longDescription": "Claudia is a comprehensive GUI application and toolkit for working with Claude Code, providing an intuitive interface for AI-assisted development."
  }
}
```

### 2. Windows 特定配置

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "",
      "tsp": false,
      "wix": {
        "language": ["zh-CN", "en-US"],
        "template": "custom-installer.wxs"
      }
    }
  }
}
```

### 3. 图标配置

确保项目包含所需的图标文件：

```
src-tauri/icons/
├── icon.ico       # Windows 图标
├── 32x32.png      # 小图标
├── 128x128.png    # 中等图标
├── 128x128@2x.png # 高分辨率图标
└── icon.icns      # macOS 图标
```

## 代码签名

### 1. 获取代码签名证书

- 从可信的证书颁发机构（CA）购买代码签名证书
- 常见的 CA：DigiCert、Sectigo、GlobalSign 等

### 2. 配置签名

```json
{
  "bundle": {
    "windows": {
      "certificateThumbprint": "YOUR_CERT_THUMBPRINT",
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com"
    }
  }
}
```

### 3. 签名命令

```bash
# 使用证书签名
tauri build --target msi -c src-tauri/tauri.conf.release.json

# 验证签名
signtool verify /pa /v "path/to/your/installer.msi"
```

## 跨平台构建

### macOS 构建

```bash
# 构建 macOS 应用包和 DMG
tauri build --target "app,dmg" -c src-tauri/tauri.conf.release.json
```

### Linux 构建

```bash
# 构建 Linux 包
tauri build --target "deb,rpm,appimage" -c src-tauri/tauri.conf.release.json
```

## 自动化构建

### GitHub Actions 示例

创建 `.github/workflows/build.yml`：

```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        
      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable
        
      - name: Install dependencies
        run: bun install
        
      - name: Build executables
        run: bun run build:executables:current
        
      - name: Build Tauri app
        run: bun run tauri:build
        
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-installers
          path: |
            src-tauri/target/release/bundle/msi/*.msi
            src-tauri/target/release/bundle/nsis/*.exe
```

## 发布和分发

### 1. 内部测试

- 在不同的 Windows 版本上测试安装包
- 验证安装、运行、卸载流程
- 测试升级场景

### 2. 发布渠道

#### 直接下载
- 将安装包上传到官网或文件服务器
- 提供下载链接和校验和

#### GitHub Releases
- 使用 GitHub Releases 托管安装包
- 自动生成下载统计

#### 企业分发
- 通过企业内部的软件分发系统
- 配置自动更新机制

### 3. 版本管理

```bash
# 更新版本号
# 修改 package.json 和 tauri.conf.release.json 中的版本号

# 创建版本标签
git tag v0.1.65
git push origin v0.1.65

# 构建发布版本
bun run tauri:build
```

## 故障排除

### 常见问题

1. **构建失败：缺少 WiX Toolset**
   ```bash
   # 安装 WiX Toolset v3
   choco install wixtoolset
   ```

2. **MSI 构建失败：权限问题**
   ```bash
   # 以管理员身份运行命令提示符
   # 或配置适当的用户权限
   ```

3. **NSIS 构建失败：编码问题**
   ```bash
   # 确保 NSIS 支持 Unicode
   # 使用最新版本的 NSIS
   ```

4. **签名失败：证书问题**
   ```bash
   # 检查证书是否正确安装
   # 验证证书指纹
   certlm.msc
   ```

### 调试构建

```bash
# 启用详细输出
tauri build --verbose -c src-tauri/tauri.conf.release.json

# 构建调试版本
bun run tauri:build:debug
```

## 最佳实践

1. **版本控制**
   - 保持版本号一致性
   - 使用语义化版本
   - 记录变更日志

2. **质量保证**
   - 自动化测试
   - 多环境验证
   - 性能测试

3. **安全考虑**
   - 代码签名
   - 病毒扫描
   - 安全审计

4. **用户体验**
   - 清晰的安装界面
   - 详细的错误信息
   - 完整的卸载支持

5. **文档维护**
   - 更新安装说明
   - 提供故障排除指南
   - 维护 FAQ

## 总结

通过本指南，您可以：

- 构建专业的 Windows MSI 和 EXE 安装包
- 配置代码签名以提高安全性和信任度
- 实现自动化构建和发布流程
- 处理常见的打包问题

建议在生产环境中使用 MSI 格式以获得更好的企业兼容性，使用代码签名以避免安全警告，并建立完整的测试和发布流程。