import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { buildApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { resetDb } from './helpers';

const app = buildApp();

beforeAll(async () => {
  await resetDb();
  await prisma.branch.createMany({
    data: [
      { code: 'ERC-CAI', nameEn: 'Cairo', nameAr: 'القاهرة' },
      { code: 'ERC-ASH', nameEn: 'Ash Sharqia', nameAr: 'الشرقية' },
      { code: 'ERC-HIDDEN', nameEn: 'Hidden Branch', nameAr: 'فرع مخفي', isActive: false },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /api/branches', () => {
  it('is public — no auth, no CSRF header required', async () => {
    const res = await request(app).get('/api/branches').expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(2);
  });

  it('returns id/code/nameEn/nameAr and excludes inactive branches', async () => {
    const res = await request(app).get('/api/branches').expect(200);
    const codes = (res.body.items as Array<{ code: string }>).map((b) => b.code).sort();
    expect(codes).toEqual(['ERC-ASH', 'ERC-CAI']);
    for (const branch of res.body.items as Array<Record<string, unknown>>) {
      for (const key of ['id', 'code', 'nameEn', 'nameAr']) {
        expect(branch).toHaveProperty(key);
      }
      expect(branch).not.toHaveProperty('isActive');
      expect(branch).not.toHaveProperty('createdAt');
    }
  });
});