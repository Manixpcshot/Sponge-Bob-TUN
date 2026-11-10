import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AppTheme, ConnectionState } from '../../electron/types';
import bikiniBottomSceneImg from '@/assets/bikini-bottom-scene.webp';

interface BubbleBackgroundProps {
  theme: AppTheme;
  connectionState: ConnectionState;
}

export const BubbleBackground: React.FC<BubbleBackgroundProps> = ({ theme, connectionState }) => {
  const isConnected = connectionState === 'connected';
  const bubbles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: `${(i * 6.3 + (i % 3) * 4) % 96}%`,
        size: 6 + (i % 4) * 5,
        duration: 11 + (i % 5) * 3.5,
        delay: (i * 0.9) % 10,
      })),
    [],
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden z-0 sponge-texture"
      style={{ backgroundImage: 'var(--glow-hero)' }}
    >
      {/* Subtle underwater Bikini Bottom Conch Street backdrop */}
      <img
        src={bikiniBottomSceneImg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover object-bottom transition-opacity duration-700"
        style={{
          opacity: theme === 'bikinibottom' ? (isConnected ? 0.22 : 0.16) : isConnected ? 0.14 : 0.09,
          filter: 'saturate(1.15)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            theme === 'bikinibottom'
              ? 'radial-gradient(circle at 50% 35%, rgba(31,13,56,0.58) 0%, rgba(19,6,38,0.88) 100%)'
              : 'radial-gradient(circle at 50% 35%, rgba(7,7,13,0.68) 0%, rgba(7,7,13,0.92) 100%)',
        }}
      />

      {/* Floating underwater bubbles */}
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="bubble-anim absolute -bottom-10 rounded-full"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animationDuration: `${isConnected ? b.duration * 0.72 : b.duration}s`,
            animationDelay: `${b.delay}s`,
            border:
              theme === 'bikinibottom'
                ? '1px solid rgba(253, 224, 71, 0.35)'
                : '1px solid rgba(168, 85, 247, 0.25)',
            background:
              theme === 'bikinibottom'
                ? 'radial-gradient(circle at 30% 30%, rgba(253,224,71,0.28), rgba(168,85,247,0.08))'
                : 'radial-gradient(circle at 30% 30%, rgba(250,204,21,0.16), rgba(168,85,247,0.05))',
          }}
        />
      ))}

      {/* Subtle ambient drifting SVG Jellyfish */}
      <motion.svg
        width="64"
        height="72"
        viewBox="0 0 64 72"
        className="absolute top-20 left-10 opacity-20"
        animate={{
          y: [0, -16, 0],
          x: [0, 8, 0],
          rotate: [-3, 3, -3],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M12,30 C12,14 52,14 52,30 C52,36 44,35 40,33 C36,31 28,31 24,33 C20,35 12,36 12,30 Z"
          fill={theme === 'bikinibottom' ? '#FDE047' : '#A855F7'}
        />
        <path
          d="M20,33 Q17,48 22,60 M32,33 Q35,50 30,65 M44,33 Q47,48 42,60"
          stroke={theme === 'bikinibottom' ? '#C084FC' : '#FACC15'}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      </motion.svg>

      <motion.svg
        width="48"
        height="56"
        viewBox="0 0 64 72"
        className="absolute bottom-14 right-14 opacity-15"
        animate={{
          y: [0, -20, 0],
          x: [0, -10, 0],
          rotate: [4, -4, 4],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      >
        <path
          d="M12,30 C12,14 52,14 52,30 C52,36 44,35 40,33 C36,31 28,31 24,33 C20,35 12,36 12,30 Z"
          fill="#C084FC"
        />
        <path
          d="M20,33 Q17,48 22,60 M32,33 Q35,50 30,65 M44,33 Q47,48 42,60"
          stroke="#FACC15"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      </motion.svg>
    </div>
  );
};
