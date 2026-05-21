interface HintChipsProps {
  chips: string[];
  onClick: (chip: string) => void;
}

/** 칩 클릭 = 그 텍스트를 사용자 메시지로 즉시 전송 (composer 에 채우는 게 아님). */
export function HintChips({ chips, onClick }: HintChipsProps) {
  if (chips.length === 0) return null;
  return (
    <div className="composer-hints">
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          className="hint-chip"
          onClick={() => onClick(chip)}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
