export function Button({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="btn" onClick={onClick} type="button">
      {label}
    </button>
  );
}
