import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { LIBRARY_DIR, toModuleName, validateModuleName } from '../../utils/spike/replLibrary.js';
import '../ModalBase.css';
import './Spike.css';

/**
 * "Save as Library": name the current code tab as a module and store it at
 * /flash/lib/<name>.py, importable from any SPIKE program.
 */
const SpikeLibraryModal = ({ visible, tabName, existing, saving, error, onSave, onClose }) => {
  const { t } = useLanguage();
  const [name, setName] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!visible) return undefined;
    setName(toModuleName(tabName));
    const timer = setTimeout(() => inputRef.current?.select(), 50);
    return () => clearTimeout(timer);
  }, [visible, tabName]);

  if (!visible) return null;

  const trimmed = name.trim();
  const problem = trimmed ? validateModuleName(trimmed) : 'empty';
  const replaces = !problem && existing?.includes(trimmed);
  const canSave = !problem && !saving && existing !== null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (canSave) onSave(trimmed);
  };

  return (
    <div className="modal-overlay" onClick={saving ? undefined : onClose}>
      <div className="modal-content spike-library-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('spikeSaveAsLibrary')}</h2>
        <p className="spike-library-description">{t('spikeLibraryDescription')}</p>

        <form onSubmit={handleSubmit}>
          <label className="spike-library-label" htmlFor="spike-library-name">{t('spikeLibraryName')}</label>
          <div className="spike-library-input-row">
            <span className="spike-library-prefix">{LIBRARY_DIR}/</span>
            <input
              id="spike-library-name"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              spellCheck={false}
              autoComplete="off"
            />
            <span className="spike-library-prefix">.py</span>
          </div>

          {problem === 'invalid' && <p className="spike-library-error">{t('spikeLibraryInvalidName')}</p>}
          {problem === 'reserved' && (
            <p className="spike-library-error">{t('spikeLibraryReservedName').replace('{name}', trimmed)}</p>
          )}
          {!problem && (
            <p className="spike-library-hint">
              {t('spikeLibraryUseWith')} <code>import {trimmed}</code>
            </p>
          )}
          {replaces && <p className="spike-library-warning">{t('spikeLibraryReplaces').replace('{name}', `${trimmed}.py`)}</p>}

          <div className="spike-library-existing">
            <span>{t('spikeLibraryOnHub')}</span>
            {existing === null ? (
              <em>{t('spikeLibraryLoading')}</em>
            ) : existing.length === 0 ? (
              <em>{t('spikeLibraryNone')}</em>
            ) : (
              existing.map((lib) => (
                <button
                  key={lib}
                  type="button"
                  className={`spike-library-chip${lib === trimmed ? ' active' : ''}`}
                  onClick={() => setName(lib)}
                  disabled={saving}
                >
                  {lib}
                </button>
              ))
            )}
          </div>

          {error && <p className="spike-library-error">{error}</p>}

          <div className="spike-library-actions">
            <button type="button" className="spike-library-cancel" onClick={onClose} disabled={saving}>
              {t('cancel')}
            </button>
            <button type="submit" className="modal-close-button" disabled={!canSave}>
              {saving ? t('saving') : t('spikeSaveToHub')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SpikeLibraryModal;
