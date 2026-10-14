import { Bell, BellOff, ExternalLink, Pencil } from 'lucide-react';
import React, { useId, useState } from 'react';

import {
  EnrichedWishlistItem,
  WishlistLowestListing,
} from '../../../shared/types';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';

import './WishlistPriceAlert.css';

/** Format an amount in the given ISO currency; falls back to "12.34 XYZ" */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Currency symbol for an ISO code (e.g. "USD" -> "$"), or the code itself */
export function getCurrencySymbol(currency: string): string {
  try {
    const part = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    })
      .formatToParts(0)
      .find(p => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

/** "1987 UK LP" from the cheapest pressing's details */
export function describePressing(listing: WishlistLowestListing): string {
  const formatWord = (listing.format ?? [])
    .flatMap(f => f.split(/[\s,]+/))
    .map(w => w.trim())
    .find(w => w && w.toLowerCase() !== 'vinyl');
  return [listing.year || undefined, listing.country, formatWord]
    .filter(Boolean)
    .join(' ');
}

/** Relative time for a millisecond timestamp ("5 minutes ago") */
export function formatCheckedAgo(checkedAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - checkedAt) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

interface LowestListingLineProps {
  listing: WishlistLowestListing | null | undefined;
}

export const WishlistLowestListingLine: React.FC<LowestListingLineProps> = ({
  listing,
}) => {
  if (listing === undefined) {
    return (
      <span className='wishlist-price-listing wishlist-price-muted'>
        Price not checked yet
      </span>
    );
  }
  if (listing === null) {
    return (
      <span className='wishlist-price-listing wishlist-price-muted'>
        None for sale
      </span>
    );
  }

  const price = formatMoney(listing.price, listing.currency);
  const pressing = describePressing(listing);
  const checked = `Checked ${formatCheckedAgo(listing.checkedAt)}`;
  const partial = listing.pressingsChecked < listing.pressingsTotal;

  return (
    <span className='wishlist-price-listing' title={checked}>
      <a
        className='wishlist-price-link'
        href={`https://www.discogs.com/sell/release/${listing.releaseId}`}
        target='_blank'
        rel='noopener noreferrer'
        aria-label={`Lowest listing ${price}${pressing ? `, ${pressing}` : ''}, ${listing.numForSale} for sale, on Discogs (opens in new tab)`}
      >
        <span className='wishlist-price-amount'>Lowest {price}</span>
        {pressing && <span> · {pressing}</span>}
        <span> · {listing.numForSale} for sale</span>
        <ExternalLink
          size={12}
          className='wishlist-price-link-icon'
          aria-hidden='true'
        />
      </a>
      {partial && (
        <span className='wishlist-price-muted'>
          {' '}
          · {listing.pressingsChecked} of {listing.pressingsTotal} pressings
          checked
        </span>
      )}
    </span>
  );
};

interface PriceAlertControlProps {
  item: EnrichedWishlistItem;
  /** Wishlist currency the alert price is entered in */
  currency: string;
  onSave: (masterId: number, maxPrice: number) => Promise<void>;
  onRemove: (masterId: number) => Promise<void>;
}

export const WishlistPriceAlertControl: React.FC<PriceAlertControlProps> = ({
  item,
  currency,
  onSave,
  onRemove,
}) => {
  const alert = item.priceAlert;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inputId = useId();
  const errorId = `${inputId}-error`;

  const submit = async () => {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a price greater than 0');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(item.masterId, Math.round(parsed * 100) / 100);
      setEditing(false);
      setValue('');
    } catch {
      // The page reports the failure; keep the input so the user can retry
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await onRemove(item.masterId);
      setEditing(false);
      setValue('');
    } catch {
      // Reported by the page
    } finally {
      setSaving(false);
    }
  };

  if (alert && !editing) {
    return (
      <div className='wishlist-price-alert'>
        <span className='wishlist-price-alert-set'>
          <Bell size={16} aria-hidden='true' />
          Alert at {formatMoney(alert.maxPrice, alert.currency)}
        </span>
        {alert.currency !== currency && (
          <span className='wishlist-price-alert-note'>
            Set in {alert.currency}; save it again to compare {currency} prices
          </span>
        )}
        <IconButton
          size='small'
          icon={<Pencil size={16} aria-hidden='true' />}
          aria-label={`Edit price alert for ${item.title}`}
          title='Edit price alert'
          disabled={saving}
          onClick={() => {
            setValue(String(alert.maxPrice));
            setError(null);
            setEditing(true);
          }}
        />
        <IconButton
          size='small'
          icon={<BellOff size={16} aria-hidden='true' />}
          aria-label={`Remove price alert for ${item.title}`}
          title='Remove price alert'
          disabled={saving}
          onClick={remove}
        />
      </div>
    );
  }

  return (
    <div className='wishlist-price-alert'>
      <form
        className='wishlist-price-alert-form'
        onSubmit={e => {
          e.preventDefault();
          void submit();
        }}
        noValidate
      >
        <label htmlFor={inputId} className='sr-only'>
          Alert price for {item.title} in {currency}
        </label>
        <span className='wishlist-price-alert-input-wrap'>
          <span className='wishlist-price-alert-prefix' aria-hidden='true'>
            {getCurrencySymbol(currency)}
          </span>
          <input
            id={inputId}
            className='wishlist-price-alert-input'
            type='number'
            inputMode='decimal'
            min='0'
            step='0.01'
            placeholder='Alert at…'
            value={value}
            disabled={saving}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={e => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
          />
        </span>
        <Button
          type='submit'
          size='small'
          variant='secondary'
          disabled={saving}
          iconLeft={<Bell size={16} aria-hidden='true' />}
        >
          {saving ? 'Saving…' : alert ? 'Save' : 'Set alert'}
        </Button>
        {editing && (
          <Button
            type='button'
            size='small'
            variant='ghost'
            disabled={saving}
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        )}
      </form>
      {error && (
        <p id={errorId} className='wishlist-price-alert-error' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
};

type WishlistPriceAlertProps = PriceAlertControlProps;

/** Lowest-listing line, price alert control and "below your price" badge */
const WishlistPriceAlert: React.FC<WishlistPriceAlertProps> = props => {
  const { item } = props;
  return (
    <div className='wishlist-price'>
      {item.priceAlert?.triggered && (
        <Badge variant='success' size='small' className='wishlist-price-badge'>
          Below your price
        </Badge>
      )}
      {item.vinylStatus === 'cd_only' && item.lowestListing === undefined ? (
        <span className='wishlist-price-listing wishlist-price-muted'>
          No vinyl pressings yet
        </span>
      ) : (
        <WishlistLowestListingLine listing={item.lowestListing} />
      )}
      <WishlistPriceAlertControl {...props} />
    </div>
  );
};

export default WishlistPriceAlert;
