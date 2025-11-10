// scrape-and-upsert.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();
const scrapeReports = require('./scrapeReports').default; // your file

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log env presence (DO NOT log secret values)
console.log('env SUPABASE_URL present:', !!SUPABASE_URL);
console.log('env SUPABASE_SERVICE_ROLE_KEY present:', !!SUPABASE_SERVICE_ROLE_KEY);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — aborting.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: stocks, error: stocksErr } = await supabase.from('Stock').select('*');
  if (stocksErr) {
    console.error('Error fetching stocks:', stocksErr);
    throw stocksErr;
  }
  if (!stocks || stocks.length === 0) {
    console.log('No stocks to process');
    return;
  }

  for (const stock of stocks) {
    try {
      console.log('Scraping', stock.url);
      const reports = await scrapeReports(stock.url); // expects array [{title, link}, ...]
      const pdf_links = Array.isArray(reports) ? reports.map(r => (r && typeof r === 'object' ? (r.link ?? r.url ?? r) : r)) : [];

      const payload = {
        stock_id: stock.id,
        stock_name: stock.name,
        stock_url: stock.url,
        title: stock.name ?? null,
        pdf_links,
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Upsert with array and select returned rows so we can inspect result
      const { data: upsertData, error: upsertErr, status } = await supabase
        .from('stockdetail')
        .upsert([payload], { onConflict: 'stock_id' })
        .select('*');

      // Log result details (length is number of returned rows)
      if (upsertErr) {
        console.error('Supabase upsert error for stock', stock.id, upsertErr);
        // If you want CI to fail when upsert fails, uncomment next line:
        // throw upsertErr;
      } else {
        const returned = Array.isArray(upsertData) ? upsertData.length : (upsertData ? 1 : 0);
        console.log('Upsert result status:', status, 'returned rows:', returned);
      }

      console.log('Upserted', stock.id, 'pdfs found:', pdf_links.length);
    } catch (e) {
      console.error('Error for', stock.id, e?.message ?? e);
      // if you want hard failure on any stock error, uncomment:
      // throw e;
    }

    // polite delay:
    await new Promise(r => setTimeout(r, 800));
  }
}

run().catch(e => {
  console.error('Fatal error', e);
  process.exit(1);
});
