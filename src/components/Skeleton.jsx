const shimmer = {
  background: 'linear-gradient(90deg, var(--surface-2) 25%, var(--surface) 50%, var(--surface-2) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.5s infinite',
  borderRadius: 10,
};

export default function Skeleton({ lines = 4, style }) {
  return (
    <div style={{ padding: '16px 0', ...style }}>
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          style={{
            ...shimmer,
            height: i === 0 ? 20 : 14,
            width: i === lines - 1 ? '60%' : '100%',
            marginBottom: 10,
          }}
        />
      ))}
    </div>
  );
}
