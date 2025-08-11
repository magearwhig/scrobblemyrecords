import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

import SettingsPage from '../../../src/renderer/pages/SettingsPage';

describe('SettingsPage', () => {
  it('renders the settings page title', () => {
    render(<SettingsPage />);

    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Settings' })
    ).toBeInTheDocument();
  });

  it('renders the description text', () => {
    render(<SettingsPage />);

    expect(
      screen.getByText('Application preferences and configuration options.')
    ).toBeInTheDocument();
  });

  it('shows coming soon message', () => {
    render(<SettingsPage />);

    expect(
      screen.getByText('Settings panel coming soon...')
    ).toBeInTheDocument();
  });

  it('displays loading spinner', () => {
    render(<SettingsPage />);

    const loadingDiv = screen
      .getByText('Settings panel coming soon...')
      .closest('.loading');
    expect(loadingDiv).toBeInTheDocument();

    const spinner = loadingDiv?.querySelector('.spinner');
    expect(spinner).toBeInTheDocument();
  });

  it('renders within a card container', () => {
    render(<SettingsPage />);

    const cardElement = screen.getByText('Settings').closest('.card');
    expect(cardElement).toBeInTheDocument();
  });

  it('has proper structure with main container', () => {
    const { container } = render(<SettingsPage />);

    const mainDiv = container.firstChild;
    expect(mainDiv?.nodeName).toBe('DIV');

    const cardDiv = mainDiv?.firstChild;
    expect(cardDiv).toHaveClass('card');
  });
});
