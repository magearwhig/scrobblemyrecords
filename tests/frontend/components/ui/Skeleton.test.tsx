import { render } from '@testing-library/react';
import React from 'react';

import {
  Skeleton,
  AlbumCardSkeleton,
  StatCardSkeleton,
  ListItemSkeleton,
  TableRowSkeleton,
  SessionCardSkeleton,
  StatsPageSkeleton,
} from '../../../../src/renderer/components/ui/Skeleton';

describe('Skeleton', () => {
  it('renders with default props', () => {
    const { container } = render(<Skeleton />);
    const skeleton = container.querySelector('.skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton).toHaveClass('skeleton--rectangular');
    expect(skeleton).toHaveClass('skeleton--pulse');
  });

  it('renders text variant', () => {
    const { container } = render(<Skeleton variant='text' />);
    expect(container.querySelector('.skeleton--text')).toBeInTheDocument();
  });

  it('renders circular variant', () => {
    const { container } = render(<Skeleton variant='circular' />);
    expect(container.querySelector('.skeleton--circular')).toBeInTheDocument();
  });

  it('renders rectangular variant', () => {
    const { container } = render(<Skeleton variant='rectangular' />);
    expect(
      container.querySelector('.skeleton--rectangular')
    ).toBeInTheDocument();
  });

  it('applies pulse animation by default', () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelector('.skeleton--pulse')).toBeInTheDocument();
  });

  it('applies wave animation', () => {
    const { container } = render(<Skeleton animation='wave' />);
    expect(container.querySelector('.skeleton--wave')).toBeInTheDocument();
  });

  it('applies no animation', () => {
    const { container } = render(<Skeleton animation='none' />);
    expect(container.querySelector('.skeleton--none')).toBeInTheDocument();
  });

  it('sets width as number (pixels)', () => {
    const { container } = render(<Skeleton width={100} />);
    const skeleton = container.querySelector('.skeleton');
    expect(skeleton).toHaveStyle({ width: '100px' });
  });

  it('sets width as string', () => {
    const { container } = render(<Skeleton width='50%' />);
    const skeleton = container.querySelector('.skeleton');
    expect(skeleton).toHaveStyle({ width: '50%' });
  });

  it('sets height as number (pixels)', () => {
    const { container } = render(<Skeleton height={50} />);
    const skeleton = container.querySelector('.skeleton');
    expect(skeleton).toHaveStyle({ height: '50px' });
  });

  it('sets height as string', () => {
    const { container } = render(<Skeleton height='2rem' />);
    const skeleton = container.querySelector('.skeleton');
    expect(skeleton).toHaveStyle({ height: '2rem' });
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className='custom-skeleton' />);
    expect(
      container.querySelector('.skeleton.custom-skeleton')
    ).toBeInTheDocument();
  });
});

describe('AlbumCardSkeleton', () => {
  it('renders one card by default', () => {
    const { container } = render(<AlbumCardSkeleton />);
    const cards = container.querySelectorAll('.skeleton-album-card');
    expect(cards).toHaveLength(1);
  });

  it('renders multiple cards when count specified', () => {
    const { container } = render(<AlbumCardSkeleton count={3} />);
    const cards = container.querySelectorAll('.skeleton-album-card');
    expect(cards).toHaveLength(3);
  });

  it('contains album cover skeleton', () => {
    const { container } = render(<AlbumCardSkeleton />);
    expect(
      container.querySelector('.skeleton-album-cover')
    ).toBeInTheDocument();
  });

  it('contains album info skeletons', () => {
    const { container } = render(<AlbumCardSkeleton />);
    const infoSection = container.querySelector('.skeleton-album-info');
    expect(infoSection).toBeInTheDocument();
    const textSkeletons = infoSection!.querySelectorAll('.skeleton--text');
    expect(textSkeletons.length).toBeGreaterThan(0);
  });
});

describe('StatCardSkeleton', () => {
  it('renders one card by default', () => {
    const { container } = render(<StatCardSkeleton />);
    const cards = container.querySelectorAll('.skeleton-stat-card');
    expect(cards).toHaveLength(1);
  });

  it('renders multiple cards when count specified', () => {
    const { container } = render(<StatCardSkeleton count={5} />);
    const cards = container.querySelectorAll('.skeleton-stat-card');
    expect(cards).toHaveLength(5);
  });

  it('contains text skeletons', () => {
    const { container } = render(<StatCardSkeleton />);
    const card = container.querySelector('.skeleton-stat-card');
    const textSkeletons = card!.querySelectorAll('.skeleton--text');
    expect(textSkeletons).toHaveLength(2);
  });
});

describe('ListItemSkeleton', () => {
  it('renders one item by default', () => {
    const { container } = render(<ListItemSkeleton />);
    const items = container.querySelectorAll('.skeleton-list-item');
    expect(items).toHaveLength(1);
  });

  it('renders multiple items when count specified', () => {
    const { container } = render(<ListItemSkeleton count={4} />);
    const items = container.querySelectorAll('.skeleton-list-item');
    expect(items).toHaveLength(4);
  });

  it('does not show avatar by default', () => {
    const { container } = render(<ListItemSkeleton />);
    expect(container.querySelector('.skeleton-avatar')).not.toBeInTheDocument();
  });

  it('shows avatar when showAvatar is true', () => {
    const { container } = render(<ListItemSkeleton showAvatar />);
    expect(container.querySelector('.skeleton-avatar')).toBeInTheDocument();
    expect(container.querySelector('.skeleton--circular')).toBeInTheDocument();
  });

  it('contains content skeletons', () => {
    const { container } = render(<ListItemSkeleton />);
    const content = container.querySelector('.skeleton-list-content');
    expect(content).toBeInTheDocument();
    const textSkeletons = content!.querySelectorAll('.skeleton--text');
    expect(textSkeletons).toHaveLength(2);
  });
});

describe('TableRowSkeleton', () => {
  it('renders one row by default', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRowSkeleton />
        </tbody>
      </table>
    );
    const rows = container.querySelectorAll('.skeleton-table-row');
    expect(rows).toHaveLength(1);
  });

  it('renders multiple rows when count specified', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRowSkeleton count={3} />
        </tbody>
      </table>
    );
    const rows = container.querySelectorAll('.skeleton-table-row');
    expect(rows).toHaveLength(3);
  });

  it('renders 4 columns by default', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRowSkeleton />
        </tbody>
      </table>
    );
    const cells = container.querySelectorAll('.skeleton-table-row td');
    expect(cells).toHaveLength(4);
  });

  it('renders specified number of columns', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRowSkeleton columns={6} />
        </tbody>
      </table>
    );
    const cells = container.querySelectorAll('.skeleton-table-row td');
    expect(cells).toHaveLength(6);
  });

  it('contains skeleton in each cell', () => {
    const { container } = render(
      <table>
        <tbody>
          <TableRowSkeleton columns={3} />
        </tbody>
      </table>
    );
    const skeletons = container.querySelectorAll(
      '.skeleton-table-row .skeleton'
    );
    expect(skeletons).toHaveLength(3);
  });
});

describe('SessionCardSkeleton', () => {
  it('renders one card by default', () => {
    const { container } = render(<SessionCardSkeleton />);
    const cards = container.querySelectorAll('.skeleton-session-card');
    expect(cards).toHaveLength(1);
  });

  it('renders multiple cards when count specified', () => {
    const { container } = render(<SessionCardSkeleton count={2} />);
    const cards = container.querySelectorAll('.skeleton-session-card');
    expect(cards).toHaveLength(2);
  });

  it('contains session header', () => {
    const { container } = render(<SessionCardSkeleton />);
    expect(
      container.querySelector('.skeleton-session-header')
    ).toBeInTheDocument();
  });

  it('contains session status', () => {
    const { container } = render(<SessionCardSkeleton />);
    expect(
      container.querySelector('.skeleton-session-status')
    ).toBeInTheDocument();
  });

  it('contains session covers', () => {
    const { container } = render(<SessionCardSkeleton />);
    const coversSection = container.querySelector('.skeleton-session-covers');
    expect(coversSection).toBeInTheDocument();
    const covers = coversSection!.querySelectorAll('.skeleton--rectangular');
    expect(covers).toHaveLength(4);
  });
});

describe('StatsPageSkeleton', () => {
  it('renders stats page structure', () => {
    const { container } = render(<StatsPageSkeleton />);
    expect(container.querySelector('.stats-page')).toBeInTheDocument();
  });

  it('renders header', () => {
    const { container } = render(<StatsPageSkeleton />);
    expect(container.querySelector('.stats-page-header')).toBeInTheDocument();
  });

  it('renders stat cards row', () => {
    const { container } = render(<StatsPageSkeleton />);
    expect(container.querySelector('.stats-cards-row')).toBeInTheDocument();
  });

  it('renders charts row', () => {
    const { container } = render(<StatsPageSkeleton />);
    expect(container.querySelector('.stats-charts-row')).toBeInTheDocument();
  });

  it('contains multiple stat card skeletons', () => {
    const { container } = render(<StatsPageSkeleton />);
    const statCards = container.querySelectorAll('.skeleton-stat-card');
    expect(statCards.length).toBeGreaterThan(1);
  });

  it('contains chart skeletons', () => {
    const { container } = render(<StatsPageSkeleton />);
    const charts = container.querySelectorAll('.skeleton-chart-card');
    expect(charts).toHaveLength(2);
  });
});
