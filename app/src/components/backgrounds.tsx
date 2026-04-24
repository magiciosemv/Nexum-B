/**
 * backgrounds.tsx — Animated canvas backgrounds
 *
 * SineWaveBackground: Purple 3D wave grid for landing page
 * WireframeBackground: Green scan-line grid for production views
 */

import React, { useEffect, useRef } from "react";

export function SineWaveBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let animationFrameId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    const cols = 100,
      rows = 45,
      spacing = 100,
      focalLength = 400;

    const draw = () => {
      ctx.fillStyle = "#08030c";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2,
        centerY = canvas.height / 2.5;
      const points: { px: number; py: number; scale: number }[][] = [];

      for (let z = 0; z < rows; z++) {
        const rowPoints: typeof points[0] = [];
        for (let x = 0; x < cols; x++) {
          const worldX = (x - cols / 2) * spacing;
          const worldZ = z * spacing;
          const yOffset =
            Math.sin(worldX * 0.002 + time) * 80 +
            Math.cos(worldZ * 0.003 + time * 0.6) * 60 +
            Math.sin((worldX + worldZ) * 0.0015 - time * 0.4) * 40;
          const worldY = yOffset + 180;
          const scale = focalLength / (focalLength + worldZ);
          rowPoints.push({
            px: centerX + worldX * scale,
            py: centerY + worldY * scale,
            scale,
          });
        }
        points.push(rowPoints);
      }

      ctx.lineWidth = 1;
      ctx.lineJoin = "round";
      for (let z = 0; z < rows - 1; z++) {
        for (let x = 0; x < cols - 1; x++) {
          const p00 = points[z][x],
            p10 = points[z + 1][x],
            p01 = points[z][x + 1],
            p11 = points[z + 1][x + 1];
          const alpha =
            Math.max(0, p00.scale * 2.0 - 0.1) *
            Math.pow(Math.sin((x / cols) * Math.PI), 0.8) *
            Math.min(1, z / 6);
          if (alpha <= 0.01) continue;
          ctx.strokeStyle = `rgba(110, 40, 160, ${alpha * 0.6})`;
          ctx.beginPath();
          ctx.moveTo(p00.px, p00.py);
          ctx.lineTo(p01.px, p01.py);
          ctx.lineTo(p10.px, p10.py);
          ctx.closePath();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p11.px, p11.py);
          ctx.lineTo(p10.px, p10.py);
          ctx.lineTo(p01.px, p01.py);
          ctx.closePath();
          ctx.stroke();
        }
      }
      time += 0.003;
      animationFrameId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none animate-fade-in"
    />
  );
}

export function WireframeBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", resize);
    resize();

    const draw = () => {
      ctx.fillStyle = "#020408";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1;
      const gridSize = 60;

      ctx.strokeStyle = "rgba(20, 241, 149, 0.03)";
      ctx.beginPath();
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();

      const scanlineY = (time * 2) % canvas.height;
      const gradient = ctx.createLinearGradient(0, scanlineY - 100, 0, scanlineY);
      gradient.addColorStop(0, "rgba(20, 241, 149, 0)");
      gradient.addColorStop(1, "rgba(20, 241, 149, 0.1)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, scanlineY - 100, canvas.width, 100);

      ctx.strokeStyle = "rgba(20, 241, 149, 0.3)";
      ctx.beginPath();
      ctx.moveTo(0, scanlineY);
      ctx.lineTo(canvas.width, scanlineY);
      ctx.stroke();

      time += 1;
      animationId = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none animate-fade-in"
    />
  );
}
