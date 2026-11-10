import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { AppTheme, ConnectionState } from '../../electron/types';
import bikiniBottomDayImg from '@/assets/bikini-bottom-day.webp';
import bikiniBottomSceneImg from '@/assets/bikini-bottom-scene.webp';
import spongebobSkyImg from '@/assets/spongebob-sky.webp';

interface BubbleBackgroundProps {
  theme: AppTheme;
  connectionState: ConnectionState;
}

const FLOWER_CLOUDS = [
  { id: 1, top: '8%', left: '8%', size: 78, colorDay: '#F472B6', colorNight: '#A855F7', dur: 14 },
  { id: 2, top: '14%', left: '42%', size: 58, colorDay: '#FDE047', colorNight: '#FACC15', dur: 18 },
  { id: 3, top: '7%', left: '72%', size: 84, colorDay: '#C084FC', colorNight: '#7E22CE', dur: 16 },
  { id: 4, top: '24%', left: '84%', size: 52, colorDay: '#6EE7B7', colorNight: '#22D3EE', dur: 13 },
  { id: 5, top: '22%', left: '22%', size: 46, colorDay: '#FDA4AF', colorNight: '#C084FC', dur: 19 },
];

export const BubbleBackground: React.FC<BubbleBackgroundProps> = ({ theme, connectionState }) => {
  const isConnected = connectionState === 'connected';
  const isDay = theme === 'bikinibottom';

  const bubbles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        left: `${(i * 5.7 + (i % 3) * 3.8) % 97}%`,
        size: 6 + (i % 4) * 5,
        duration: 10 + (i % 5) * 3.2,
        delay: (i * 0.85) % 9,
      })),
    [],
  );

  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden z-0 sponge-texture"
      style={{ backgroundImage: 'var(--glow-hero)' }}
    >
      {/* SpongeBob Iconic Sky overhead in Day Theme */}
      {isDay && (
        <img
          src={spongebobSkyImg}
          alt=""
          aria-hidden="true"
          draggable={false}
          className="absolute inset-x-0 top-0 h-[55%] w-full object-cover object-top transition-opacity duration-700"
          style={{
            opacity: isConnected ? 0.34 : 0.25,
            maskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,0.9), transparent)',
          }}
        />
      )}

      {/* Conch Street Houses backdrop (Sunny Day Houses vs Dark Night Houses) */}
      <img
        src={isDay ? bikiniBottomDayImg : bikiniBottomSceneImg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="absolute inset-0 w-full h-full object-cover object-bottom transition-all duration-700"
        style={{
          opacity: isDay ? (isConnected ? 0.38 : 0.28) : isConnected ? 0.16 : 0.1,
          filter: isDay ? 'saturate(1.18)' : 'saturate(1.12)',
        }}
      />

      {/* Contrast-preserving underwater atmospheric gradient */}
      <div
        className="absolute inset-0 transition-all duration-700"
        style={{
          background: isDay
            ? 'linear-gradient(180deg, rgba(2,132,199,0.34) 0%, rgba(3,105,161,0.52) 55%, rgba(4,47,78,0.72) 100%)'
            : 'radial-gradient(circle at 50% 35%, rgba(7,7,13,0.64) 0%, rgba(7,7,13,0.92) 100%)',
        }}
      />

      {/* SpongeBob Iconic Floating Flower Clouds in the Sky */}
      {FLOWER_CLOUDS.map((cloud) => (
        <svg
          key={cloud.id}
          viewBox="0 0 100 100"
          className="flower-cloud-anim absolute"
          style={{
            top: cloud.top,
            left: cloud.left,
            width: cloud.size,
            height: cloud.size,
            opacity: isDay ? 0.28 : 0.12,
            animationDuration: `${cloud.dur}s`,
          }}
        >
          <path
            d="M50,18 C58,4 74,10 68,28 C86,24 94,40 76,50 C94,60 86,78 68,72 C74,90 56,96 50,78 C44,96 26,90 32,72 C14,78 6,60 24,50 C6,40 14,24 32,28 C26,10 42,4 50,18 Z"
            fill="none"
            stroke={isDay ? cloud.colorDay : cloud.colorNight}
            strokeWidth="7"
            strokeLinejoin="round"
          />
          <circle
            cx="50"
            cy="50"
            r="9"
            fill="none"
            stroke={isDay ? cloud.colorDay : cloud.colorNight}
            strokeWidth="5"
          />
        </svg>
      ))}

      {/* Floating underwater bubbles */}
      {bubbles.map((b) => (
        <span
          key={b.id}
          className="bubble-anim absolute -bottom-10 rounded-full"
          style={{
            left: b.left,
            width: b.size,
            height: b.size,
            animationDuration: `${isConnected ? b.duration * 0.7 : b.duration}s`,
            animationDelay: `${b.delay}s`,
            border: isDay
              ? '1px solid rgba(255, 255, 255, 0.5)'
              : '1px solid rgba(168, 85, 247, 0.28)',
            background: isDay
              ? 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.42), rgba(56,189,248,0.14))'
              : 'radial-gradient(circle at 30% 30%, rgba(250,204,21,0.16), rgba(168,85,247,0.06))',
          }}
        />
      ))}

      {/* Drifting SVG Jellyfish */}
      <motion.svg
        width="64"
        height="72"
        viewBox="0 0 64 72"
        className="absolute top-20 left-10"
        style={{ opacity: isDay ? 0.34 : 0.22 }}
        animate={{
          y: [0, -16, 0],
          x: [0, 8, 0],
          rotate: [-3, 3, -3],
        }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path
          d="M12,30 C12,14 52,14 52,30 C52,36 44,35 40,33 C36,31 28,31 24,33 C20,35 12,36 12,30 Z"
          fill={isDay ? '#F472B6' : '#A855F7'}
        />
        <path
          d="M20,33 Q17,48 22,60 M32,33 Q35,50 30,65 M44,33 Q47,48 42,60"
          stroke={isDay ? '#FDE047' : '#FACC15'}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      </motion.svg>

      <motion.svg
        width="48"
        height="56"
        viewBox="0 0 64 72"
        className="absolute bottom-14 right-14"
        style={{ opacity: isDay ? 0.28 : 0.16 }}
        animate={{
          y: [0, -20, 0],
          x: [0, -10, 0],
          rotate: [4, -4, 4],
        }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      >
        <path
          d="M12,30 C12,14 52,14 52,30 C52,36 44,35 40,33 C36,31 28,31 24,33 C20,35 12,36 12,30 Z"
          fill={isDay ? '#FDE047' : '#C084FC'}
        />
        <path
          d="M20,33 Q17,48 22,60 M32,33 Q35,50 30,65 M44,33 Q47,48 42,60"
          stroke={isDay ? '#F472B6' : '#FACC15'}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      </motion.svg>
    </div>
  );
};
