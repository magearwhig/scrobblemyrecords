import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useEffect } from 'react';
import '@testing-library/jest-dom';

import WishlistPriorityView from '../../../../src/renderer/components/wishlist/WishlistPriorityView';
import {
  applyChangeToSnapshot,
  useWishlistPriorities,
} from '../../../../src/renderer/hooks/useWishlistPriorities';
import {
  WishlistPriorityChange,
  WishlistPriorityRecord,
  WishlistPrioritySnapshot,
} from '../../../../src/shared/types';

const mockGet = jest.fn();
const mockChange = jest.fn();
const mockShowToast = jest.fn();
let mockDragEnd: ((result: unknown) => void) | undefined;

jest.mock('../../../../src/renderer/services/api', () => {
  const api = {
    getWishlistPriorities: () => mockGet(),
    changeWishlistPriority: (change: unknown) => mockChange(change),
  };
  return { getApiService: () => api };
});

jest.mock('../../../../src/renderer/context/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

jest.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode;
    onDragEnd: (result: unknown) => void;
  }) => {
    mockDragEnd = onDragEnd;
    return <>{children}</>;
  },
  Droppable: ({
    children,
  }: {
    children: (provided: unknown) => React.ReactNode;
  }) => <>{children({ innerRef: () => {}, droppableProps: {} })}</>,
  Draggable: ({
    children,
  }: {
    children: (provided: unknown, state: unknown) => React.ReactNode;
  }) => (
    <>
      {children(
        {
          innerRef: () => {},
          draggableProps: {},
          dragHandleProps: { role: 'button', tabIndex: 0 },
        },
        { isDragging: false }
      )}
    </>
  ),
}));

const record = (
  id: number,
  title: string,
  rank: number | null
): WishlistPriorityRecord => ({
  key: `master:${id}`,
  rank,
  monitored: false,
  artist: `Artist ${id}`,
  title,
  wantIds: [id],
  localIds: [],
});

const start = (): WishlistPrioritySnapshot => ({
  ranked: [record(1, 'First', 1), record(2, 'Second', 2)],
  unranked: [record(3, 'Far Down', null), record(4, 'Further', null)],
});

const Harness: React.FC<{ query?: string }> = ({ query = '' }) => {
  const priorities = useWishlistPriorities('http://test');
  const { reload } = priorities;
  useEffect(() => {
    void reload();
  }, [reload]);
  return (
    <WishlistPriorityView
      priorities={priorities}
      searchQuery={query}
      matchesSearch={(artist, title) =>
        `${artist} ${title}`.toLowerCase().includes(query.toLowerCase())
      }
    />
  );
};

const rankedTitles = () =>
  within(screen.getByRole('region', { name: 'Ranked' }))
    .getAllByRole('listitem')
    .map(row => row.querySelector('.wishlist-priority-title')?.textContent);

describe('WishlistPriorityView', () => {
  let user: ReturnType<typeof userEvent.setup>;
  let server: WishlistPrioritySnapshot;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDragEnd = undefined;
    server = start();
    mockGet.mockImplementation(async () => server);
    mockChange.mockImplementation(async (change: WishlistPriorityChange) => {
      server = applyChangeToSnapshot(server, change);
      return server;
    });
    user = userEvent.setup();
  });

  const renderView = async (query?: string) => {
    render(<Harness query={query} />);
    await screen.findByText(/ranked ·/);
  };

  it('shows ranked records, then the rest, with counts', async () => {
    await renderView();
    expect(screen.getByText('2 ranked · 2 not ranked')).toBeInTheDocument();
    expect(rankedTitles()).toEqual(['First', 'Second']);
    expect(
      within(screen.getByRole('region', { name: 'Not ranked yet' })).getByText(
        'Far Down'
      )
    ).toBeInTheDocument();
  });

  it('moves a far-down record to the top in one click', async () => {
    await renderView();
    await user.click(
      screen.getByRole('button', {
        name: 'Move Artist 3 – Far Down to the top',
      })
    );
    expect(rankedTitles()).toEqual(['Far Down', 'First', 'Second']);
    expect(mockChange).toHaveBeenCalledWith({
      action: 'move',
      key: 'master:3',
      position: 1,
    });
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith(
        'success',
        'Moved to #1: Far Down',
        expect.objectContaining({ action: expect.anything() })
      )
    );
  });

  it('has no Top button on the first record', async () => {
    await renderView();
    expect(
      screen.queryByRole('button', { name: /First to the top/ })
    ).not.toBeInTheDocument();
  });

  it('adds to the end of the ranked list', async () => {
    await renderView();
    await user.click(
      screen.getByRole('button', {
        name: 'Add Artist 4 – Further to the end of your priorities',
      })
    );
    expect(rankedTitles()).toEqual(['First', 'Second', 'Further']);
  });

  it('moves to a typed position on Enter, and cancels on Escape', async () => {
    await renderView();
    await user.click(
      screen.getByRole('button', { name: /Set a position for Artist 3/ })
    );
    await user.keyboard('2{Enter}');
    expect(rankedTitles()).toEqual(['First', 'Far Down', 'Second']);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Position 2, change position of/ })
    ).toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: /Position 1, change position of/ })
    );
    await user.keyboard('3{Escape}');
    expect(rankedTitles()).toEqual(['First', 'Far Down', 'Second']);
    expect(mockChange).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /Position 1, change position of/ })
    ).toHaveFocus();
  });

  it('clamps a typed position to the end of the list', async () => {
    await renderView();
    await user.click(
      screen.getByRole('button', { name: /Position 1, change position of/ })
    );
    await user.keyboard('99{Enter}');
    expect(mockChange).toHaveBeenCalledWith({
      action: 'move',
      key: 'master:1',
      position: 2,
    });
  });

  it('removes a priority, and Undo puts it back', async () => {
    await renderView();
    await user.click(
      screen.getByRole('button', {
        name: 'Remove priority from Artist 1 – First',
      })
    );
    expect(rankedTitles()).toEqual(['Second']);
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());

    const options = mockShowToast.mock.calls[0][2];
    await act(async () => options.action.onClick());
    expect(rankedTitles()).toEqual(['First', 'Second']);
    expect(mockChange).toHaveBeenLastCalledWith({
      action: 'move',
      key: 'master:1',
      position: 1,
    });
  });

  it('Undo returns a newly ranked record to not ranked', async () => {
    await renderView();
    await user.click(
      screen.getByRole('button', {
        name: 'Move Artist 3 – Far Down to the top',
      })
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalled());
    await act(async () => mockShowToast.mock.calls[0][2].action.onClick());
    expect(mockChange).toHaveBeenLastCalledWith({
      action: 'unrank',
      key: 'master:3',
    });
    expect(rankedTitles()).toEqual(['First', 'Second']);
  });

  it('undoes back to the record it followed, after others have moved', async () => {
    // First, Second ranked; Far Down to the top, then Second to the top
    await renderView();
    await user.click(
      screen.getByRole('button', { name: /Move Artist 3 .* to the top/ })
    );
    await user.click(
      screen.getByRole('button', { name: /Move Artist 2 .* to the top/ })
    );
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledTimes(2));
    expect(rankedTitles()).toEqual(['Second', 'Far Down', 'First']);

    // Undo in the order made: Far Down leaves, then Second returns below First
    await act(async () => mockShowToast.mock.calls[0][2].action.onClick());
    await act(async () => mockShowToast.mock.calls[1][2].action.onClick());
    expect(rankedTitles()).toEqual(['First', 'Second']);
  });

  it('saves the drop position from a drag, and ignores a drop in place', async () => {
    await renderView();
    await act(async () =>
      mockDragEnd?.({
        draggableId: 'master:1',
        source: { index: 0 },
        destination: { index: 0 },
      })
    );
    await act(async () =>
      mockDragEnd?.({
        draggableId: 'master:1',
        source: { index: 0 },
        destination: null,
      })
    );
    expect(mockChange).not.toHaveBeenCalled();

    await act(async () =>
      mockDragEnd?.({
        draggableId: 'master:2',
        source: { index: 1 },
        destination: { index: 0 },
      })
    );
    expect(rankedTitles()).toEqual(['Second', 'First']);
    expect(mockChange).toHaveBeenCalledWith({
      action: 'move',
      key: 'master:2',
      position: 1,
    });
  });

  it('turns dragging off while searching, keeping real positions and Top', async () => {
    await renderView('second');
    expect(screen.getByText(/Dragging is off/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Drag / })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Position 2, change position of/ })
    ).toBeInTheDocument();
    expect(screen.queryByText('First')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Move Artist 2 – Second to the top',
      })
    );
    expect(mockChange).toHaveBeenCalledWith({
      action: 'move',
      key: 'master:2',
      position: 1,
    });
  });

  it('says when a search finds nothing', async () => {
    await renderView('nothing like this');
    expect(screen.getByText('No records match your search.')).toBeVisible();
  });

  it('invites a first pick when nothing is ranked', async () => {
    server = { ranked: [], unranked: start().unranked };
    await renderView();
    expect(screen.getByText(/Nothing ranked yet/)).toBeInTheDocument();
  });

  it('puts the order back and says so when a save fails', async () => {
    await renderView();
    mockChange.mockRejectedValueOnce({
      response: { data: { error: 'Disk full' } },
    });
    await user.click(
      screen.getByRole('button', {
        name: 'Move Artist 3 – Far Down to the top',
      })
    );
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Disk full')
    );
    await waitFor(() => expect(rankedTitles()).toEqual(['First', 'Second']));
  });

  it('puts the order back when the save and the reload both fail', async () => {
    await renderView();
    mockChange.mockRejectedValueOnce(new Error('damaged'));
    mockGet.mockRejectedValueOnce(new Error('damaged'));
    await user.click(
      screen.getByRole('button', {
        name: 'Move Artist 3 – Far Down to the top',
      })
    );
    await waitFor(() =>
      expect(mockShowToast).toHaveBeenCalledWith('error', 'damaged')
    );
    await waitFor(() => expect(rankedTitles()).toEqual(['First', 'Second']));
  });

  it('saves quick moves in order and shows the last reply', async () => {
    await renderView();
    let release: () => void = () => {};
    mockChange.mockImplementationOnce(
      (change: WishlistPriorityChange) =>
        new Promise(resolve => {
          release = () => {
            server = applyChangeToSnapshot(server, change);
            resolve(server);
          };
        })
    );
    await user.click(
      screen.getByRole('button', { name: /Move Artist 3 .* to the top/ })
    );
    await user.click(
      screen.getByRole('button', { name: /Move Artist 4 .* to the top/ })
    );
    expect(rankedTitles()).toEqual(['Further', 'Far Down', 'First', 'Second']);
    expect(mockChange).toHaveBeenCalledTimes(1);

    await act(async () => release());
    await waitFor(() => expect(mockChange).toHaveBeenCalledTimes(2));
    expect(rankedTitles()).toEqual(['Further', 'Far Down', 'First', 'Second']);
  });

  describe('reads and saves crossing', () => {
    const Reloader: React.FC = () => {
      const priorities = useWishlistPriorities('http://test');
      const { reload } = priorities;
      useEffect(() => {
        void reload();
      }, [reload]);
      return (
        <>
          <button type='button' onClick={() => void reload()}>
            Reload now
          </button>
          <WishlistPriorityView
            priorities={priorities}
            searchQuery=''
            matchesSearch={() => true}
          />
        </>
      );
    };

    it('ignores a read that started before a save', async () => {
      render(<Reloader />);
      await screen.findByText(/ranked ·/);

      let finishRead: (s: WishlistPrioritySnapshot) => void = () => {};
      mockGet.mockImplementationOnce(
        () => new Promise(resolve => (finishRead = resolve))
      );
      const staleOrder = server;
      await user.click(screen.getByRole('button', { name: 'Reload now' }));
      await user.click(
        screen.getByRole('button', { name: /Move Artist 3 .* to the top/ })
      );
      await waitFor(() => expect(mockChange).toHaveBeenCalledTimes(1));
      await act(async () => {});

      await act(async () => finishRead(staleOrder));
      expect(rankedTitles()).toEqual(['Far Down', 'First', 'Second']);
    });

    it('runs a read asked for during a save once the save finishes', async () => {
      render(<Reloader />);
      await screen.findByText(/ranked ·/);

      let finishSave: () => void = () => {};
      mockChange.mockImplementationOnce(
        (change: WishlistPriorityChange) =>
          new Promise(resolve => {
            finishSave = () => {
              server = applyChangeToSnapshot(server, change);
              resolve(server);
            };
          })
      );
      await user.click(
        screen.getByRole('button', { name: /Move Artist 3 .* to the top/ })
      );
      const reads = mockGet.mock.calls.length;
      await user.click(screen.getByRole('button', { name: 'Reload now' }));
      expect(mockGet).toHaveBeenCalledTimes(reads);

      // A sync added a record while the save was out
      await act(async () => finishSave());
      server = {
        ...server,
        unranked: [...server.unranked, record(9, 'New Want', null)],
      };
      await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(reads + 1));
    });
  });

  it('shows a load error with a retry', async () => {
    mockGet.mockRejectedValueOnce({
      response: { data: { error: 'The file is damaged' } },
    });
    render(<Harness />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The file is damaged'
    );
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(/ranked ·/)).toBeInTheDocument();
  });
});
