function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderInlineMarkdown(text) {
    const escaped = escapeHtml(text);
    return escaped
        .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-slate-100 text-slate-800">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">$1</a>');
}

function markdownToHtml(markdown) {
    const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
    const blocks = [];

    let paragraphBuffer = [];
    let unorderedItems = [];
    let orderedItems = [];

    function flushParagraph() {
        if (!paragraphBuffer.length) return;
        const paragraphText = paragraphBuffer.join(' ').trim();
        if (paragraphText) {
            blocks.push(`<p>${renderInlineMarkdown(paragraphText)}</p>`);
        }
        paragraphBuffer = [];
    }

    function flushUnorderedList() {
        if (!unorderedItems.length) return;
        blocks.push(
            `<ul class="list-disc pl-6 space-y-1">${unorderedItems
                .map(item => `<li>${renderInlineMarkdown(item)}</li>`)
                .join('')}</ul>`
        );
        unorderedItems = [];
    }

    function flushOrderedList() {
        if (!orderedItems.length) return;
        blocks.push(
            `<ol class="list-decimal pl-6 space-y-1">${orderedItems
                .map(item => `<li>${renderInlineMarkdown(item)}</li>`)
                .join('')}</ol>`
        );
        orderedItems = [];
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            flushParagraph();
            flushUnorderedList();
            flushOrderedList();
            continue;
        }

        const heading3 = line.match(/^###\s+(.+)$/);
        const heading2 = line.match(/^##\s+(.+)$/);
        const heading1 = line.match(/^#\s+(.+)$/);
        const unordered = line.match(/^-+\s+(.+)$/);
        const ordered = line.match(/^\d+\.\s+(.+)$/);
        const quote = line.match(/^>\s+(.+)$/);

        if (heading3 || heading2 || heading1 || quote) {
            flushParagraph();
            flushUnorderedList();
            flushOrderedList();
        }

        if (heading1) {
            blocks.push(`<h2 class="text-2xl font-bold text-slate-900 pt-2">${renderInlineMarkdown(heading1[1])}</h2>`);
            continue;
        }

        if (heading2) {
            blocks.push(`<h2 class="text-2xl font-bold text-slate-900 pt-2">${renderInlineMarkdown(heading2[1])}</h2>`);
            continue;
        }

        if (heading3) {
            blocks.push(`<h3 class="text-xl font-semibold text-slate-900 pt-2">${renderInlineMarkdown(heading3[1])}</h3>`);
            continue;
        }

        if (quote) {
            blocks.push(
                `<blockquote class="border-l-4 border-slate-300 pl-4 py-1 text-slate-600 italic">${renderInlineMarkdown(quote[1])}</blockquote>`
            );
            continue;
        }

        if (unordered) {
            flushParagraph();
            flushOrderedList();
            unorderedItems.push(unordered[1]);
            continue;
        }

        if (ordered) {
            flushParagraph();
            flushUnorderedList();
            orderedItems.push(ordered[1]);
            continue;
        }

        flushUnorderedList();
        flushOrderedList();
        paragraphBuffer.push(line);
    }

    flushParagraph();
    flushUnorderedList();
    flushOrderedList();

    return blocks.join('\n                ');
}

function toSlug(input) {
    return String(input || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-');
}

function encodeUrl(value) {
    return encodeURIComponent(String(value));
}

function parseBasicAuth(authHeader) {
    if (!isNonEmptyString(authHeader) || !authHeader.startsWith('Basic ')) {
        return null;
    }

    try {
        const encoded = authHeader.slice('Basic '.length);
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const separatorIndex = decoded.indexOf(':');
        if (separatorIndex < 0) return null;

        return {
            username: decoded.slice(0, separatorIndex),
            password: decoded.slice(separatorIndex + 1)
        };
    } catch (error) {
        return null;
    }
}

function buildArticleHtml({
    title,
    description,
    category,
    publishDate,
    imageUrl,
    imageAlt,
    intro,
    markdownBodyHtml,
    slug
}) {
    const fullUrl = `https://vantamedia.pl/${slug}`;
    const twitterText = encodeUrl(title);
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeUrl(fullUrl)}`;
    const xUrl = `https://x.com/intent/tweet?url=${encodeUrl(fullUrl)}&text=${twitterText}`;

    const introHtml = isNonEmptyString(intro)
        ? `\n            <p class="text-center text-base sm:text-lg text-gray-600 mb-4">${escapeHtml(intro.trim())}</p>`
        : '';

    return `<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} | Vanta Media</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${fullUrl}">
    <meta property="og:type" content="article">
    <meta property="og:locale" content="pl_PL">
    <meta property="og:site_name" content="Vanta Media">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${fullUrl}">
    <meta property="og:image" content="${escapeHtml(imageUrl)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(imageUrl)}">
    <link rel="icon" type="image/webp" href="LOGO%20VM%20MINI.webp">
    <link rel="apple-touch-icon" href="LOGO%20VM%20MINI.webp">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif; }
        h1, h2, h3 { letter-spacing: -0.03em; }
    </style>
</head>
<body class="bg-white text-slate-900 opacity-0 transition-opacity duration-300">
    <header class="border-b border-gray-100">
        <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4">
            <a href="/"><img src="logo vm.webp" alt="Vanta Media" class="h-10 w-auto object-contain"></a>
            <a href="blog" class="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600"><i class="ph ph-arrow-left"></i>Wszystkie artykuły</a>
        </div>
    </header>
    <main class="py-12 sm:py-16">
        <article class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <p class="text-center text-xs uppercase tracking-[0.14em] text-gray-500 mb-3">${escapeHtml(category)}</p>
            <h1 class="text-center text-3xl sm:text-4xl md:text-5xl font-bold mb-6">${escapeHtml(title)}</h1>${introHtml}
            <p class="text-center text-sm text-gray-400 mb-4">Opublikowano: ${escapeHtml(publishDate)}</p>
            <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}" class="w-full h-auto rounded-lg border border-gray-200 mb-8 mx-auto">
            <div class="max-w-3xl mx-auto mb-8 flex flex-wrap items-center justify-center gap-3">
                <span class="text-sm text-gray-500">Udostępnij artykuł:</span>
                <a href="${facebookUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:text-blue-600 hover:border-blue-200 transition-colors">
                    <i class="ph ph-facebook-logo"></i> Facebook
                </a>
                <a href="${xUrl}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 rounded-md border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:text-blue-600 hover:border-blue-200 transition-colors">
                    <i class="ph ph-x-logo"></i> X
                </a>
            </div>
            <div class="max-w-3xl mx-auto space-y-5 text-gray-700 leading-relaxed text-base sm:text-lg">
                ${markdownBodyHtml}
            </div>
        </article>
    </main>
    <section id="wycena" class="bg-white px-4 sm:px-6 lg:px-8 pt-12 sm:pt-14 pb-6 sm:pb-8"><div class="max-w-7xl mx-auto rounded-lg overflow-hidden relative shadow-xl bg-[#16161d]" style="background:radial-gradient(120% 140% at 8% 2%, rgba(92, 127, 255, 0.48) 0%, rgba(92, 127, 255, 0) 54%),radial-gradient(105% 130% at 94% 12%, rgba(32, 72, 215, 0.52) 0%, rgba(32, 72, 215, 0) 56%),radial-gradient(118% 145% at 48% 98%, rgba(18, 40, 124, 0.62) 0%, rgba(18, 40, 124, 0) 62%),linear-gradient(135deg, #0b1022 0%, #111a3c 45%, #0f1f55 100%);"><div class="relative z-10 px-6 py-12 sm:px-8 sm:py-14 md:px-16 md:py-16 flex flex-col items-center justify-center gap-8 sm:gap-10 text-center"><div class="max-w-2xl"><h2 class="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3 sm:mb-4">Gotowy na produkt, który wyprzedza konkurencję?</h2><p class="text-neutral-300 text-base sm:text-lg">Uszyjemy na miarę rozwiązanie dla Twojej firmy, które działa szybciej, skaluje się lepiej i daje przewagę na rynku</p></div><a href="mailto:kontakt@vantamedia.pl" class="inline-flex items-center gap-2 bg-transparent border border-white/20 text-white hover:bg-white hover:text-black px-8 py-4 rounded-md font-bold transition-colors">Start projektu <i class="ph ph-arrow-up-right text-lg"></i></a></div></div></section>
    <footer id="kontakt" class="border-t border-gray-100"><div class="bg-white"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-7"><div class="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-14"><a href="tel:+48455569761" class="text-xl sm:text-2xl font-semibold text-black hover:text-primary transition-colors">+48 455 569 761</a><a href="mailto:kontakt@vantamedia.pl" class="text-xl sm:text-2xl font-semibold text-black hover:text-primary transition-colors break-all text-center md:text-left">kontakt@vantamedia.pl</a><div class="flex items-center gap-5 text-2xl"><a href="#" class="text-black hover:text-primary transition-colors" aria-label="Instagram"><i class="ph ph-instagram-logo"></i></a><a href="#" class="text-black hover:text-primary transition-colors" aria-label="Facebook"><i class="ph ph-facebook-logo"></i></a><a href="#" class="text-black hover:text-primary transition-colors" aria-label="LinkedIn"><i class="ph ph-linkedin-logo"></i></a><a href="#" class="text-black hover:text-primary transition-colors" aria-label="X"><i class="ph ph-x-logo"></i></a></div></div></div></div><div class="bg-[#2f3338]"><div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 relative flex items-center justify-center"><p class="text-[11px] sm:text-xs text-gray-400 tracking-[0.08em] uppercase text-center">Vanta Media | Wszelkie prawa zastrzeżone, 2026</p><a href="#" class="absolute right-4 sm:right-6 inline-flex items-center justify-center w-10 h-10 rounded-full bg-black text-white hover:bg-neutral-900 transition-colors" aria-label="Wróć na górę"><i class="ph ph-caret-up text-xl"></i></a></div></div></footer>
    <script>
        document.addEventListener('DOMContentLoaded', () => {
            requestAnimationFrame(() => document.body.classList.remove('opacity-0'));
        });
    </script>
</body>
</html>
`;
}

function buildBlogCardHtml({ title, description, publishDate, imageUrl, imageAlt, slug }) {
    return `<article class="bg-white border border-gray-100 rounded-lg shadow-sm p-7 sm:p-9">
    <div class="w-full h-44 rounded-md overflow-hidden border border-gray-200 mb-5 bg-gray-100">
        <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(imageAlt)}" class="w-full h-full object-cover">
    </div>
    <p class="text-sm text-gray-400 mb-3">Opublikowano: ${escapeHtml(publishDate)}</p>
    <a href="${escapeHtml(slug)}" class="group inline-flex items-center gap-2 text-slate-900 hover:text-blue-600 transition-colors">
        <h2 class="text-xl sm:text-2xl font-bold">${escapeHtml(title)}</h2>
        <i class="ph ph-arrow-up-right text-lg opacity-60 group-hover:opacity-100 transition-opacity"></i>
    </a>
    <p class="text-gray-500 mt-3 text-base sm:text-lg">${escapeHtml(description)}</p>
</article>`;
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const adminUser = process.env.ARTICLE_ADMIN_USER;
    const adminPassword = process.env.ARTICLE_ADMIN_PASSWORD;

    if (!isNonEmptyString(adminUser) || !isNonEmptyString(adminPassword)) {
        return res.status(500).json({ error: 'Brak konfiguracji ARTICLE_ADMIN_USER lub ARTICLE_ADMIN_PASSWORD.' });
    }

    const credentials = parseBasicAuth(req.headers.authorization || '');
    if (!credentials || credentials.username !== adminUser || credentials.password !== adminPassword) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Vanta Admin Generator"');
        return res.status(401).json({ error: 'Brak autoryzacji.' });
    }

    const {
        title,
        description,
        category,
        publishDate,
        imageUrl,
        imageAlt,
        intro,
        body
    } = req.body || {};

    if (
        !isNonEmptyString(title) ||
        !isNonEmptyString(description) ||
        !isNonEmptyString(category) ||
        !isNonEmptyString(publishDate) ||
        !isNonEmptyString(imageUrl) ||
        !isNonEmptyString(imageAlt) ||
        !isNonEmptyString(body)
    ) {
        return res.status(400).json({ error: 'Uzupełnij wszystkie wymagane pola.' });
    }

    const slug = `blog-${toSlug(title)}`;
    if (!isNonEmptyString(slug) || slug === 'blog-') {
        return res.status(400).json({ error: 'Nie udało się wygenerować poprawnego sluga z tytułu.' });
    }

    const markdownBodyHtml = markdownToHtml(body);
    if (!isNonEmptyString(markdownBodyHtml)) {
        return res.status(400).json({ error: 'Treść artykułu musi zawierać przynajmniej jeden akapit.' });
    }

    const articleHtml = buildArticleHtml({
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        publishDate: publishDate.trim(),
        imageUrl: imageUrl.trim(),
        imageAlt: imageAlt.trim(),
        intro: isNonEmptyString(intro) ? intro.trim() : '',
        markdownBodyHtml,
        slug
    });

    const blogCardHtml = buildBlogCardHtml({
        title: title.trim(),
        description: description.trim(),
        publishDate: publishDate.trim(),
        imageUrl: imageUrl.trim(),
        imageAlt: imageAlt.trim(),
        slug
    });

    return res.status(200).json({
        ok: true,
        slug,
        fileName: `${slug}.html`,
        articleHtml,
        blogCardHtml
    });
};

