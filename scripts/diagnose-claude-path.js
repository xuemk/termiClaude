#!/usr/bin/env node

/**
 * Claude 路径诊断脚本
 * 
 * 用于检查 Claude 可执行文件路径配置是否正确
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🔍 Claude 路径诊断\n');

// 1. 检查 settings.json
const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
console.log('📁 检查 settings.json:', settingsPath);

if (fs.existsSync(settingsPath)) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    console.log('✅ settings.json 存在');
    console.log('📋 内容:', JSON.stringify(settings, null, 2));
    
    if (settings.claudeBinaryPath) {
      console.log('\n🔍 检查 claudeBinaryPath:', settings.claudeBinaryPath);
      
      // 检查路径格式
      if (settings.claudeBinaryPath.includes('//')) {
        console.log('⚠️  警告：路径包含双斜杠 "//"');
        console.log('   应该修改为单斜杠 "/" 或双反斜杠 "\\\\"');
      }
      
      // 检查文件是否存在
      if (fs.existsSync(settings.claudeBinaryPath)) {
        console.log('✅ Claude 可执行文件存在');
        
        // 检查文件权限
        try {
          fs.accessSync(settings.claudeBinaryPath, fs.constants.X_OK);
          console.log('✅ 文件有执行权限');
        } catch (err) {
          console.log('❌ 文件没有执行权限');
        }
      } else {
        console.log('❌ Claude 可执行文件不存在！');
        console.log('   请检查路径是否正确');
      }
    } else {
      console.log('⚠️  settings.json 中没有 claudeBinaryPath');
    }
  } catch (err) {
    console.log('❌ 无法解析 settings.json:', err.message);
  }
} else {
  console.log('❌ settings.json 不存在');
}

// 2. 检查 src-tauri/binaries 目录
console.log('\n📁 检查 src-tauri/binaries 目录');
const binariesDir = path.join(process.cwd(), 'src-tauri', 'binaries');

if (fs.existsSync(binariesDir)) {
  console.log('✅ binaries 目录存在');
  const files = fs.readdirSync(binariesDir);
  console.log('📋 文件列表:');
  files.forEach(file => {
    const filePath = path.join(binariesDir, file);
    const stats = fs.statSync(filePath);
    console.log(`   - ${file} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  });
  
  // 查找 claude-code 可执行文件
  const claudeFiles = files.filter(f => f.includes('claude-code'));
  if (claudeFiles.length > 0) {
    console.log('\n✅ 找到 Claude Code 可执行文件:');
    claudeFiles.forEach(file => {
      console.log(`   - ${file}`);
    });
  } else {
    console.log('\n⚠️  未找到 Claude Code 可执行文件');
    console.log('   请运行: bun run build:executables:current');
  }
} else {
  console.log('❌ binaries 目录不存在');
  console.log('   请运行: bun run build:executables:current');
}

// 3. 检查项目路径格式
console.log('\n📁 检查常见路径格式问题');
const testPaths = [
  'C//Users/mkxue/Desktop',  // 错误格式
  'C:/Users/mkxue/Desktop',   // 正确格式
  'C:\\Users\\mkxue\\Desktop' // 正确格式
];

testPaths.forEach(p => {
  const hasDoubleSlash = p.includes('//');
  const icon = hasDoubleSlash ? '❌' : '✅';
  console.log(`${icon} ${p} ${hasDoubleSlash ? '(包含双斜杠，错误！)' : '(格式正确)'}`);
});

console.log('\n💡 建议:');
console.log('1. 确保 settings.json 中的 claudeBinaryPath 路径正确');
console.log('2. 确保路径使用单斜杠 "/" 或双反斜杠 "\\\\"');
console.log('3. 确保 Claude 可执行文件存在且有执行权限');
console.log('4. 如果 binaries 目录为空，运行: bun run build:executables:current');
