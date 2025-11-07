// scrape-and-upsert.js
const { createClient } = require('@supabase/supabase-js');
const scrapeReports = require('./scrapeReports').default; // your file

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data: stocks, error } = await supabase.from('Stock').select('*');
  if (error) throw error;
  if (!stocks || stocks.length === 0) {
    console.log('No stocks to process');
    return;
  }

  for (const stock of stocks) {
    try {
      console.log('Scraping', stock.url);
      const reports = await scrapeReports(stock.url); // expects array [{title, link}, ...]
      const pdf_links = Array.isArray(reports) ? reports.map(r => r.link ?? r) : [];
      const payload = {
        stock_id: stock.id,
        stock_name: stock.name,
        stock_url: stock.url,
        title: stock.name ?? null,
        pdf_links,
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const { error: upsertErr } = await supabase.from('stockdetail').upsert(payload, { onConflict: 'stock_id' });
      if (upsertErr) throw upsertErr;
      console.log('Upserted', stock.id, 'pdfs:', pdf_links.length);
    } catch (e) {
      console.error('Error for', stock.id, e?.message ?? e);
    }
    // polite delay:
    await new Promise(r => setTimeout(r, 800));
  }
}

run().catch(e => {
  console.error('Fatal error', e);
  process.exit(1);
});
