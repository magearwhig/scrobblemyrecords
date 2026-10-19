import { Disc3 } from 'lucide-react';
import React from 'react';

import './CrateCover.css';

interface CrateCoverProps {
  url?: string;
  /** Album title, for the alt text */
  title: string;
  size?: 'small' | 'medium' | 'large';
}

/** Album cover with a neutral placeholder when there is no image */
const CrateCover: React.FC<CrateCoverProps> = ({
  url,
  title,
  size = 'medium',
}) => (
  <div className={`crate-cover crate-cover--${size}`}>
    {url ? (
      <img src={url} alt={`${title} cover`} loading='lazy' />
    ) : (
      <Disc3 size={20} aria-hidden='true' />
    )}
  </div>
);

export default CrateCover;
