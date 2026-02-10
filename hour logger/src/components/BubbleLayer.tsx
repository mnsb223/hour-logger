// src/components/BubbleLayer.tsx
export default function BubbleLayer() {
  return (
    <div className="bubble-layer" aria-hidden="true">
      <ul className="bubble">
        {Array.from({ length: 21 }).map((_, i) => (
          <li key={i} />
        ))}
      </ul>
    </div>
  )
}
