import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 路径配置
const HEXO_POSTS_DIR = '/tmp/sora-blog-hexo/source/_posts';
const ASTRO_POSTS_DIR = path.join(__dirname, '../src/data/blog');

// 确保目标目录存在
if (!fs.existsSync(ASTRO_POSTS_DIR)) {
  fs.mkdirSync(ASTRO_POSTS_DIR, { recursive: true });
  console.log(`✅ 创建目录：${ASTRO_POSTS_DIR}`);
}

// 读取所有 Hexo 文章
const hexoFiles = fs.readdirSync(HEXO_POSTS_DIR).filter(file => file.endsWith('.md'));

console.log(`📦 找到 ${hexoFiles.length} 篇 Hexo 文章`);

let successCount = 0;
let failCount = 0;

hexoFiles.forEach(file => {
  try {
    const hexoPath = path.join(HEXO_POSTS_DIR, file);
    const astroPath = path.join(ASTRO_POSTS_DIR, file);
    
    let content = fs.readFileSync(hexoPath, 'utf-8');
    
    // 解析 Frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) {
      console.log(`⚠️  跳过 ${file}：无法解析 Frontmatter`);
      failCount++;
      return;
    }
    
    const [, oldFrontmatter, body] = frontmatterMatch;
    
    // 解析旧的 Frontmatter 字段
    const fields = {};
    const fieldRegex = /^(\w+):\s*(.*)$/gm;
    let match;
    
    while ((match = fieldRegex.exec(oldFrontmatter)) !== null) {
      const [, key, value] = match;
      fields[key] = value.trim();
    }
    
    // 处理 tags（可能是数组格式）
    let tags = [];
    const tagsMatch = oldFrontmatter.match(/tags:\s*\n((?:\s*-\s*.+\n?)+)/);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split('\n')
        .filter(line => line.trim().startsWith('-'))
        .map(line => line.trim().replace(/^-/, '').trim());
    } else if (fields.tags) {
      tags = [fields.tags];
    }
    
    // 构建新的 Frontmatter
    let newFrontmatter = '---\n';
    newFrontmatter += `author: 鳄梨\n`;
    
    // 转换日期格式：2016-03-04 22:34:00 → 2016-03-04T22:34:00Z
    if (fields.date) {
      const dateObj = new Date(fields.date);
      newFrontmatter += `pubDatetime: ${dateObj.toISOString()}\n`;
    }
    
    newFrontmatter += `title: ${fields.title || file.replace('.md', '')}\n`;
    
    if (fields.slug) {
      newFrontmatter += `slug: ${fields.slug}\n`;
    }
    
    newFrontmatter += `draft: false\n`;
    newFrontmatter += `tags:\n`;
    tags.forEach(tag => {
      newFrontmatter += `  - ${tag}\n`;
    });
    
    if (fields.description) {
      newFrontmatter += `description: ${fields.description}\n`;
    }
    
    newFrontmatter += '---\n';
    
    // 组合新内容
    const newContent = newFrontmatter + body;
    
    // 写入文件
    fs.writeFileSync(astroPath, newContent, 'utf-8');
    
    console.log(`✅ 迁移：${file}`);
    successCount++;
    
  } catch (error) {
    console.error(`❌ 失败 ${file}:`, error.message);
    failCount++;
  }
});

console.log('\n========================================');
console.log(`🎉 迁移完成！`);
console.log(`   成功：${successCount} 篇`);
console.log(`   失败：${failCount} 篇`);
console.log(`========================================`);
