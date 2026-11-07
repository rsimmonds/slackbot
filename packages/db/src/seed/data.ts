import type { Market } from '@cmobeat/config';

/**
 * Fictional reference data. Every company and person here is invented; domains use the reserved
 * .example TLD so nothing resolves to a real organisation.
 */
export interface SampleCompany {
  name: string;
  slug: string;
  market: Market;
  country: string;
  industry: string;
  stage: string;
  size: string;
}

const c = (
  name: string,
  market: Market,
  country: string,
  industry: string,
  stage: string,
  size: string,
): SampleCompany => ({
  name,
  slug: name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, ''),
  market,
  country,
  industry,
  stage,
  size,
});

export const sampleCompanies: SampleCompany[] = [
  c('Halvard Systems', 'US', 'US', 'B2B SaaS', 'Series C', '201-1000'),
  c('Quillmark', 'US', 'US', 'Developer tools', 'Series B', '51-200'),
  c('Brightwater Ledger', 'US', 'US', 'Fintech', 'Growth', '1001-5000'),
  c('Tessellate Health', 'US', 'US', 'Digital health', 'Series C', '201-1000'),
  c('Corvid Security', 'US', 'US', 'Cybersecurity', 'Series D', '1001-5000'),
  c('Larchmont Goods', 'US', 'US', 'Consumer goods', 'Private equity-backed', '1001-5000'),
  c('Orbitline Freight', 'US', 'US', 'Logistics', 'Growth', '1001-5000'),
  c('Pinecrest Analytics', 'US', 'US', 'B2B SaaS', 'Series A', '51-200'),
  c('Saltbox Media', 'US', 'US', 'Media', 'Public', '5000+'),
  c('Verdance Energy', 'US', 'US', 'Climate tech', 'Series B', '201-1000'),
  c('Kestrel Pay', 'US', 'US', 'Fintech', 'Series C', '201-1000'),
  c('Fieldnote', 'US', 'US', 'Productivity software', 'Series A', '51-200'),
  c('Amberlane Home', 'US', 'US', 'Retail', 'Public', '5000+'),
  c('Cobalt Harbor', 'US', 'US', 'Marketplaces', 'Series B', '201-1000'),
  c('Wrenfield Insurance', 'US', 'US', 'Insurance', 'Public', '5000+'),
  c('Lumenvale', 'US', 'US', 'AI infrastructure', 'Series B', '51-200'),
  c('Maplegrid', 'CA', 'CA', 'B2B SaaS', 'Series B', '201-1000'),
  c('Northshore Telematics', 'CA', 'CA', 'Logistics', 'Growth', '201-1000'),
  c('Tamarack Finance', 'CA', 'CA', 'Fintech', 'Series C', '201-1000'),
  c('Birchline Outfitters', 'CA', 'CA', 'Retail', 'Private equity-backed', '1001-5000'),
  c('Cedarpoint Clinics', 'CA', 'CA', 'Digital health', 'Series A', '51-200'),
  c('Aurora Ledgerworks', 'CA', 'CA', 'Fintech', 'Public', '1001-5000'),
  c('Glasswing Robotics', 'CA', 'CA', 'Industrial tech', 'Series B', '51-200'),
  c('Muskeg Climate', 'CA', 'CA', 'Climate tech', 'Seed', '1-50'),
  c('Rheinwerk Logistik', 'EU', 'DE', 'Logistics', 'Private equity-backed', '1001-5000'),
  c('Atelier Calloway', 'EU', 'FR', 'Luxury retail', 'Private', '201-1000'),
  c('Grachtwerk Mobility', 'EU', 'NL', 'Mobility', 'Series C', '201-1000'),
  c('Fjordline Commerce', 'EU', 'SE', 'Marketplaces', 'Growth', '201-1000'),
  c('Solvento Pagos', 'EU', 'ES', 'Fintech', 'Series B', '51-200'),
  c('Liffey Data', 'EU', 'IE', 'B2B SaaS', 'Series C', '201-1000'),
  c('Baltis Health', 'EU', 'DE', 'Digital health', 'Series B', '201-1000'),
  c('Maison Verrier', 'EU', 'FR', 'Consumer goods', 'Public', '5000+'),
  c('Nordvik Energy', 'EU', 'SE', 'Climate tech', 'Growth', '1001-5000'),
  c('Pellucid Labs', 'EU', 'NL', 'AI infrastructure', 'Series A', '51-200'),
  c('Thameside Capital', 'UK', 'GB', 'Fintech', 'Growth', '1001-5000'),
  c('Hartwell & Bell', 'UK', 'GB', 'Consumer goods', 'Private', '201-1000'),
  c('Ashgrove Retail', 'UK', 'GB', 'Retail', 'Public', '5000+'),
  c('Penrose Analytics', 'UK', 'GB', 'B2B SaaS', 'Series B', '51-200'),
  c('Wickham Health', 'UK', 'GB', 'Digital health', 'Series C', '201-1000'),
  c('Cairnmoor Studios', 'UK', 'GB', 'Media', 'Series A', '51-200'),
];

export const firstNames = [
  'Adaeze',
  'Bram',
  'Celine',
  'Dario',
  'Elif',
  'Farah',
  'Gideon',
  'Hana',
  'Imogen',
  'Jonah',
  'Keiko',
  'Lior',
  'Marisol',
  'Nikhil',
  'Odette',
  'Pavel',
  'Quinn',
  'Rosalind',
  'Soren',
  'Tamsin',
  'Uriel',
  'Vesna',
  'Wendell',
  'Ximena',
  'Yusuf',
  'Zelda',
  'Anouk',
  'Benedikt',
  'Coralie',
  'Desmond',
  'Esme',
  'Florian',
  'Greer',
  'Henrik',
  'Ines',
  'Jasper',
  'Kalinda',
  'Leopold',
  'Maren',
  'Niall',
];

export const lastNames = [
  'Okonkwo-Hale',
  'Vandermeer',
  'Ashdown',
  'Castellane',
  'Demirci',
  'Ellery',
  'Farquharson',
  'Grieve',
  'Halloran',
  'Ingersoll',
  'Jaramillo',
  'Kowalczyk',
  'Lindqvist',
  'Marchetti',
  'Nakashima',
  'Oyelaran',
  'Pemberton',
  'Quarry',
  'Rousseau-Lane',
  'Sandoval',
  'Thibodeau',
  'Ulvaeus',
  'Vasquez-Orr',
  'Whitcombe',
  'Yarborough',
  'Zielinski',
  'Abernethy',
  'Brannigan',
  'Cardenas',
  'Delacroix-Moss',
  'Eastwick',
  'Fennimore',
  'Galbraith',
  'Huxtable-Reid',
  'Iwasaki',
  'Juniper',
  'Kerrigan',
  'Lachance',
  'Montague',
  'Northcott',
];

export const outcomeTemplates = [
  {
    type: 'revenue',
    metric: 'Marketing-sourced pipeline',
    values: ['+184% in 18 months', '+92% year over year', '3.1x in two years'],
  },
  {
    type: 'revenue',
    metric: 'Net new ARR influenced',
    values: ['$48M in FY', '$120M over three years', '€31M in 12 months'],
  },
  {
    type: 'efficiency',
    metric: 'Customer acquisition cost',
    values: ['-38% while doubling volume', '-22% in four quarters', '-41% after channel rebuild'],
  },
  {
    type: 'brand',
    metric: 'Unaided awareness in core segment',
    values: ['11% to 29%', '4% to 17%', '18% to 34%'],
  },
  {
    type: 'team',
    metric: 'Marketing team built',
    values: [
      '12 to 85 people across 4 regions',
      '0 to 40, including first PMM and ops hires',
      '30 to 65 after merger integration',
    ],
  },
  {
    type: 'retention',
    metric: 'Net revenue retention',
    values: ['104% to 121%', '97% to 112%', '110% to 126%'],
  },
  {
    type: 'launch',
    metric: 'Market entry',
    values: [
      'Launched in DACH and Nordics',
      'Entered Canada with 40 enterprise logos in year one',
      'Opened UK as second-largest market',
    ],
  },
  {
    type: 'ai',
    metric: 'AI in the marketing operating model',
    values: [
      'Automated 60% of content ops',
      'Built in-house agent for lead routing',
      'Cut campaign cycle time from 6 weeks to 9 days',
    ],
  },
  {
    type: 'exit',
    metric: 'Company outcome',
    values: ['Through IPO', 'Acquisition at 9x revenue', 'Series C to growth round'],
  },
];

export const priorityPool = [
  'Rebuild the demand engine for enterprise',
  'Reposition the brand ahead of a category shift',
  'Prepare the marketing function for IPO readiness',
  'Integrate two marketing teams after an acquisition',
  'Launch in a second region',
  'Make AI a working part of the marketing operating model',
  'Fix the relationship between marketing and sales',
  'Move from founder-led to category-led brand',
  'Build product marketing from scratch',
  'Lift net revenue retention through lifecycle marketing',
  'Cut acquisition cost without losing volume',
  'Turn the brand into a pricing advantage',
];

export const reportingLines = [
  'CEO',
  'CEO',
  'CEO',
  'Chief Revenue Officer',
  'President',
  'Board (interim)',
];
