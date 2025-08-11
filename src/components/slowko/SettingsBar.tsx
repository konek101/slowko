interface SettingsBarProps {
  length: number;
  attempts: number;
  onChange: (data: { length?: number; attempts?: number }) => void;
}

export default function SettingsBar({ length, attempts, onChange }: SettingsBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 md:gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="length" className="text-sm text-muted-foreground">Długość</label>
        <select
          id="length"
          className="kbd"
          value={length}
          onChange={(e) => onChange({ length: Number(e.target.value) })}
        >
          {Array.from({ length: 14 }).map((_, i) => {
            const val = i + 2;
            return (
              <option key={val} value={val}>{val}</option>
            );
          })}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor="attempts" className="text-sm text-muted-foreground">Próby</label>
        <select
          id="attempts"
          className="kbd"
          value={attempts}
          onChange={(e) => onChange({ attempts: Number(e.target.value) })}
        >
          {Array.from({ length: 10 }).map((_, i) => {
            const val = i + 3; // 3..12
            return (
              <option key={val} value={val}>{val}</option>
            );
          })}
        </select>
      </div>
    </div>
  );
}
