
import React, { useRef, useEffect } from 'react';
import { EmotionType } from '../types';
import { EMOTION_COLORS } from '../constants';

interface SifAvatarProps {
  dominantEmotion: EmotionType;
  thought: string | null;
  intensity: number;
  audioLevel: number; // 0 - 255
  isThinking?: boolean;
}

// Particle Class
class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  baseX: number;
  baseY: number;
  angle: number;
  orbitRadius: number;

  constructor(w: number, h: number, color: string) {
    this.baseX = w / 2;
    this.baseY = h / 2;
    // Initial random position near center
    this.x = this.baseX + (Math.random() - 0.5) * 50;
    this.y = this.baseY + (Math.random() - 0.5) * 50;
    this.vx = (Math.random() - 0.5) * 2;
    this.vy = (Math.random() - 0.5) * 2;
    this.life = 0;
    this.maxLife = 100 + Math.random() * 100;
    this.size = Math.random() * 2 + 1;
    this.color = color;
    
    // Orbital mechanics for "thinking" or "magic" feel
    this.angle = Math.random() * Math.PI * 2;
    this.orbitRadius = 50 + Math.random() * 100;
  }

  update(
    emotion: EmotionType, 
    audioBoost: number, 
    width: number, 
    height: number,
    intensity: number,
    isThinking: boolean
  ) {
    this.life++;
    
    // Base Speed
    const speedMultiplier = 1 + (intensity / 50) + (audioBoost / 20);
    
    if (isThinking) {
        // High speed orbital spin when thinking
        this.angle += 0.1 * speedMultiplier;
        this.x = this.baseX + Math.cos(this.angle) * this.orbitRadius;
        this.y = this.baseY + Math.sin(this.angle) * (this.orbitRadius * 0.5); // Elliptical
        this.size = Math.random() * 3 + 1; // Flicker size
        return;
    }

    switch (emotion) {
      case EmotionType.Joy:
        // Expanding, spinning outward like sun rays
        this.angle += 0.02 * speedMultiplier;
        const r = this.orbitRadius + Math.sin(this.life * 0.05) * 20;
        this.x = this.baseX + Math.cos(this.angle) * r;
        this.y = this.baseY + Math.sin(this.angle) * r;
        break;
        
      case EmotionType.Sadness:
        // Falling down slowly like rain/tears
        this.y += 0.5 * speedMultiplier;
        this.x += Math.sin(this.life * 0.05) * 0.5; // Slight wave
        if (this.y > height / 2 + 150) this.life = this.maxLife; 
        break;
        
      case EmotionType.Anger:
        // Erratic, shaking, spikey
        this.x += (Math.random() - 0.5) * 10 * speedMultiplier;
        this.y += (Math.random() - 0.5) * 10 * speedMultiplier;
        // Strong elastic pull back to center
        this.x += (this.baseX - this.x) * 0.15;
        this.y += (this.baseY - this.y) * 0.15;
        break;
        
      case EmotionType.Curiosity:
        // Complex geometric orbits (Lissajous-like)
        this.angle += 0.03 * speedMultiplier;
        this.x = this.baseX + Math.sin(this.angle) * this.orbitRadius;
        this.y = this.baseY + Math.cos(this.angle * 1.5) * this.orbitRadius;
        break;
        
      case EmotionType.Fear:
        // Tight, fast vibration near core
        this.x = this.baseX + (Math.random() - 0.5) * 40;
        this.y = this.baseY + (Math.random() - 0.5) * 40;
        break;

      default:
        // Gentle floating
        this.x += this.vx * 0.5;
        this.y += this.vy * 0.5;
        // Boundary check (soft return)
        const dx = this.x - this.baseX;
        const dy = this.y - this.baseY;
        if (dx*dx + dy*dy > 150*150) {
            this.vx *= -1;
            this.vy *= -1;
        }
        break;
    }

    // Audio Reaction (Pulse size)
    this.size = (Math.random() * 2 + 1) * (1 + audioBoost / 30);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    // Fade out based on life
    const alpha = 1 - (this.life / this.maxLife);
    ctx.globalAlpha = Math.max(0, alpha);
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }
}

export const SifAvatar: React.FC<SifAvatarProps> = ({ dominantEmotion, thought, intensity, audioLevel, isThinking = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const requestRef = useRef<number>(0);
  const emotionColor = EMOTION_COLORS[dominantEmotion];
  const emeraldEyeColor = '#10b981'; // Emerald 500 - representing her green eyes

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize handling
    const resize = () => {
      canvas.width = canvas.parentElement?.clientWidth || 400;
      canvas.height = canvas.parentElement?.clientHeight || 400;
      // Re-center particles if resized
      particlesRef.current.forEach(p => {
          p.baseX = canvas.width / 2;
          p.baseY = canvas.height / 2;
      });
    };
    window.addEventListener('resize', resize);
    resize();

    const animate = () => {
      // Clear with trail for motion blur effect
      ctx.fillStyle = 'rgba(15, 23, 42, 0.2)'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // --- 1. Draw Emerald Core ("The Soul") ---
      // This represents Sif herself, regardless of emotion
      const baseCoreSize = 30 + (audioLevel / 3);
      
      // Outer Glow (Emotion)
      const emotionGradient = ctx.createRadialGradient(centerX, centerY, baseCoreSize, centerX, centerY, baseCoreSize * 4);
      emotionGradient.addColorStop(0, `${emotionColor}66`); // Semi-transparent emotion
      emotionGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = emotionGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseCoreSize * 4, 0, Math.PI * 2);
      ctx.fill();

      // Inner Core (Emerald/Green Eyes)
      // Pulse the core when thinking
      const corePulse = isThinking ? Math.sin(Date.now() / 100) * 5 : 0;
      const coreGradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseCoreSize + corePulse);
      coreGradient.addColorStop(0, '#ecfdf5'); // White center
      coreGradient.addColorStop(0.4, emeraldEyeColor); // Emerald
      coreGradient.addColorStop(1, 'transparent');
      
      ctx.fillStyle = coreGradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseCoreSize + corePulse, 0, Math.PI * 2);
      ctx.fill();
      
      // --- 2. Particle System (Aura/Hair/Magic) ---
      const targetParticleCount = 200 + Math.floor(intensity * 1.5);
      
      // Spawn logic
      if (particlesRef.current.length < targetParticleCount) {
        // Mix of emotion color and emerald sparks
        const pColor = Math.random() > 0.8 ? '#34d399' : emotionColor; 
        particlesRef.current.push(new Particle(canvas.width, canvas.height, pColor));
      }

      // Update & Draw
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.update(dominantEmotion, audioLevel, canvas.width, canvas.height, intensity, isThinking);
        p.draw(ctx);
        
        // Reset/Kill
        if (p.life >= p.maxLife) {
          particlesRef.current.splice(i, 1);
        }
      }

      // --- 3. Thinking Indicator Ring ---
      if (isThinking) {
          ctx.strokeStyle = '#fbbf24'; // Amber ring for processing
          ctx.lineWidth = 2;
          ctx.beginPath();
          const ringRadius = 120;
          // Rotating arc
          const time = Date.now() / 200;
          ctx.arc(centerX, centerY, ringRadius, time, time + Math.PI);
          ctx.stroke();
          
          ctx.strokeStyle = '#10b981'; // Emerald ring
          ctx.beginPath();
          ctx.arc(centerX, centerY, ringRadius - 10, -time, -time + Math.PI);
          ctx.stroke();
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(requestRef.current);
    };
  }, [dominantEmotion, emotionColor, intensity, audioLevel, isThinking]); 

  return (
    <div className="relative flex items-center justify-center w-full h-96">
      
      {/* Thought Bubble */}
      {thought && (
        <div className="absolute top-4 z-20 animate-float pointer-events-none">
          <div 
            className="relative bg-white/10 backdrop-blur-md border border-white/20 text-white px-6 py-4 rounded-2xl max-w-xs text-center shadow-[0_0_30px_rgba(255,255,255,0.1)]"
            style={{ borderColor: `${emotionColor}44`, boxShadow: `0 0 20px ${emotionColor}22` }}
          >
            <p className="text-lg italic font-light">"{thought}"</p>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white/10 border-r border-b border-white/20 rotate-45 transform"></div>
          </div>
        </div>
      )}

      {/* The Canvas Core */}
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};
