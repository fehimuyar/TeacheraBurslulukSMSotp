import { letterForIndex } from '../utils';

interface OptionButtonProps {
  index: number;
  label: string;
  selected: boolean;
  onSelect: () => void;
}

export function OptionButton({ index, label, selected, onSelect }: OptionButtonProps) {
  return (
    <button
      type="button"
      className={`te-option ${selected ? 'is-selected' : ''}`}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
    >
      <span className="te-option__badge">{letterForIndex(index)}</span>
      <span className="te-option__label">{label}</span>
    </button>
  );
}
