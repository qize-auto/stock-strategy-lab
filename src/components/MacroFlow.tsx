import { useRef, useEffect } from 'react';

interface Particle {
  x: number;
  y: number;
  length: number;
  baseSpeed: number;
  direction: number;
  width: number;
  color: string;
}

export default function MacroFlow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const mouse = { x: -9999, y: -9999 };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleMouseLeave);

    let canvasWidth = 0;
    let canvasHeight = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvasWidth = window.innerWidth;
      canvasHeight = window.innerHeight;
      canvas.width = canvasWidth * dpr;
      canvas.height = canvasHeight * dpr;
      canvas.style.width = canvasWidth + 'px';
      canvas.style.height = canvasHeight + 'px';
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const colors = [
      '30, 40, 60',
      '50, 60, 80',
      '20, 30, 50',
      '40, 50, 70',
      '0, 255, 148',
      '60, 70, 90',
    ];

    const particles: Particle[] = [];
    const particleCount = 500;

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * canvasWidth,
        y: Math.random() * canvasHeight,
        length: Math.random() * 80 + 20,
        baseSpeed: Math.random() * 0.8 + 0.2,
        direction: Math.random() > 0.5 ? 1 : -1,
        width: Math.random() * 1.5 + 0.3,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    const animate = () => {
      time += 1;
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      // Fill background
      ctx.fillStyle = '#0B0C10';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Sine flow mechanics
        const speed = Math.sin(p.y * 0.005 + time * 0.002) * 2 + 1;
        p.x += (p.baseSpeed + speed) * p.direction;

        // Mouse repulsion
        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200) {
          p.x += (dx / dist) * (200 - dist) * 0.05;
          p.y += (dy / dist) * (200 - dist) * 0.05;
        }

        // Wrap around
        if (p.direction === 1 && p.x > canvasWidth) {
          p.x = -p.length;
        } else if (p.direction === -1 && p.x < -p.length) {
          p.x = canvasWidth;
        }

        // Draw with alpha dispersion
        const startAlpha = Math.random() > 0.98 ? 0.8 : 0.3;
        const gradient = ctx.createLinearGradient(
          p.x,
          p.y,
          p.x - p.length * p.direction,
          p.y
        );
        gradient.addColorStop(0, `rgba(${p.color}, ${startAlpha})`);
        gradient.addColorStop(1, `rgba(${p.color}, 0)`);

        ctx.strokeStyle = gradient;
        ctx.lineWidth = p.width;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.length * p.direction, p.y);
        ctx.stroke();
      }

      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 1,
      }}
    />
  );
}
