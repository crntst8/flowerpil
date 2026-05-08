import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import curatorsRouter, { normalizeCuratorNameParam } from '../curators.js';
import { seedTestCurator } from '../../../tests/utils/seed.js';

const app = express();
app.use(express.json());
app.use('/api/v1/curators', curatorsRouter);

describe('Curators by-name normalization', () => {
  it('normalizes plain, single-encoded, and double-encoded names', () => {
    expect(normalizeCuratorNameParam('Amy Wooller')).toMatchObject({
      normalizedName: 'Amy Wooller',
      decodePasses: 0
    });

    expect(normalizeCuratorNameParam('Amy%20Wooller')).toMatchObject({
      normalizedName: 'Amy Wooller',
      decodePasses: 1
    });

    expect(normalizeCuratorNameParam('Amy%252520Wooller')).toMatchObject({
      normalizedName: 'Amy Wooller',
      decodePasses: 3
    });
  });

  it('resolves single-encoded and double-encoded curator names to the same curator', async () => {
    const curator = await seedTestCurator({
      email: `curator-by-name-${Date.now()}@test.com`,
      password: 'Pass123!',
      curatorName: 'Amy Wooller'
    });

    const plainResponse = await request(app).get('/api/v1/curators/by-name/Amy Wooller');
    const singleEncodedResponse = await request(app).get('/api/v1/curators/by-name/Amy%20Wooller');
    const doubleEncodedResponse = await request(app).get('/api/v1/curators/by-name/Amy%252520Wooller');

    expect(plainResponse.status).toBe(200);
    expect(singleEncodedResponse.status).toBe(200);
    expect(doubleEncodedResponse.status).toBe(200);

    expect(plainResponse.body?.data?.curator?.id).toBe(curator.curatorId);
    expect(singleEncodedResponse.body?.data?.curator?.id).toBe(curator.curatorId);
    expect(doubleEncodedResponse.body?.data?.curator?.id).toBe(curator.curatorId);
  });
});
