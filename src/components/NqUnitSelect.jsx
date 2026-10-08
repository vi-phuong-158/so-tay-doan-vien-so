import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { normalizeUnitSearch } from '../services/nqCompetitionService';

export function NqUnitSelect({ units, value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [index, setIndex] = useState(0);
  const button = useRef(null);
  const options = useMemo(() => units.filter((u) => normalizeUnitSearch(u.name)
    .includes(normalizeUnitSearch(search))), [units, search]);
  const selected = units.find((u) => u.id === value);
  function close() { setOpen(false); button.current?.focus(); }
  function select(unit) { onChange(unit.id); close(); }
  function move(next) {
    const bounded = Math.max(0, Math.min(next, options.length - 1));
    setIndex(bounded);
    document.getElementById(`nq-unit-option-${options[bounded]?.id}`)?.scrollIntoView({ block: 'nearest' });
  }
  return (
    <div className="nq-unit-select" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <label id="nq-unit-label" htmlFor="nq-unit-button">Xã / phường <span className="text-danger">*</span></label>
      <button type="button" id="nq-unit-button" ref={button} className="form-input nq-unit-trigger"
        disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls="nq-unit-options"
        onClick={() => { setOpen(!open); setSearch(''); setIndex(0); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setSearch(''); setIndex(0); setOpen(true);
          }
        }}>
        <span>{selected?.name || 'Chọn xã/phường'}</span><Icon name="chevron-down" size={18} />
      </button>
      {open && <div className="nq-unit-popup">
        <input autoFocus role="combobox" aria-label="Tìm tên xã/phường" placeholder="Tìm tên xã/phường..."
          aria-expanded="true" aria-autocomplete="list" aria-controls="nq-unit-options"
          aria-activedescendant={options[index] ? `nq-unit-option-${options[index].id}` : undefined}
          className="form-input" value={search} onChange={(event) => { setSearch(event.target.value); setIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key === 'ArrowDown') { event.preventDefault(); move(index + 1); }
            if (event.key === 'ArrowUp') { event.preventDefault(); move(index - 1); }
            if (event.key === 'Enter') { event.preventDefault(); if (options[index]) select(options[index]); }
          }} />
        <ul id="nq-unit-options" role="listbox" aria-labelledby="nq-unit-label">
          {options.map((unit, i) => <li key={unit.id} id={`nq-unit-option-${unit.id}`} role="option"
            aria-selected={unit.id === value} className={i === index ? 'focused' : ''}
            onMouseDown={(event) => event.preventDefault()} onClick={() => select(unit)}>{unit.name}</li>)}
        </ul>
        {options.length === 0 && <p role="status">Không tìm thấy xã/phường phù hợp.</p>}
      </div>}
    </div>
  );
}
