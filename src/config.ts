export const SITE = {
  website: "https://sora.elibinary.online/",
  author: "鳄梨",
  profile: "https://github.com/elibinary",
  desc: "书海中的足迹",
  title: "寻找火花",
  ogImage: "avatar.svg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true, // show back button in post detail
  editPost: {
    enabled: true,
    text: "编辑此页",
    url: "https://github.com/elibinary/sora-blog-astro/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr", // "rtl" | "auto"
  lang: "zh-CN", // html lang code. Set this empty and default will be "en"
  timezone: "Asia/Shanghai", // Default global timezone (IANA format) https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
} as const;

export const SOCIALS = [
  // 暂不配置，保留扩展
  // { name: 'github', href: 'https://github.com/elibinary' },
  // { name: 'twitter', href: 'https://twitter.com/...' },
] as const;
