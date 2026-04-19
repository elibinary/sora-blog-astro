# 寻找火花 - 个人技术博客

> 📚 书海中的足迹 - 记录技术学习与成长

[![GitHub](https://img.shields.io/github/license/elibinary/sora-blog-astro?color=%232F3741&style=for-the-badge)](LICENSE)
[![Astro](https://img.shields.io/badge/Astro-5.x-BC52EE?style=for-the-badge&logo=astro)](https://astro.build/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.x-38B2AC?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

---

## 📖 关于

这是一个使用 **Astro + AstroPaper** 主题构建的个人技术博客。

- **作者**: [鳄梨](https://github.com/elibinary)
- **创建时间**: 2016 年
- **迁移时间**: 2026 年 3 月（从 Hexo 迁移到 Astro）
- **技术栈**: Astro 5.x, TypeScript, TailwindCSS
- **部署平台**: [GitHub Pages](https://elibinary.github.io/sora-blog-astro/)
- **文章数量**: 60+ 篇技术文章

## 📝 内容分类

本站文章主要涵盖以下技术领域：

| 分类 | 文章数 | 说明 |
|------|--------|------|
| 💾 数据库 | ~15 篇 | MySQL 索引与优化、Redis 内部机制 |
| 🔧 后端开发 | ~15 篇 | Ruby/Rails 源码分析、系统设计 |
| 🌐 Web 技术 | ~10 篇 | HTTP 协议、OAuth2、Web 安全 |
| 🧮 算法与数学 | ~10 篇 | 数据结构、线性代数、算法题解 |
| 🛠️ 工程实践 | ~10 篇 | 性能优化、架构设计 |

## 🚀 本地开发

### 环境要求

- Node.js 18+
- pnpm 8+

### 快速开始

```bash
# 克隆项目
git clone https://github.com/elibinary/sora-blog-astro.git
cd sora-blog-astro

# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 访问 http://localhost:4321
```

### 构建生产版本

```bash
# 构建
pnpm run build

# 预览构建结果
pnpm run preview
```

## 📁 项目结构

```bash
/
├── public/              # 静态资源
│   ├── favicon.svg
│   └── _redirects      # URL 重定向配置
├── src/
│   ├── assets/         # 图片、图标等资源
│   ├── components/     # Astro 组件
│   ├── data/
│   │   └── blog/       # 博客文章（Markdown）
│   ├── layouts/        # 页面布局
│   ├── pages/          # 页面路由
│   ├── styles/         # 全局样式
│   ├── utils/          # 工具函数
│   └── config.ts       # 站点配置
└── astro.config.ts     # Astro 配置
```

## 📖 文章管理

所有文章位于 `src/data/blog/` 目录。

### 创建新文章

在 `src/data/blog/` 目录下创建 `.md` 文件：

```markdown
---
title: 文章标题
pubDatetime: 2026-03-15T10:00:00.000Z
category: "数据库"
tags:
  - MySQL
  - 索引
description: 文章摘要描述
draft: false
---

文章内容...
```

### 文章系列

使用 `series` 字段组织系列文章：

```yaml
---
series: MySQL 查询优化
seriesOrder: 1
---
```

## 🎨 自定义配置

### 站点信息

编辑 `src/config.ts`：

```typescript
export const SITE = {
  website: "https://elibinary.github.io/sora-blog-astro/",
  author: "鳄梨",
  desc: "记录技术学习与成长",
  title: "寻找火花",
  // ...
};
```

### 主题配色

编辑 `src/styles/global.css`：

```css
:root {
  --color-primary: #your-color;
}
```

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🔗 链接

- **博客地址**: https://elibinary.github.io/sora-blog-astro/
- **GitHub**: https://github.com/elibinary/sora-blog-astro
- **旧博客（Hexo）**: https://github.com/elibinary/sora-blog

## 🙏 致谢

- 基于 [AstroPaper](https://github.com/satnaing/astro-paper) 主题构建
- 感谢 Astro 团队和所有开源贡献者

---

**Better late than never.** ✨
