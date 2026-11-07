import { brand, currencies, markets } from '@cmobeat/config';
import { apiScopes } from '@/lib/api-keys/scopes';
import { siteUrl } from '@/lib/site';
import { levels, licence, MIN_CELL, moveTypes } from './filters';

/**
 * OpenAPI 3.1 description of the data API. Enums come from the same constants the API validates
 * against, and a test checks real responses against these schemas, so the document can't drift.
 */
const str = { type: 'string' } as const;
const nullableStr = { type: ['string', 'null'] } as const;
const int = { type: 'integer' } as const;

const errorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          enum: [
            'missing_key',
            'invalid_key',
            'revoked_key',
            'subscription_inactive',
            'insufficient_scope',
            'rate_limited',
            'invalid_request',
            'not_found',
          ],
        },
        message: str,
      },
    },
  },
};

const meta = {
  type: 'object',
  required: ['generated_at', 'count', 'licence'],
  properties: { generated_at: { type: 'string', format: 'date-time' }, count: int, licence: str },
};

const envelope = (data: object, paginated: boolean) => ({
  type: 'object',
  required: ['data', 'next_cursor', 'meta'],
  properties: {
    data,
    next_cursor: paginated ? nullableStr : { type: 'null' },
    meta,
  },
});

export const schemas = {
  Move: {
    type: 'object',
    required: [
      'id',
      'person',
      'company',
      'type',
      'title',
      'previousRole',
      'effectiveDate',
      'sources',
      'url',
    ],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      person: str,
      company: {
        type: 'object',
        required: ['name', 'industry', 'market'],
        additionalProperties: false,
        properties: { name: str, industry: str, market: { type: 'string', enum: [...markets] } },
      },
      type: { type: 'string', enum: [...moveTypes] },
      title: str,
      previousRole: nullableStr,
      effectiveDate: { type: 'string', format: 'date' },
      sources: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['url', 'label', 'kind'],
          additionalProperties: false,
          properties: { url: { type: 'string', format: 'uri' }, label: str, kind: str },
        },
      },
      url: { type: 'string', format: 'uri' },
    },
  },
  Listing: {
    type: 'object',
    required: ['id', 'title', 'level', 'workType', 'comp', 'market', 'company', 'url'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: str,
      level: { type: 'string', enum: [...levels] },
      workType: { type: 'string', enum: ['full_time', 'fractional'] },
      comp: {
        type: 'object',
        required: ['min', 'max', 'currency', 'basis'],
        additionalProperties: false,
        properties: {
          min: int,
          max: int,
          currency: { type: 'string', enum: [...currencies] },
          basis: { type: 'string', enum: ['annual', 'monthly_retainer'] },
        },
      },
      location: nullableStr,
      remote: { type: 'boolean' },
      market: { type: 'string', enum: [...markets] },
      featured: { type: 'boolean' },
      company: {
        type: 'object',
        required: ['name', 'industry', 'stage'],
        additionalProperties: false,
        properties: { name: str, industry: str, stage: str },
      },
      publishedAt: { type: ['string', 'null'], format: 'date-time' },
      expiresAt: { type: ['string', 'null'], format: 'date-time' },
      url: { type: 'string', format: 'uri' },
    },
  },
  CompCell: {
    type: 'object',
    description: `Range midpoints of live listings. Cells backed by fewer than ${MIN_CELL} listings have suppressed: true and null figures. Currencies are never converted.`,
    required: ['level', 'market', 'currency', 'basis', 'n', 'suppressed', 'p25', 'median', 'p75'],
    additionalProperties: false,
    properties: {
      level: { type: 'string', enum: [...levels] },
      market: { type: 'string', enum: [...markets] },
      currency: { type: 'string', enum: [...currencies] },
      basis: { type: 'string', enum: ['annual', 'monthly_retainer'] },
      n: int,
      suppressed: { type: 'boolean' },
      p25: { type: ['integer', 'null'] },
      median: { type: ['integer', 'null'] },
      p75: { type: ['integer', 'null'] },
    },
  },
  Company: {
    type: 'object',
    required: ['id', 'name', 'industry', 'stage', 'sizeBand', 'hqCountry', 'market'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: str,
      domain: nullableStr,
      industry: str,
      stage: str,
      sizeBand: str,
      hqCountry: str,
      market: { type: 'string', enum: [...markets] },
    },
  },
  Error: errorSchema,
} as const;

const q = (name: string, schema: object, description: string) => ({
  name,
  in: 'query',
  required: false,
  schema,
  description,
});

const pageParams = [
  q('limit', { type: 'integer', minimum: 1, maximum: 200, default: 50 }, 'Page size.'),
  q('cursor', str, 'Opaque cursor from the previous page’s next_cursor.'),
];

const errors = Object.fromEntries(
  [
    ['400', 'Invalid query parameters or cursor (invalid_request).'],
    ['401', 'Missing, invalid or revoked key.'],
    ['403', 'Subscription inactive, or the key lacks the scope.'],
    ['404', 'Not found.'],
    ['429', 'Rate limited. See Retry-After.'],
  ].map(([code, description]) => [
    code,
    {
      description,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    },
  ]),
);

const rateHeaders = {
  'X-RateLimit-Limit': { schema: int, description: 'Requests allowed per minute.' },
  'X-RateLimit-Remaining': { schema: int, description: 'Requests left this minute.' },
  'X-RateLimit-Reset': { schema: int, description: 'Unix time when the minute window resets.' },
  'X-RateLimit-Limit-Day': { schema: int, description: 'Requests allowed per UTC day.' },
  'X-RateLimit-Remaining-Day': { schema: int, description: 'Requests left today.' },
};

const ok = (data: object, paginated: boolean) => ({
  description: 'OK',
  headers: rateHeaders,
  content: { 'application/json': { schema: envelope(data, paginated) } },
});

const ref = (name: keyof typeof schemas) => ({ $ref: `#/components/schemas/${name}` });

export function openApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: `${brand.name} data API`,
      version: '1.0.0',
      description:
        'Read-only intelligence on CMO moves, live senior marketing roles and comp, for employer subscribers. Public data only: nothing about candidates is ever available through this API.',
      license: { name: licence },
    },
    servers: [{ url: `${siteUrl()}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: `Keys look like cmob_live_… and carry scopes: ${apiScopes.join(', ')}.`,
        },
      },
      schemas,
    },
    paths: {
      '/moves': {
        get: {
          operationId: 'listMoves',
          summary: 'CMO moves',
          description:
            'Approved appointments, departures and promotions, newest first. Scope: moves:read.',
          parameters: [
            q('type', { type: 'string', enum: [...moveTypes] }, 'Move type.'),
            q('industry', str, 'Company industry (exact, case-insensitive).'),
            q('market', { type: 'string', enum: [...markets] }, 'Company market.'),
            q('company', str, 'Company name contains.'),
            q('from', { type: 'string', format: 'date' }, 'Effective on or after.'),
            q('to', { type: 'string', format: 'date' }, 'Effective on or before.'),
            ...pageParams,
          ],
          responses: { '200': ok({ type: 'array', items: ref('Move') }, true), ...errors },
        },
      },
      '/moves/{id}': {
        get: {
          operationId: 'getMove',
          summary: 'One move',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          ],
          responses: { '200': ok(ref('Move'), false), ...errors },
        },
      },
      '/listings': {
        get: {
          operationId: 'listListings',
          summary: 'Live listings',
          description:
            'Live senior marketing roles with comp on every listing. Scope: listings:read.',
          parameters: [
            q('level', { type: 'string', enum: [...levels] }, 'Level.'),
            q('market', { type: 'string', enum: [...markets] }, 'Market.'),
            q('work_type', { type: 'string', enum: ['full_time', 'fractional'] }, 'Work type.'),
            ...pageParams,
          ],
          responses: { '200': ok({ type: 'array', items: ref('Listing') }, true), ...errors },
        },
      },
      '/comp': {
        get: {
          operationId: 'compAggregates',
          summary: 'Comp aggregates',
          description: `p25, median and p75 by level × market × currency × basis. Cells under ${MIN_CELL} listings are suppressed. Scope: comp:read.`,
          parameters: [
            q('level', { type: 'string', enum: [...levels] }, 'Level.'),
            q('market', { type: 'string', enum: [...markets] }, 'Market.'),
            q('currency', { type: 'string', enum: [...currencies] }, 'Currency.'),
          ],
          responses: { '200': ok({ type: 'array', items: ref('CompCell') }, false), ...errors },
        },
      },
      '/companies': {
        get: {
          operationId: 'listCompanies',
          summary: 'Companies',
          description: 'Companies’ public fields, alphabetical. Scope: moves:read.',
          parameters: [
            q('industry', str, 'Industry (exact, case-insensitive).'),
            q('market', { type: 'string', enum: [...markets] }, 'Market.'),
            ...pageParams,
          ],
          responses: { '200': ok({ type: 'array', items: ref('Company') }, true), ...errors },
        },
      },
    },
  };
}
