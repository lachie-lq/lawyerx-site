const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const OUT = path.join(ROOT, '_site');
const SITE_URL = 'https://lawyerx.com';

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function read(file) { return fs.readFileSync(file, 'utf8'); }
function write(file, content) { ensureDir(path.dirname(file)); fs.writeFileSync(file, content, 'utf8'); }
function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const a = path.join(src, entry.name);
    const b = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(a, b) : fs.copyFileSync(a, b);
  }
}
function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function decodeYamlScalar(raw) {
  const value = raw.trim();
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (value.startsWith('[') && value.endsWith(']')) {
    try { return JSON.parse(value.replace(/'/g, '"')); } catch { return value.slice(1,-1).split(',').map(v => decodeYamlScalar(v)); }
  }
  return value;
}
function parseFrontMatter(text) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return { data: {}, body: normalized };
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) throw new Error('Front matter is missing closing ---');
  const front = normalized.slice(4, end).split('\n');
  const data = {};
  let currentList = null;
  for (const line of front) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const listMatch = line.match(/^\s+-\s+(.*)$/);
    if (listMatch && currentList) {
      data[currentList].push(decodeYamlScalar(listMatch[1]));
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (raw === '') {
      if (key === 'keywords') {
        data[key] = [];
        currentList = key;
      } else {
        data[key] = '';
        currentList = null;
      }
    } else {
      data[key] = decodeYamlScalar(raw);
      currentList = null;
    }
  }
  return { data, body: normalized.slice(end + 5).trim() };
}
function inlineMarkdown(text) {
  let out = escapeHtml(text);
  out = out.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, url, title) => {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
    return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy"${titleAttr}>`;
  });
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, (_, label, url) => {
    const external = /^https?:\/\//.test(url);
    return `<a href="${escapeHtml(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  return out;
}
function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLang = '';
  let codeLines = [];

  function flushParagraph() {
    if (paragraph.length) {
      html.push(`<p>${inlineMarkdown(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  }
  function closeList() {
    if (listType) { html.push(`</${listType}>`); listType = null; }
  }
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    const fence = line.match(/^```\s*([\w-]+)?\s*$/);
    if (fence) {
      flushParagraph(); closeList();
      if (!inCode) { inCode = true; codeLang = fence[1] || ''; codeLines = []; }
      else {
        const cls = codeLang ? ` class="language-${escapeHtml(codeLang)}"` : '';
        html.push(`<pre><code${cls}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        inCode = false; codeLang = ''; codeLines = [];
      }
      continue;
    }
    if (inCode) { codeLines.push(rawLine); continue; }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { flushParagraph(); closeList(); const n = heading[1].length; html.push(`<h${n}>${inlineMarkdown(heading[2])}</h${n}>`); continue; }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) { flushParagraph(); closeList(); html.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`); continue; }
    const ul = line.match(/^\s*[-*+]\s+(.+)$/);
    const ol = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ul || ol) {
      flushParagraph();
      const wanted = ul ? 'ul' : 'ol';
      if (listType !== wanted) { closeList(); listType = wanted; html.push(`<${listType}>`); }
      html.push(`<li>${inlineMarkdown((ul || ol)[1])}</li>`);
      continue;
    }
    const hr = /^(-{3,}|\*{3,})$/.test(line.trim());
    if (hr) { flushParagraph(); closeList(); html.push('<hr>'); continue; }
    const standaloneImage = line.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)$/);
    if (standaloneImage) {
      flushParagraph(); closeList();
      const [, alt, url, title] = standaloneImage;
      html.push(`<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy">${title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ''}</figure>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph(); closeList();
  if (inCode) html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  return html.join('\n');
}
function slugFromFile(file) { return path.basename(file, path.extname(file)); }
function parseDate(value) {
  const d = new Date(value || Date.now());
  if (Number.isNaN(d.getTime())) return new Date();
  return d;
}
function pad(n) { return String(n).padStart(2, '0'); }
function dateParts(d) {
  const local = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  return { y: local.getFullYear(), m: local.getMonth()+1, day: local.getDate() };
}
function dateShort(d) { const p = dateParts(d); return `${p.y}.${pad(p.m)}.${pad(p.day)}`; }
function dateCn(d) { const p = dateParts(d); return `${p.y}年${p.m}月${p.day}日`; }
function isoDate(d) { return d.toISOString(); }
function readingMinutes(text) {
  const cleaned = text.replace(/[#>*_`\[\]()!\-]/g, '');
  return Math.max(1, Math.ceil(cleaned.length / 420));
}
function replaceAll(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => values[key] ?? '');
}
function normalizeCover(cover) {
  if (!cover) return '';
  return String(cover).startsWith('/') ? String(cover) : `/${cover}`;
}

fs.rmSync(OUT, { recursive: true, force: true });
ensureDir(OUT);
copyDir(path.join(ROOT, 'static'), OUT);

const articleFiles = fs.readdirSync(path.join(ROOT, 'content/articles'))
  .filter(name => name.endsWith('.md'))
  .map(name => path.join(ROOT, 'content/articles', name));

const articles = articleFiles.map(file => {
  const parsed = parseFrontMatter(read(file));
  const data = parsed.data;
  const slug = slugFromFile(file);
  const date = parseDate(data.date);
  const modified = parseDate(data.modified || data.date);
  const cover = normalizeCover(data.cover);
  const keywords = Array.isArray(data.keywords) ? data.keywords : (data.keywords ? [data.keywords] : []);
  return {
    ...data,
    title: String(data.title || slug),
    description: String(data.description || data.summary || ''),
    summary: String(data.summary || data.description || ''),
    category: String(data.category || '法律文章'),
    featured: data.featured === true,
    draft: data.draft === true,
    cover,
    cover_alt: String(data.cover_alt || data.title || ''),
    keywords,
    date,
    modified,
    bodyRaw: parsed.body,
    bodyHtml: markdownToHtml(parsed.body),
    slug,
    url: `/articles/${encodeURIComponent(slug)}.html`,
    canonical: `${SITE_URL}/articles/${encodeURIComponent(slug)}.html`
  };
}).filter(a => !a.draft).sort((a,b) => b.date - a.date);

const articleTemplate = read(path.join(ROOT, 'templates/article.html'));
for (const article of articles) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: isoDate(article.date),
    dateModified: isoDate(article.modified),
    inLanguage: 'zh-CN',
    mainEntityOfPage: article.canonical,
    author: { '@type': 'Person', name: '肖通律师', url: `${SITE_URL}/` },
    publisher: { '@type': 'Person', name: '肖通律师', url: `${SITE_URL}/` },
    articleSection: article.category,
    keywords: article.keywords.join(', ')
  };
  if (article.cover) jsonLd.image = `${SITE_URL}${article.cover}`;
  const coverBlock = article.cover
    ? `<div class="container article-cover"><img src="${escapeHtml(article.cover)}" alt="${escapeHtml(article.cover_alt)}" fetchpriority="high"></div>`
    : '';
  const html = replaceAll(articleTemplate, {
    TITLE: escapeHtml(article.title),
    DESCRIPTION: escapeHtml(article.description),
    KEYWORDS: escapeHtml(article.keywords.join(',')),
    CANONICAL: article.canonical,
    OG_IMAGE: article.cover ? `  <meta property="og:image" content="${SITE_URL}${escapeHtml(article.cover)}">` : '',
    DATE_ISO: isoDate(article.date),
    MODIFIED_ISO: isoDate(article.modified),
    ARTICLE_JSONLD: JSON.stringify(jsonLd, null, 2),
    CATEGORY: escapeHtml(article.category),
    DATE_CN: dateCn(article.date),
    DATE_SHORT: dateShort(article.date),
    READING_MINUTES: String(readingMinutes(article.bodyRaw)),
    COVER_BLOCK: coverBlock,
    BODY: article.bodyHtml
  });
  write(path.join(OUT, 'articles', `${article.slug}.html`), html);
}

const articleListHtml = articles.length ? articles.map(a => `    <article${a.cover ? ' class="article-list-with-cover"' : ''}>
${a.cover ? `      <a class="article-list-cover" href="${a.url}"><img src="${escapeHtml(a.cover)}" alt="${escapeHtml(a.cover_alt)}" loading="lazy"></a>` : ''}
      <div class="article-meta"><span>${escapeHtml(a.category)}</span><time datetime="${isoDate(a.date)}">${dateShort(a.date)}</time></div>
      <h2><a href="${a.url}">${escapeHtml(a.title)}</a></h2>
      <p>${escapeHtml(a.summary)}</p>
      <a class="text-link" href="${a.url}">阅读全文 →</a>
    </article>`).join('\n') : '<p>暂未发布文章。</p>';
write(path.join(OUT, 'articles', 'index.html'), replaceAll(read(path.join(ROOT, 'templates/articles-index.html')), { ARTICLE_LIST: articleListHtml }));

const featuredFirst = [...articles].sort((a,b) => Number(b.featured) - Number(a.featured) || b.date - a.date).slice(0,3);
const homeCards = featuredFirst.length ? featuredFirst.map((a, i) => `          <article class="article-card${i === 0 ? ' featured' : ''}">
${a.cover ? `            <a class="article-card-cover" href="${a.url}"><img src="${escapeHtml(a.cover)}" alt="${escapeHtml(a.cover_alt)}" loading="lazy"></a>` : ''}
            <div class="article-meta"><span>${escapeHtml(a.category)}</span><time datetime="${isoDate(a.date)}">${dateShort(a.date)}</time></div>
            <h3><a href="${a.url}">${escapeHtml(a.title)}</a></h3>
            <p>${escapeHtml(a.summary)}</p>
            <a class="text-link" href="${a.url}">阅读全文 →</a>
          </article>`).join('\n') : '          <p>暂未发布文章。</p>';
write(path.join(OUT, 'index.html'), replaceAll(read(path.join(ROOT, 'templates/home.html')), { ARTICLE_CARDS: homeCards }));

const sitemapUrls = [
  { loc: `${SITE_URL}/`, lastmod: articles[0] ? isoDate(articles[0].modified).slice(0,10) : '2026-07-30', priority: '1.0' },
  { loc: `${SITE_URL}/articles/`, lastmod: articles[0] ? isoDate(articles[0].modified).slice(0,10) : '2026-07-30', priority: '0.9' },
  { loc: `${SITE_URL}/privacy.html`, lastmod: '2026-07-30', priority: '0.2' },
  { loc: `${SITE_URL}/disclaimer.html`, lastmod: '2026-07-30', priority: '0.2' },
  ...articles.map(a => ({ loc: a.canonical, lastmod: isoDate(a.modified).slice(0,10), priority: a.featured ? '0.9' : '0.8' }))
];
write(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map(u => `  <url><loc>${escapeHtml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>monthly</changefreq><priority>${u.priority}</priority></url>`).join('\n')}\n</urlset>\n`);
write(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);

const llms = [
  '# 肖通律师个人网站',
  '',
  '> 肖通律师，广东鹏乾律师事务所律师。主要从事知识产权、不正当竞争、民商事合同、企业法律顾问、婚姻家事及刑事法律服务。',
  '',
  '## 核心页面',
  `- [首页](${SITE_URL}/)`,
  `- [专业文章](${SITE_URL}/articles/)`,
  '',
  '## 最新专业文章',
  ...articles.map(a => `- [${a.title}](${a.canonical})：${a.summary}`),
  '',
  '## 执业信息',
  '- 姓名：肖通',
  '- 任职机构：广东鹏乾律师事务所',
  '- 律师执业证号：14403201810054091',
  '- 办公地址：广东省深圳市罗湖区深南东路2105号中建大厦21楼',
  '- 联系电话：15013763869',
  '',
  '网站内容仅作一般法律信息分享，不构成针对具体事项的正式法律意见。'
].join('\n');
write(path.join(OUT, 'llms.txt'), llms + '\n');

const rssItems = articles.slice(0,20).map(a => `    <item>\n      <title>${escapeHtml(a.title)}</title>\n      <link>${a.canonical}</link>\n      <guid>${a.canonical}</guid>\n      <pubDate>${a.date.toUTCString()}</pubDate>\n      <description>${escapeHtml(a.summary)}</description>\n      <category>${escapeHtml(a.category)}</category>\n    </item>`).join('\n');
write(path.join(OUT, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>肖通律师专业文章</title>\n    <link>${SITE_URL}/articles/</link>\n    <description>知识产权、商事争议、企业合规及刑事法律文章。</description>\n    <language>zh-CN</language>\n${rssItems}\n  </channel>\n</rss>\n`);

const apiData = articles.map(a => ({ title:a.title, description:a.description, summary:a.summary, category:a.category, date:isoDate(a.date), modified:isoDate(a.modified), url:a.canonical, cover:a.cover || null, keywords:a.keywords }));
write(path.join(OUT, 'articles', 'index.json'), JSON.stringify(apiData, null, 2));

console.log(`Built ${articles.length} published article(s) into ${OUT}`);
