import React from 'react';

import { DiscardPileItem } from '../../../shared/types';
import { Modal, ModalFooter } from '../ui';

interface DiscardTradedInModalProps {
  isOpen: boolean;
  items: DiscardPileItem[];
  onConfirm: () => void;
  onClose: () => void;
}

const DiscardTradedInModal: React.FC<DiscardTradedInModalProps> = ({
  isOpen,
  items,
  onConfirm,
  onClose,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Mark as Traded In'
      size='medium'
    >
      <p>
        Archive {items.length} record{items.length !== 1 ? 's' : ''} as traded
        in? Their data will be preserved locally.
      </p>
      <div className='bulk-traded-in-list'>
        {items.map(item => (
          <div key={item.id} className='bulk-traded-in-item'>
            {item.coverImage && (
              <img
                src={item.coverImage}
                alt=''
                className='bulk-traded-in-cover'
              />
            )}
            <span className='bulk-traded-in-label'>
              {item.artist} - {item.title}
            </span>
          </div>
        ))}
      </div>
      <ModalFooter>
        <button className='btn btn-secondary' onClick={onClose}>
          Cancel
        </button>
        <button className='btn btn-outline-warning' onClick={onConfirm}>
          Trade In {items.length} Record{items.length !== 1 ? 's' : ''}
        </button>
      </ModalFooter>
    </Modal>
  );
};

export default DiscardTradedInModal;
