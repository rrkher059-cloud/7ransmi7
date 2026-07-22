import DotField from './DotField';

export default function App() {
  return (
    <div style={{ position: 'relative', width: '100vw', minHeight: '100vh', backgroundColor: 'var(--bg-canvas)' }}>
      {/* Background Dot Field Container */}
      <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <DotField 
          dotRadius={1.5}
          dotSpacing={14}
          bulgeStrength={67}
          glowRadius={160}
          sparkle={false}
          waveAmplitude={0}
          cursorRadius={500}
          cursorForce={0.1}
          bulgeOnly
          gradientFrom="rgba(255, 145, 66, 0.35)"
          gradientTo="rgba(74, 71, 68, 0.25)"
          glowColor="rgba(255, 145, 66, 0.15)"
        />
      </div>

      {/* Main Twitter UI Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {/* Your navigation, feed, and sidebar go here */}
      </div>
    </div>
  );
}
