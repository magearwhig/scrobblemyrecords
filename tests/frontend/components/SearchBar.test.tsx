import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import SearchBar from '../../../src/renderer/components/SearchBar';

describe('SearchBar', () => {
  let user: ReturnType<typeof userEvent.setup>;

  const defaultProps = {
    onSearch: jest.fn(),
    placeholder: 'Search...',
    disabled: false,
    defaultValue: '',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders with default props', () => {
    render(<SearchBar {...defaultProps} />);

    const input = screen.getByPlaceholderText('Search...');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect(input).toHaveValue('');

    expect(screen.getByText('🔍')).toBeInTheDocument();
  });

  it('renders with custom placeholder', () => {
    render(<SearchBar {...defaultProps} placeholder='Custom placeholder' />);

    expect(
      screen.getByPlaceholderText('Custom placeholder')
    ).toBeInTheDocument();
  });

  it('renders with default value', () => {
    render(<SearchBar {...defaultProps} defaultValue='initial value' />);

    const input = screen.getByDisplayValue('initial value');
    expect(input).toBeInTheDocument();
  });

  it('shows search input as disabled when disabled prop is true', () => {
    render(<SearchBar {...defaultProps} disabled={true} />);

    const input = screen.getByPlaceholderText('Search...');
    expect(input).toBeDisabled();
  });

  it('shows overlay when disabled', () => {
    render(<SearchBar {...defaultProps} disabled={true} />);

    const overlay = document.querySelector(
      'div[style*="rgba(255, 255, 255, 0.7)"]'
    );
    expect(overlay).toBeInTheDocument();
  });

  it('does not show overlay when enabled', () => {
    render(<SearchBar {...defaultProps} disabled={false} />);

    const overlay = document.querySelector(
      'div[style*="rgba(255, 255, 255, 0.7)"]'
    );
    expect(overlay).not.toBeInTheDocument();
  });

  it('updates input value when user types', async () => {
    render(<SearchBar {...defaultProps} />);

    const input = screen.getByPlaceholderText('Search...');
    await user.type(input, 'test query');

    expect(input).toHaveValue('test query');
  });

  it('calls onSearch with debounced input after 500ms', async () => {
    const onSearch = jest.fn();
    render(<SearchBar {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText('Search...');
    await user.clear(input);
    await user.type(input, 'test');

    // Should not call immediately
    expect(onSearch).not.toHaveBeenCalled();

    // Fast-forward time by 500ms
    jest.advanceTimersByTime(500);

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('test');
  });

  it('debounces multiple rapid changes', async () => {
    const onSearch = jest.fn();
    render(<SearchBar {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText('Search...');

    await user.clear(input);
    await user.type(input, 'test');

    // Should not call during rapid changes
    jest.advanceTimersByTime(400);
    expect(onSearch).not.toHaveBeenCalled();

    // Should call once after debounce period
    jest.advanceTimersByTime(100);
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('test');
  });

  it('shows clear button when input has value', () => {
    render(<SearchBar {...defaultProps} defaultValue='test' />);

    const clearButton = screen.getByTitle('Clear search');
    expect(clearButton).toBeInTheDocument();
    expect(clearButton).toHaveTextContent('✕');
  });

  it('does not show clear button when input is empty', () => {
    render(<SearchBar {...defaultProps} />);

    const clearButton = screen.queryByTitle('Clear search');
    expect(clearButton).not.toBeInTheDocument();
  });

  it('clears input and calls onSearch when clear button is clicked', async () => {
    const onSearch = jest.fn();
    render(
      <SearchBar {...defaultProps} defaultValue='test' onSearch={onSearch} />
    );

    const input = screen.getByDisplayValue('test');
    const clearButton = screen.getByTitle('Clear search');

    await user.click(clearButton);

    expect(input).toHaveValue('');
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('disables clear button when disabled prop is true', () => {
    render(<SearchBar {...defaultProps} defaultValue='test' disabled={true} />);

    const clearButton = screen.getByTitle('Clear search');
    expect(clearButton).toBeDisabled();
  });

  it('calls onSearch with default value on mount', () => {
    const onSearch = jest.fn();
    render(
      <SearchBar {...defaultProps} defaultValue='initial' onSearch={onSearch} />
    );

    // Fast-forward time to trigger debounced search
    jest.advanceTimersByTime(500);

    expect(onSearch).toHaveBeenCalledWith('initial');
  });

  it('cleans up timeout on unmount', async () => {
    const onSearch = jest.fn();
    const { unmount } = render(
      <SearchBar {...defaultProps} onSearch={onSearch} />
    );

    const input = screen.getByPlaceholderText('Search...');
    await user.clear(input);
    await user.type(input, 'test');

    // Unmount before timeout fires
    unmount();

    // Fast-forward time
    jest.advanceTimersByTime(500);

    // Should not call onSearch after unmount
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('applies correct styling to input with clear button', () => {
    render(<SearchBar {...defaultProps} defaultValue='test' />);

    const input = screen.getByDisplayValue('test');
    expect(input).toHaveStyle({
      paddingLeft: '2.5rem',
      paddingRight: '2.5rem',
    });
  });

  it('applies correct styling to input without clear button', () => {
    render(<SearchBar {...defaultProps} />);

    const input = screen.getByPlaceholderText('Search...');
    expect(input).toHaveStyle({
      paddingLeft: '2.5rem',
      paddingRight: '1rem',
    });
  });

  it('cancels previous timeout when new input is received', async () => {
    const onSearch = jest.fn();
    render(<SearchBar {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText('Search...');

    // Type first query
    await user.clear(input);
    await user.type(input, 'first');
    jest.advanceTimersByTime(400);

    // Type second query before first timeout fires
    await user.clear(input);
    await user.type(input, 'second');
    jest.advanceTimersByTime(500);

    // Should only call with the latest query
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith('second');
  });
});
