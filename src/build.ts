import { build } from "vite";
import monkey from "vite-plugin-monkey";
import path, { resolve, dirname } from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, "../src");
const distDir = resolve(__dirname, "../dist");

async function buildAll() {
  // 1. 每次全量构建前，手动清空一次 dist 目录
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }

  // 2. 扫描 src 下的所有子目录作为脚本
  const scripts = fs.readdirSync(srcDir).filter((file) => {
    return fs.statSync(path.join(srcDir, file)).isDirectory();
  });

  console.log(`📦 发现 ${scripts.length} 个脚本，开始构建...`);

  // 3. 遍历目录，直接调用 vite 的 build API
  for (const scriptName of scripts) {
    const scriptDir = resolve(srcDir, scriptName);
    const entryFile = resolve(scriptDir, "index.ts");
    const manifestFile = resolve(scriptDir, "manifest.ts");

    if (!fs.existsSync(entryFile) || !fs.existsSync(manifestFile)) {
      console.warn(`⚠️ 跳过 ${scriptName}: 缺少 index.ts 或 manifest.ts`);
      continue;
    }

    console.log(`\n🚀 正在构建: ${scriptName}`);

    // 动态引入当前脚本的 manifest 模块
    // 注意：在 Windows ESM 环境下，动态 import 绝对路径推荐加上 file:// 前缀
    const manifestModule = await import(`file://${manifestFile}`);
    const meta = manifestModule.manifest();

    // 核心：直接调用 Vite 的 build 方法
    await build({
      // 告诉 vite 不要去读取项目根目录的 vite.config.ts，完全使用这里的内联配置
      configFile: false,

      plugins: [
        monkey({
          entry: entryFile,
          userscript: { ...meta },
          build: {
            fileName: `${scriptName}.user.js`,
          },
        }),
      ],
      resolve: {
        alias: {
          "@": resolve(__dirname, "../src"),
        },
      },
      build: {
        outDir: "dist",
        // 必须设为 false！否则每次 build 都会清空前一个脚本的输出
        emptyOutDir: false,
      },
    });
  }

  console.log(`\n✅ 所有脚本构建完成！输出在 /dist 目录`);
}

buildAll().catch((err) => {
  console.error("❌ 构建失败:", err);
  process.exit(1);
});
