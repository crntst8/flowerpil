import express from 'express';
import { describe, expect, it } from 'vitest';
import request from 'supertest';

describe('Vitest harness', () => {
  it('runs unit tests as separate backend and frontend projects', async () => {
    const { default: rootConfig } = await import('../../vitest.config.js');
    const projects = rootConfig.test?.projects ?? [];
    const setupFiles = projects.flatMap((project) => project.test?.setupFiles ?? []);
    const names = projects.map((project) => project.test?.name).filter(Boolean);

    expect(names).toContain('backend');
    expect(names).toContain('frontend');
    expect(setupFiles).toContain('./tests/setup.backend.js');
    expect(setupFiles).toContain('./tests/setup.frontend.js');
  });

  it('dispatches backend request tests in memory without binding a socket', async () => {
    const app = express();
    app.use(express.json());
    app.post('/echo', (req, res) => {
      res.status(201).set('X-Test', 'yes').json({
        ok: true,
        payload: req.body
      });
    });

    const response = await request(app)
      .post('/echo')
      .send({ hello: 'world' });

    expect(response.status).toBe(201);
    expect(response.headers['x-test']).toBe('yes');
    expect(response.body).toEqual({
      ok: true,
      payload: { hello: 'world' }
    });
  });

  it('supports setting headers with an object map', async () => {
    const app = express();
    app.get('/headers', (req, res) => {
      res.status(200).json({
        cookie: req.get('cookie'),
        custom: req.get('x-test')
      });
    });

    const response = await request(app)
      .get('/headers')
      .set({
        Cookie: 'auth_token=test',
        'X-Test': 'header-map'
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      cookie: 'auth_token=test',
      custom: 'header-map'
    });
  });

  it('keeps the response socket open for async handlers', async () => {
    const app = express();
    app.use(express.json());
    app.post('/delayed', async (req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      res
        .cookie('auth_token', 'token', { httpOnly: true })
        .cookie('csrf_token', 'csrf')
        .status(200)
        .json({
          ok: true,
          payload: req.body
        });
    });

    const response = await request(app)
      .post('/delayed')
      .send({ hello: 'async' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      payload: { hello: 'async' }
    });
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('auth_token=token'),
        expect.stringContaining('csrf_token=csrf')
      ])
    );
  });
});
