import { act, renderHook, waitFor } from '@testing-library/react';

import { useRecommendations } from '../../../src/renderer/hooks/useRecommendations';

const mockApi = {
  getRecommendations: jest.fn(),
  submitRecommendationFeedback: jest.fn(),
};

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => mockApi,
}));

const rec = (id: number) => ({ release: { id } });

describe('useRecommendations submitFeedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getRecommendations.mockResolvedValue({
      success: true,
      data: [rec(1), rec(2)],
    });
  });

  it('removes the record and reports success once the server accepts', async () => {
    mockApi.submitRecommendationFeedback.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useRecommendations());
    await waitFor(() => expect(result.current.recommendations).toHaveLength(2));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.submitFeedback(1, 'played');
    });

    expect(ok).toBe(true);
    expect(result.current.recommendations.map(r => r.release.id)).toEqual([2]);
  });

  it('keeps the record and reports failure when the request fails', async () => {
    mockApi.submitRecommendationFeedback.mockRejectedValue(new Error('down'));
    const { result } = renderHook(() => useRecommendations());
    await waitFor(() => expect(result.current.recommendations).toHaveLength(2));

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.submitFeedback(1, 'not_interested');
    });

    expect(ok).toBe(false);
    expect(result.current.recommendations).toHaveLength(2);
  });
});
