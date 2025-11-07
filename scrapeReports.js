import puppeteer from 'puppeteer';
import * as cheerio from 'cheerio';

export default async function scrapeReports(url) {
  const browser = await puppeteer.launch({
    headless: true, // run Chrome without UI
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  // Pretend to be a real browser
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Load the page and wait for network activity to stop
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

  // Get the rendered HTML
  const html = await page.content();
  const $ = cheerio.load(html);

  const reports = [];
  $('a').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim();

    if (href && href.toLowerCase().endsWith('.pdf')) {
      const absoluteUrl = href.startsWith('http') ? href : new URL(href, url).href;
      reports.push({ title: text || 'Untitled PDF', link: absoluteUrl });
    }
  });

  await browser.close();
  return reports;
}
