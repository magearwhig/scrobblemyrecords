import { fireEvent, render } from '@testing-library/react';
import React from 'react';

import { useSwipe } from '../../../src/renderer/hooks/useSwipe';

const Swipeable: React.FC<{ onLeft: () => void; onRight: () => void }> = ({
  onLeft,
  onRight,
}) => <div data-testid='area' {...useSwipe(onLeft, onRight)} />;

function swipe(el: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.touchStart(el, {
    touches: [{ clientX: from[0], clientY: from[1] }],
  });
  fireEvent.touchEnd(el, {
    changedTouches: [{ clientX: to[0], clientY: to[1] }],
  });
}

describe('useSwipe', () => {
  const setup = () => {
    const onLeft = jest.fn();
    const onRight = jest.fn();
    const { getByTestId } = render(
      <Swipeable onLeft={onLeft} onRight={onRight} />
    );
    return { area: getByTestId('area'), onLeft, onRight };
  };

  it('calls onSwipeLeft for a leftward swipe', () => {
    const { area, onLeft, onRight } = setup();
    swipe(area, [200, 100], [100, 110]);
    expect(onLeft).toHaveBeenCalledTimes(1);
    expect(onRight).not.toHaveBeenCalled();
  });

  it('calls onSwipeRight for a rightward swipe', () => {
    const { area, onLeft, onRight } = setup();
    swipe(area, [100, 100], [220, 90]);
    expect(onRight).toHaveBeenCalledTimes(1);
    expect(onLeft).not.toHaveBeenCalled();
  });

  it('ignores short movements and vertical scrolling', () => {
    const { area, onLeft, onRight } = setup();
    swipe(area, [100, 100], [130, 100]);
    swipe(area, [100, 100], [40, 300]);
    expect(onLeft).not.toHaveBeenCalled();
    expect(onRight).not.toHaveBeenCalled();
  });
});
