import { edgarAdapter, feedAdapter, type FetchText, type SourceAdapter } from './sources';

/**
 * Recorded source responses for tests and local demos (MOVES_SOURCES=fixtures). All companies
 * and people are fictional; URLs use reserved example domains.
 */
export const newsroomFeed = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Halvard Systems Newsroom</title>
<item>
  <title>Halvard Systems Appoints Mara Ellison as Chief Marketing Officer</title>
  <link>https://news.halvard.example/2026/11/mara-ellison-cmo</link>
  <pubDate>Wed, 04 Nov 2026 13:00:00 GMT</pubDate>
  <description>&lt;p&gt;Halvard Systems today announced that Mara Ellison has been appointed Chief Marketing Officer, effective December 1, 2026. Ellison was previously SVP Marketing at Brightwell Health. She will report to the CEO.&lt;/p&gt;</description>
</item>
<item>
  <title>Halvard Systems Reports Third Quarter Results</title>
  <link>https://news.halvard.example/2026/11/q3-results</link>
  <pubDate>Tue, 03 Nov 2026 21:00:00 GMT</pubDate>
  <description>Revenue grew 18%. The chief marketing officer search continues.</description>
</item>
<item>
  <title>Halvard Systems Names Priya Nair VP, Product Marketing</title>
  <link>https://news.halvard.example/2026/10/vp-product-marketing</link>
  <pubDate>Mon, 26 Oct 2026 13:00:00 GMT</pubDate>
  <description>Priya Nair joins as VP, Product Marketing, reporting to the Chief Marketing Officer.</description>
</item>
</channel></rss>`;

export const wireFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Example Wire: Personnel</title>
<entry>
  <title>Lumen Grid Announces Chief Marketing Officer Transition</title>
  <link href="https://wire.example.com/releases/lumen-grid-cmo-transition"/>
  <updated>2026-11-05T12:00:00Z</updated>
  <summary>Teo Ravelli will step down as Chief Marketing Officer of Lumen Grid at the end of the year to pursue other opportunities.</summary>
</entry>
<entry>
  <title>Analysts: Northwind Robotics CMO Could Be Leaving</title>
  <link href="https://wire.example.com/opinion/northwind-cmo-rumour"/>
  <updated>2026-11-05T15:00:00Z</updated>
  <summary>Sources say the chief marketing officer of Northwind Robotics may be leaving.</summary>
</entry>
<entry>
  <title>Halvard Systems Appoints Mara Ellison as Chief Marketing Officer</title>
  <link href="https://wire.example.com/releases/halvard-mara-ellison"/>
  <updated>2026-11-04T13:05:00Z</updated>
  <summary>Halvard Systems today announced that Mara Ellison has been appointed Chief Marketing Officer, effective December 1, 2026. Ellison was previously SVP Marketing at Brightwell Health. She will report to the CEO.</summary>
</entry>
<entry>
  <title>Profile: what a modern CMO does</title>
  <link href="https://www.linkedin.com/pulse/modern-cmo"/>
  <updated>2026-11-05T15:00:00Z</updated>
  <summary>Chief marketing officer thoughts.</summary>
</entry>
</feed>`;

export const edgarFeed = `<?xml version="1.0" encoding="ISO-8859-1" ?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Latest Filings</title>
<entry>
  <title>8-K - BRIGHTWELL HEALTH INC (0001999001) (Filer)</title>
  <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1999001/000199900126000042/0001999001-26-000042-index.htm"/>
  <summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-11-06 &lt;b&gt;AccNo:&lt;/b&gt; 0001999001-26-000042 &lt;b&gt;Size:&lt;/b&gt; 210 KB&lt;br&gt;Item 5.02: Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers&lt;br&gt;Item 9.01: Financial Statements and Exhibits</summary>
  <updated>2026-11-06T16:32:11-05:00</updated>
</entry>
<entry>
  <title>8-K - ORBITAL FOODS CO (0001999002) (Filer)</title>
  <link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1999002/000199900226000007/0001999002-26-000007-index.htm"/>
  <summary type="html">Item 2.02: Results of Operations and Financial Condition</summary>
  <updated>2026-11-06T16:30:00-05:00</updated>
</entry>
</feed>`;

export const edgarIndex = `<html><body><table class="tableFile">
<tr><td>1</td><td>8-K</td><td><a href="/Archives/edgar/data/1999001/000199900126000042/bwh-8k_20261106.htm">bwh-8k_20261106.htm</a></td></tr>
</table></body></html>`;

export const edgarDoc = `<html><body>
<p>Item 1.01 Entry into a Material Definitive Agreement.</p><p>Not applicable.</p>
<p>Item 5.02 Departure of Directors or Certain Officers; Election of Directors; Appointment of Certain Officers.</p>
<p>On November 3, 2026, Dana Whitcombe, the Company's Chief Marketing Officer, notified the Company of her decision to resign, effective November 30, 2026. Ms. Whitcombe's decision was not the result of any disagreement with the Company.</p>
<p>Item 9.01 Financial Statements and Exhibits.</p>
</body></html>`;

export const fixtureFetch: FetchText = async (url) => {
  if (url.includes('news.halvard.example/feed')) return newsroomFeed;
  if (url.includes('wire.example.com/feed')) return wireFeed;
  if (url.includes('action=getcurrent')) return edgarFeed;
  if (url.endsWith('-index.htm')) return edgarIndex;
  if (url.includes('bwh-8k_20261106.htm')) return edgarDoc;
  throw new Error(`No fixture for ${url}`);
};

export function fixtureAdapters(fetchText: FetchText = fixtureFetch): SourceAdapter[] {
  return [
    feedAdapter({
      name: 'Halvard Systems',
      kind: 'newsroom',
      url: 'https://news.halvard.example/feed.xml',
      fetchText,
    }),
    feedAdapter({
      name: 'Example Wire',
      kind: 'wire',
      url: 'https://wire.example.com/feed.atom',
      fetchText,
    }),
    edgarAdapter({ userAgent: 'CMO Beat tests (fixtures)', fetchText, delayMs: 0 }),
  ];
}
