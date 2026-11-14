import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import '@testing-library/jest-dom';
import { DustyCornersSection } from '../../../../src/renderer/components/stats/DustyCornersSection';
import { navigate } from '../../../../src/renderer/routes';
import { DustyCornerAlbum } from '../../../../src/shared/types';

jest.mock('../../../../src/renderer/routes', () => ({
  ...jest.requireActual('../../../../src/renderer/routes'),
  navigate: jest.fn(),
}));

const album = (n: number): DustyCornerAlbum => ({
  artist: `Artist ${n}`,
  album: `Album ${n}`,
  lastPlayed: 1,
  daysSincePlay: 400,
  collectionId: n,
});

describe('DustyCornersSection compact', () => {
  it('shows four records and one link to the full list', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DustyCornersSection albums={[1, 2, 3, 4, 5, 6].map(album)} compact />
    );

    expect(container.querySelectorAll('.dusty-corners-card')).toHaveLength(4);
    expect(screen.queryByText('Album 5')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /see all/i })).toHaveLength(1);

    await user.click(
      screen.getByRole('button', { name: 'See all in What to Play' })
    );
    expect(navigate).toHaveBeenCalledWith('what-to-play?tab=dusty');
  });

  it('plays a record with an icon button, not a text glyph', () => {
    render(<DustyCornersSection albums={[album(1)]} compact />);

    const play = screen.getByRole('button', { name: 'Play on Spotify' });
    expect(play.textContent).toBe('');
    expect(play.querySelector('svg')).not.toBeNull();
  });
});
