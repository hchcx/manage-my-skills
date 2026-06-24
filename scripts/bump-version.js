import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. 获取并校验版本号
const newVersion = process.argv[2];
if (!newVersion) {
  console.error('❌ 请提供新的版本号，例如: node scripts/bump-version.js 0.1.2');
  process.exit(1);
}

const semverRegex = /^\d+\.\d+\.\d+$/;
if (!semverRegex.test(newVersion)) {
  console.error(`❌ 版本号格式不正确: "${newVersion}"。请使用标准的 x.y.z 格式，例如: 0.1.2`);
  process.exit(1);
}

// 2. 加载本地 .env 文件（若存在）
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  console.log('🔑 正在从本地 .env 文件加载环境变量...');
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
        process.env[key] = val;
      }
    });
  } catch (err) {
    console.warn('⚠️ 读取 .env 文件失败:', err.message);
  }
}

console.log(`\n🚀 开始将项目版本号升级为: ${newVersion}...`);

const tauriConfPath = path.join(projectRoot, 'src-tauri', 'tauri.conf.json');
let tauriConfBackup = null;

try {
  // 3. 修改 package.json
  const packageJsonPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log('✅ 已更新 package.json');
  }

  // 4. 修改 src-tauri/tauri.conf.json
  if (fs.existsSync(tauriConfPath)) {
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    tauriConf.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf8');
    console.log('✅ 已更新 tauri.conf.json');
  }

  // 5. 修改 src-tauri/Cargo.toml
  const cargoTomlPath = path.join(projectRoot, 'src-tauri', 'Cargo.toml');
  if (fs.existsSync(cargoTomlPath)) {
    let cargoToml = fs.readFileSync(cargoTomlPath, 'utf8');
    // 使用正则只匹配 [package] 下面的 version
    const updatedCargoToml = cargoToml.replace(
      /(^version\s*=\s*")[^"]*(")/m,
      `$1${newVersion}$2`
    );
    fs.writeFileSync(cargoTomlPath, updatedCargoToml, 'utf8');
    console.log('✅ 已更新 src-tauri/Cargo.toml');
  }

  // 6. 处理本地打包签名校验
  const hasKey = !!process.env.TAURI_SIGNING_PRIVATE_KEY;
  if (!hasKey) {
    console.log('\n⚠️  未检测到环境变量 TAURI_SIGNING_PRIVATE_KEY。为防止打包中断，将以「无签名更新包」的本地开发模式进行打包...');
    if (fs.existsSync(tauriConfPath)) {
      const confText = fs.readFileSync(tauriConfPath, 'utf8');
      tauriConfBackup = confText; // 备份以备后续还原
      
      const conf = JSON.parse(confText);
      if (conf.bundle) {
        conf.bundle.createUpdaterArtifacts = false; // 临时停用签名生成
      }
      fs.writeFileSync(tauriConfPath, JSON.stringify(conf, null, 2) + '\n', 'utf8');
      console.log('📝 已在临时配置中关闭 createUpdaterArtifacts');
    }
  } else {
    console.log('🔒 检测到 TAURI_SIGNING_PRIVATE_KEY，将生成更新签名包。');
  }

  // 7. 自动执行打包
  console.log('\n📦 开始执行打包构建 (npm run tauri:build)...');
  execSync('npm run tauri:build', { stdio: 'inherit', cwd: projectRoot });
  console.log('\n🎉 版本更新及打包构建已全部完成！');

} catch (error) {
  console.error('\n❌ 执行过程中出错:', error.message);
  process.exit(1);
} finally {
  // 8. 恢复 tauri.conf.json 备份
  if (tauriConfBackup) {
    try {
      fs.writeFileSync(tauriConfPath, tauriConfBackup, 'utf8');
      console.log('🔄 已还原 tauri.conf.json 配置 (恢复 createUpdaterArtifacts: true)');
    } catch (err) {
      console.error('❌ 无法还原 tauri.conf.json 配置文件:', err.message);
    }
  }
}
