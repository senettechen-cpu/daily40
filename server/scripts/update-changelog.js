import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    // 取得專案根目錄 (假設腳本在 scripts/ 下)
    const rootDir = path.resolve(__dirname, '..');
    const changelogPath = path.join(rootDir, 'CHANGELOG.md');

    console.log('正在更新 CHANGELOG.md...');

    // 執行 git log 指令
    // --pretty=format 用於自定義輸出格式
    // %h = 短 hash
    // %ad = 作者日期 (配合 --date=format)
    // %s = 提交訊息
    const cmd = 'git log --pretty=format:"| %h | %ad | %s |" --date=format:"%Y-%m-%d %H:%M:%S"';
    const logOutput = execSync(cmd, { cwd: rootDir }).toString();

    const header = '# 版本紀錄 (Changelog)\n\n此文件由系統自動產生，記錄所有版本歷史。\n\n| 版本 (Hash) | 時間 | 重要修改內容 |\n|---|---|---|\n';
    const content = header + logOutput + '\n';

    fs.writeFileSync(changelogPath, content, 'utf8');
    console.log(`成功更新: ${changelogPath}`);

} catch (error) {
    console.error('更新 CHANGELOG.md 失敗:', error);
    // 不拋出錯誤，避免阻擋 commit (如果是在 hook 中執行)
}
