import { describe, expect, it } from 'vitest';
import { resolveReleaseGateActivationIntent } from '../../../packages/shared/backend/releaseGate.js';

describe('resolveReleaseGateActivationIntent', () => {
  it('does not request activation for legacy force-open key', () => {
    const result = resolveReleaseGateActivationIntent([
      { key: 'exam.force_open', value: true },
      { key: 'bursluluk.campaign.code', value: '2026_BURSLULUK' },
    ]);

    expect(result.activationRequested).toBe(false);
    expect(result.activatedKeys).toEqual([]);
    expect(result.issues).toEqual([]);
    expect(result.campaignCode).toBe('2026_BURSLULUK');
  });

  it('does not request activation for legacy open-at key', () => {
    const result = resolveReleaseGateActivationIntent([
      { key: 'bursluluk.campaign.exam_open_at', value: '2026-03-21T09:00:00.000Z' },
    ]);

    expect(result.activationRequested).toBe(false);
    expect(result.activatedKeys).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('requests activation for canonical force-open key', () => {
    const result = resolveReleaseGateActivationIntent([
      { key: 'bursluluk.exam_force_open', value: { force_open: true } },
    ]);

    expect(result.activationRequested).toBe(true);
    expect(result.activatedKeys).toEqual(['bursluluk.exam_force_open']);
    expect(result.issues).toEqual([]);
  });

  it('requests activation for canonical open-at key', () => {
    const result = resolveReleaseGateActivationIntent([
      { key: 'bursluluk.exam_open_at', value: '2026-03-21T09:00:00.000Z' },
    ]);

    expect(result.activationRequested).toBe(true);
    expect(result.activatedKeys).toEqual(['bursluluk.exam_open_at']);
    expect(result.issues).toEqual([]);
  });

  it('returns invalid_datetime issue for canonical open-at with invalid value', () => {
    const result = resolveReleaseGateActivationIntent([
      { key: 'bursluluk.exam_open_at', value: 'not-a-date' },
    ]);

    expect(result.activationRequested).toBe(false);
    expect(result.activatedKeys).toEqual([]);
    expect(result.issues).toEqual([
      {
        key: 'bursluluk.exam_open_at',
        issue: 'invalid_datetime',
      },
    ]);
  });
});
