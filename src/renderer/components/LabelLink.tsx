import React, { useCallback } from 'react';

import {
  isPlaceholderLabel,
  labelDisplayName,
} from '../../shared/utils/labels';
import { ROUTES, navigate } from '../routes';

interface LabelLinkProps {
  label: string;
  className?: string;
}

/**
 * Clickable label name that navigates to LabelDetailPage. Stores
 * 'selectedLabel' in localStorage and passes the current page as `?from=` so
 * the detail page can render a correct back link. Placeholder labels ("Not On
 * Label") have no page and render as plain text.
 */
const LabelLink: React.FC<LabelLinkProps> = ({ label, className = '' }) => {
  const open = useCallback(() => {
    const currentPage = window.location.hash.replace('#', '').split('?')[0];
    localStorage.setItem('selectedLabel', label);
    navigate(ROUTES.LABEL_DETAIL, { from: currentPage });
  }, [label]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      open();
    },
    [open]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        open();
      }
    },
    [open]
  );

  if (isPlaceholderLabel(label)) {
    return <span className={className || undefined}>{label}</span>;
  }

  return (
    <span
      className={`label-link ${className}`.trim()}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role='link'
      tabIndex={0}
      aria-label={`View label details for ${labelDisplayName(label)}`}
    >
      {labelDisplayName(label)}
    </span>
  );
};

export default LabelLink;
