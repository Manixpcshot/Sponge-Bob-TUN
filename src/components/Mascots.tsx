import React from 'react';
import { motion } from 'framer-motion';
import type { ConnectionState } from '../../electron/types';
import spongeDefaultImg from '@/assets/sponge-mascot.webp';
import crabDefaultImg from '@/assets/crab-mascot.webp';
import pineappleHouseImg from '@/assets/pineapple-house.webp';
import squidwardMascotImg from '@/assets/squidward-mascot.webp';
import krustyKrabImg from '@/assets/krusty-krab.webp';
import patrickMascotImg from '@/assets/patrick-mascot.webp';
import bikiniBottomSceneImg from '@/assets/bikini-bottom-scene.webp';

export {
  spongeDefaultImg,
  crabDefaultImg,
  pineappleHouseImg,
  squidwardMascotImg,
  krustyKrabImg,
  patrickMascotImg,
  bikiniBottomSceneImg,
};

export interface BikiniBottomArtworkItem {
  id: 'sponge' | 'pineapple' | 'squidward' | 'crab' | 'krusty' | 'patrick' | 'panorama';
  src: string;
}

export const BIKINI_BOTTOM_ARTWORK: BikiniBottomArtworkItem[] = [
  { id: 'pineapple', src: pineappleHouseImg },
  { id: 'sponge', src: spongeDefaultImg },
  { id: 'squidward', src: squidwardMascotImg },
  { id: 'krusty', src: krustyKrabImg },
  { id: 'crab', src: crabDefaultImg },
  { id: 'patrick', src: patrickMascotImg },
  { id: 'panorama', src: bikiniBottomSceneImg },
];

interface SpongeMascotProps {
  connectionState: ConnectionState;
  customImageUrl?: string | null;
}

export const SpongeMascot: React.FC<SpongeMascotProps> = ({
  connectionState,
  customImageUrl,
}) => {
  const isConnected = connectionState === 'connected';
  const isConnecting = connectionState === 'connecting' || connectionState === 'reconnecting';
  const isError = connectionState === 'error';

  const imgSrc = customImageUrl || spongeDefaultImg;

  return (
    <div className="relative flex items-center justify-center w-36 h-36 shrink-0">
      {/* Outer energy ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: isConnected
            ? 'conic-gradient(from 0deg, #FACC15, #A855F7, #22D3EE, #FACC15)'
            : isConnecting
              ? 'conic-gradient(from 0deg, #FACC15, transparent 40%, #A855F7, transparent 80%)'
              : isError
                ? 'conic-gradient(from 0deg, #EF4444, #F59E0B, #EF4444)'
                : 'conic-gradient(from 0deg, rgba(168,85,247,0.45), rgba(250,204,21,0.35), rgba(168,85,247,0.45))',
          padding: 3,
        }}
        animate={{
          rotate: isConnecting ? 360 : isConnected ? [0, 360] : 0,
          scale: isConnected ? [1, 1.04, 1] : 1,
        }}
        transition={{
          rotate: {
            duration: isConnecting ? 1.4 : 10,
            repeat: isConnecting || isConnected ? Infinity : 0,
            ease: 'linear',
          },
          scale: {
            duration: 2.6,
            repeat: isConnected ? Infinity : 0,
            ease: 'easeInOut',
          },
        }}
      >
        <div
          className="w-full h-full rounded-full"
          style={{ backgroundColor: 'var(--bg-surface-strong)' }}
        />
      </motion.div>

      {/* Ambient glow */}
      {isConnected && (
        <motion.div
          className="absolute inset-2 rounded-full blur-xl pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, rgba(250,204,21,0.42) 0%, rgba(168,85,247,0.38) 65%, transparent 100%)',
          }}
          animate={{ opacity: [0.55, 0.95, 0.55], scale: [0.95, 1.08, 0.95] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Mascot portrait */}
      <motion.div
        className="relative w-32 h-32 rounded-full overflow-hidden ring-2 ring-white/15 shadow-2xl"
        animate={
          isConnecting
            ? { y: [-3, 3, -3], scale: [0.98, 1.03, 0.98] }
            : isConnected
              ? { y: [-4, 2, -4], rotate: [-1.5, 1.5, -1.5] }
              : isError
                ? { x: [-3, 3, -3, 3, 0] }
                : { y: [0, -3, 0] }
        }
        transition={{
          duration: isConnecting ? 0.9 : isError ? 0.45 : 3.4,
          repeat: isError ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      >
        <img
          src={imgSrc}
          alt="Sponge bob tun mascot"
          className="w-full h-full object-cover"
          draggable={false}
        />
      </motion.div>

      {/* Orbiting animated jellyfish badge when connected */}
      {isConnected && (
        <motion.div
          className="absolute -top-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #7E22CE, #A855F7)',
            border: '2px solid #FDE047',
          }}
          animate={{ y: [-4, 4, -4], rotate: [-8, 8, -8] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12C5 7.5 19 7.5 19 12C19 13.8 16.5 13.8 15 13C13.5 12.2 10.5 12.2 9 13C7.5 13.8 5 13.8 5 12Z"
              fill="#FDE047"
            />
            <path
              d="M8 13.5C7.5 16.5 8.5 18.5 8 20M12 13.5C12.5 16.5 11.5 19 12 21M16 13.5C16.5 16.5 15.5 18.5 16 20"
              stroke="#FEF08A"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </motion.div>
      )}
    </div>
  );
};

interface CrabMascotProps {
  isAlert: boolean;
  customImageUrl?: string | null;
}

export const CrabMascot: React.FC<CrabMascotProps> = ({ isAlert, customImageUrl }) => {
  const imgSrc = customImageUrl || crabDefaultImg;

  return (
    <div className="relative w-16 h-16 shrink-0">
      <motion.div
        className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg"
        style={{
          border: isAlert ? '2px solid #F59E0B' : '2px solid rgba(250, 204, 21, 0.45)',
          boxShadow: isAlert ? '0 0 20px rgba(245, 158, 11, 0.45)' : '0 0 14px rgba(168, 85, 247, 0.28)',
        }}
        animate={
          isAlert
            ? { rotate: [-4, 4, -4, 4, 0], scale: [1, 1.05, 1] }
            : { y: [0, -3, 0] }
        }
        transition={{
          duration: isAlert ? 1.1 : 3.2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <img
          src={imgSrc}
          alt="Mr. Krabs Quota Guard"
          className="w-full h-full object-cover"
          draggable={false}
        />
      </motion.div>

      {/* Alert badge */}
      {isAlert && (
        <motion.span
          className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-amber-400 text-black font-extrabold text-xs flex items-center justify-center shadow-md ring-2 ring-black/40"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 0.9, repeat: Infinity }}
        >
          !
        </motion.span>
      )}
    </div>
  );
};

export const SquidwardMascot: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dim = size === 'lg' ? 'w-20 h-20' : size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';
  return (
    <motion.div
      className={`${dim} rounded-2xl overflow-hidden shrink-0 shadow-lg`}
      style={{
        border: '2px solid rgba(168, 85, 247, 0.5)',
        boxShadow: '0 0 18px rgba(168, 85, 247, 0.28)',
      }}
      animate={{ y: [0, -3, 0] }}
      transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
    >
      <img
        src={squidwardMascotImg}
        alt="Squidward Tentacles"
        className="w-full h-full object-cover object-center"
        draggable={false}
      />
    </motion.div>
  );
};

export const PatrickMascot: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dim = size === 'lg' ? 'w-24 h-24' : size === 'sm' ? 'w-12 h-12' : 'w-16 h-16';
  return (
    <motion.div
      className={`${dim} rounded-2xl overflow-hidden shrink-0 shadow-lg`}
      style={{
        border: '2px solid rgba(250, 204, 21, 0.45)',
        boxShadow: '0 0 18px rgba(250, 204, 21, 0.24)',
      }}
      animate={{ y: [0, -3, 0], rotate: [-1, 1, -1] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
    >
      <img
        src={patrickMascotImg}
        alt="Patrick Star"
        className="w-full h-full object-cover object-center"
        draggable={false}
      />
    </motion.div>
  );
};
