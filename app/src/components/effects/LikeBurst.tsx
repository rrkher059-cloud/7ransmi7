import './LikeBurst.css'

type LikeBurstProps = {
  burstKey: number
}

const SHARDS = [
  { x: -28, y: -34, rot: -28, delay: 0 },
  { x: 22, y: -38, rot: 18, delay: 20 },
  { x: -36, y: 8, rot: -52, delay: 40 },
  { x: 34, y: 4, rot: 42, delay: 30 },
  { x: -12, y: 32, rot: -12, delay: 50 },
  { x: 14, y: 36, rot: 24, delay: 15 },
  { x: 0, y: -44, rot: 6, delay: 10 },
  { x: -24, y: -8, rot: -70, delay: 35 },
]

/** Short shatter burst played when a post is liked. */
export function LikeBurst({ burstKey }: LikeBurstProps) {
  if (burstKey === 0) return null

  return (
    <span className="like-burst" aria-hidden key={burstKey}>
      {SHARDS.map((shard, index) => (
        <span
          key={`${burstKey}-${index}`}
          className="like-burst-shard"
          style={{
            ['--bx' as string]: `${shard.x}px`,
            ['--by' as string]: `${shard.y}px`,
            ['--rot' as string]: `${shard.rot}deg`,
            animationDelay: `${shard.delay}ms`,
          }}
        />
      ))}
      <span className="like-burst-core" />
    </span>
  )
}
