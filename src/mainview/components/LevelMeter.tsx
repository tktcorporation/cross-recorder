type Props = {
  level: number; // 0..1
};

export function LevelMeter({ level }: Props) {
  const percent = Math.round(level * 100);

  let colorClass: string;
  if (level < 0.6) {
    colorClass = "bg-green-500";
  } else if (level < 0.85) {
    colorClass = "bg-yellow-500";
  } else {
    colorClass = "bg-red-500";
  }

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
      <div
        className={`h-full rounded-full transition-[width] duration-75 ${colorClass}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
