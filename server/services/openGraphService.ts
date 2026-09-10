export interface OpenGraphData {
  url: string;
  domain: string;
  siteName?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  favicon?: string;
  author?: string;
}

// Extract Open Graph tags, meta description and favicon from raw HTML
export function extractOpenGraphFromHtml(html: string, targetUrl: string): OpenGraphData {
  let domain = "";
  let origin = "";
  try {
    const parsed = new URL(targetUrl);
    domain = parsed.hostname.replace(/^www\./, "");
    origin = parsed.origin;
  } catch {
    domain = "web";
  }

  // Fallback Google Favicon Service
  let favicon = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined;

  let ogTitle = "";
  let ogDescription = "";
  let ogImage = "";
  let siteName = "";
  let author = "";

  const decodeEntities = (str: string) => {
    return str
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  // Helper regex matcher for meta tags
  const getMeta = (propName: string) => {
    const regex = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${propName}["'][^>]*content=["']([^"']+)["']`, "i");
    const match = html.match(regex);
    if (match && match[1]) return decodeEntities(match[1]);
    
    const regexRev = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${propName}["']`, "i");
    const matchRev = html.match(regexRev);
    return matchRev && matchRev[1] ? decodeEntities(matchRev[1]) : "";
  };

  ogTitle = getMeta("og:title") || getMeta("twitter:title");
  if (!ogTitle) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) ogTitle = decodeEntities(titleMatch[1]);
  }

  ogDescription = getMeta("og:description") || getMeta("twitter:description") || getMeta("description");
  ogImage = getMeta("og:image") || getMeta("twitter:image") || getMeta("twitter:image:src");
  siteName = getMeta("og:site_name") || getMeta("application-name");
  author = getMeta("author") || getMeta("article:author") || getMeta("twitter:creator");

  // If ogImage is relative, resolve it
  if (ogImage && !ogImage.startsWith("http") && origin) {
    try {
      ogImage = new URL(ogImage, origin).toString();
    } catch {}
  }

  // Favicon extraction from link tags
  const iconMatch = html.match(/<link\s+[^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["'][^>]*href=["']([^"']+)["']/i) ||
                    html.match(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon|apple-touch-icon)["']/i);
  if (iconMatch && iconMatch[1]) {
    let iconHref = iconMatch[1].trim();
    if (!iconHref.startsWith("http") && origin) {
      try {
        iconHref = new URL(iconHref, origin).toString();
      } catch {}
    }
    if (iconHref.startsWith("http")) {
      favicon = iconHref;
    }
  }

  return {
    url: targetUrl,
    domain,
    siteName: siteName || domain || "Web",
    ogTitle: ogTitle || undefined,
    ogDescription: ogDescription || undefined,
    ogImage: ogImage || undefined,
    favicon: favicon || (domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined),
    author: author || undefined,
  };
}

// Resilient server-side URL fetcher for Open Graph & full article extraction
export async function fetchArticleTextFromUrl(rawUrl: string, timeoutMs = 6000): Promise<{ title?: string; text: string; markdown: string }> {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = `https://${targetUrl}`;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (compatible; KnowledgeVaultReader/2.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { text: "", markdown: "" };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml") && !contentType.includes("text/plain")) {
      return { text: "", markdown: "" };
    }

    const rawHtml = await response.text();
    
    // Extract title
    let title = "";
    const titleMatch = rawHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].replace(/\s+/g, " ").trim();
    }

    // Isolate the main readable content
    let contentHtml = rawHtml;
    
    // Remove script, style, noscript, svg, nav, footer, header, form tags
    contentHtml = contentHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
    contentHtml = contentHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
    contentHtml = contentHtml.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ");
    contentHtml = contentHtml.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ");
    contentHtml = contentHtml.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, " ");
    contentHtml = contentHtml.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, " ");
    contentHtml = contentHtml.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, " ");
    contentHtml = contentHtml.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, " ");
    contentHtml = contentHtml.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, " ");

    // Look for <article>, <main>, or [role="main"] if present
    const articleMatch = contentHtml.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = contentHtml.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    
    let targetSection = articleMatch ? articleMatch[1] : (mainMatch ? mainMatch[1] : contentHtml);

    // Convert common HTML blocks to Markdown-like structure
    let formattedText = targetSection
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n\n# $1\n\n")
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n")
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n")
      .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n")
      .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n")
      .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "\n```\n$1\n```\n")
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**")
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
      .replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*")
      .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "\n> $1\n")
      .replace(/<br\s*[\/]?>/gi, "\n")
      .replace(/<hr\s*[\/]?>/gi, "\n---\n")
      .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

    // Strip remaining HTML tags
    formattedText = formattedText.replace(/<[^>]+>/g, " ");

    // Decode HTML entities
    formattedText = formattedText
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\r\n/g, "\n");

    // Normalize spacing and consecutive blank lines
    formattedText = formattedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line, index, arr) => line.length > 0 || (index > 0 && arr[index - 1].length > 0))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return {
      title,
      text: formattedText,
      markdown: formattedText,
    };
  } catch (err: any) {
    return { text: "", markdown: "" };
  }
}

// Resilient server-side URL fetcher for Open Graph extraction
export async function fetchOpenGraphMetadata(rawUrl: string, timeoutMs = 4500): Promise<OpenGraphData> {
  let targetUrl = rawUrl.trim();
  if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
    targetUrl = `https://${targetUrl}`;
  }

  let domain = "";
  try {
    const parsed = new URL(targetUrl);
    domain = parsed.hostname.replace(/^www\./, "");
  } catch {
    domain = "web";
  }

  const defaultResult: OpenGraphData = {
    url: targetUrl,
    domain,
    siteName: domain,
    favicon: domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined,
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 (compatible; KnowledgeVault/1.0)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    });

    clearTimeout(timer);

    if (!response.ok) {
      return defaultResult;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
      return defaultResult;
    }

    const buffer = await response.text();
    const htmlSlice = buffer.slice(0, 300000);
    return extractOpenGraphFromHtml(htmlSlice, targetUrl);
  } catch (err: any) {
    return defaultResult;
  }
}
