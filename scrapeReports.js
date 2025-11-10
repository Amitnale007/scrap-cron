// scrapeReports.js
import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio'; // still available if you want to parse HTML, but we use $$eval below

export default async function scrapeReports(url, opts = {}) {
  const {
    headless = 'new',
    timeout = 60000,
    waitForSelectorTimeout = 15000,
    maxRetries = 1, // set >1 if you want automatic retry on transient failures
  } = opts;

  let browser;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      browser = await puppeteer.launch({
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--single-process'
        ],
        defaultViewport: { width: 1280, height: 800 },
        timeout
      });

      const page = await browser.newPage();

      // Use a Linux-style Chrome user-agent in CI - less likely to trigger different markup.
      await page.setUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      );

      // Optional: set extra headers to look more like a "real" browser
      await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' });

      // Go to page and wait for network activity
      await page.goto(url, { waitUntil: 'networkidle2', timeout });

      // Wait for at least one PDF link or timeout (helps pages that render links later)
      await page.waitForSelector('a[href$=".pdf"], a[href*=".pdf?"]', { timeout: waitForSelectorTimeout }).catch(() => { /* continue even if none found */ });

      // Extract anchors directly from the page (more reliable than reading page.content + cheerio)
      const anchors = await page.$$eval('a', (els) =>
        els.map(a => ({
          href: a.getAttribute('href'),
          text: a.textContent?.trim() || ''
        }))
      );

      // Normalize and filter PDF links
      const reports = anchors
        .map(({ href, text }) => {
          if (!href) return null;
          const lower = href.toLowerCase();
          if (!lower.includes('.pdf')) return null;

          // Make absolute URL
          try {
            if (href.startsWith('//')) {
              // protocol-relative
              return { title: text || 'Untitled PDF', link: `${location.protocol}${href}` };
            }
            if (href.startsWith('http://') || href.startsWith('https://')) {
              return { title: text || 'Untitled PDF', link: href };
            }
            return { title: text || 'Untitled PDF', link: new URL(href, url).href };
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);

      // Optional: if you still want to use cheerio for some reason, you can parse page.content()
      // const html = await page.content();
      // const $ = cheerio.load(html);

      await browser.close();
      return reports;
    } catch (err) {
      console.error(`scrapeReports attempt ${attempt} failed for ${url}:`, err?.message ?? err);
      if (browser) {
        try { await browser.close(); } catch (e) { /* ignore */ }
        browser = null;
      }
      if (attempt === maxRetries) {
        // return empty array on final failure
        return [];
      }
      // otherwise retry
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }
  // fallback
  return [];
}
