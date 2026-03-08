import { Keyboard } from 'lucide-react';
import React from 'react';

import { KEYBOARD_SHORTCUTS } from '../hooks/useKeyboardShortcuts';

import { Modal } from './ui/Modal';

interface KeyboardShortcutsHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal overlay listing all registered keyboard shortcuts.
 * Opened by pressing `?` anywhere in the app (when not typing).
 */
const KeyboardShortcutsHelp: React.FC<KeyboardShortcutsHelpProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title='Keyboard Shortcuts'
      size='small'
    >
      <div className='keyboard-shortcuts-help'>
        <div className='keyboard-shortcuts-list'>
          {KEYBOARD_SHORTCUTS.map(shortcut => (
            <div key={shortcut.key} className='keyboard-shortcut-row'>
              <kbd className='keyboard-shortcut-key'>{shortcut.label}</kbd>
              <span className='keyboard-shortcut-description'>
                {shortcut.description}
              </span>
            </div>
          ))}
        </div>
        <p className='keyboard-shortcuts-note'>
          <Keyboard size={14} aria-hidden='true' /> Shortcuts are disabled when
          typing in input fields.
        </p>
      </div>
    </Modal>
  );
};

export default KeyboardShortcutsHelp;
